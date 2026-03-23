from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main


def _image_bytes() -> bytes:
    image = Image.new("RGB", (8, 8), color="black")
    buffer = BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.mark.integration
def test_root_returns_message() -> None:
    client = TestClient(main.app)
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "KU PARKING SPOT MANAGEMENT SYSTEM"}


@pytest.mark.integration
def test_init_returns_spots(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        main,
        "_detect_parking_spots",
        lambda _img: [{"name": "parking_spot", "class": 0, "confidence": 0.9}],
    )

    client = TestClient(main.app)
    response = client.post(
        "/init",
        files={"frame": ("frame.jpg", _image_bytes(), "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["spots"][0]["name"] == "parking_spot"


@pytest.mark.integration
def test_frame_returns_occupancy_and_caches(monkeypatch: pytest.MonkeyPatch) -> None:
    redis_calls: list[tuple[str, str, int]] = []

    class _FakeRedis:
        def set(self, key: str, value: str, ex: int) -> None:
            redis_calls.append((key, value, ex))

    monkeypatch.setattr(main, "_detect_cars", lambda _img: [{"box": {"x1": 1, "y1": 1, "x2": 5, "y2": 5}}])
    monkeypatch.setattr(main, "get_spot_coordinates", lambda _id: [{"id": 11, "x1": 1, "y1": 1, "x2": 5, "y2": 5}])
    monkeypatch.setattr(main, "check_occupancy", lambda _spots, _cars: [{"id": 11, "x1": 1, "y1": 1, "x2": 5, "y2": 5, "occupied": True}])
    monkeypatch.setattr(main, "get_redis", lambda: _FakeRedis())

    client = TestClient(main.app)
    response = client.post(
        "/frame",
        files={"frame": ("frame.jpg", _image_bytes(), "image/jpeg")},
        data={"parking_spot_id": "44"},
    )

    payload = response.json()
    assert response.status_code == 200
    assert payload["total"] == 1
    assert payload["occupied"] == 1
    assert payload["available"] == 0
    assert len(redis_calls) == 1
    assert redis_calls[0][0] == "occupancy:44"


@pytest.mark.integration
def test_init_returns_500_on_prediction_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(_img):
        raise RuntimeError("boom")

    monkeypatch.setattr(main, "_detect_parking_spots", _raise)
    client = TestClient(main.app)
    response = client.post(
        "/init",
        files={"frame": ("frame.jpg", _image_bytes(), "image/jpeg")},
    )
    assert response.status_code == 500
    assert response.json()["detail"] == "boom"
