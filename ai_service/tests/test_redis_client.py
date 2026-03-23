import pytest

import redis_client


class _DummyRedis:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def set(self, key: str, value: str, ex: int) -> None:
        self.calls.append((key, {"value": value, "ex": ex}))


@pytest.mark.unit
def test_get_redis_returns_singleton(monkeypatch: pytest.MonkeyPatch) -> None:
    created: list[_DummyRedis] = []

    def _fake_from_url(*_args, **_kwargs) -> _DummyRedis:
        client = _DummyRedis()
        created.append(client)
        return client

    redis_client.reset_redis_client()
    monkeypatch.setattr(redis_client.redis.Redis, "from_url", _fake_from_url)

    first = redis_client.get_redis()
    second = redis_client.get_redis()

    assert first is second
    assert len(created) == 1
