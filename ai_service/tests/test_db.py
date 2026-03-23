import pytest

import db


class _FakeCursor:
    def __init__(self, rows: list[tuple[int, float, float, float, float]]) -> None:
        self.rows = rows
        self.executions = 0
        self.closed = False

    def execute(self, _query: str, _params: tuple[int]) -> None:
        self.executions += 1

    def fetchall(self) -> list[tuple[int, float, float, float, float]]:
        return self.rows

    def close(self) -> None:
        self.closed = True


class _FakeConnection:
    def __init__(self, rows: list[tuple[int, float, float, float, float]]) -> None:
        self.cursor_obj = _FakeCursor(rows)
        self.closed = False

    def cursor(self) -> _FakeCursor:
        return self.cursor_obj

    def close(self) -> None:
        self.closed = True


@pytest.mark.integration
def test_get_spot_coordinates_uses_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [(1, 1.0, 2.0, 3.0, 4.0)]
    conn = _FakeConnection(rows)
    connect_calls = {"count": 0}

    def _fake_connect(_url: str) -> _FakeConnection:
        connect_calls["count"] += 1
        return conn

    db.clear_cache()
    monkeypatch.setattr(db.psycopg2, "connect", _fake_connect)

    first = db.get_spot_coordinates(123)
    second = db.get_spot_coordinates(123)

    assert first == second == [{"id": 1, "x1": 1.0, "y1": 2.0, "x2": 3.0, "y2": 4.0}]
    assert connect_calls["count"] == 1
    assert conn.cursor_obj.closed is True
    assert conn.closed is True
