import redis
from setting import get_settings
_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            get_settings().redis_url,
            decode_responses=True,
        )
    return _client


def reset_redis_client() -> None:
    global _client
    _client = None
