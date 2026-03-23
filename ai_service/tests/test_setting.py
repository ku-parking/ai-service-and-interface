import pytest

from setting import get_settings


@pytest.mark.unit
def test_get_settings_reads_environment() -> None:
    get_settings.cache_clear()
    settings = get_settings()

    assert settings.database_url.startswith("postgresql://")
    assert settings.redis_url.startswith("redis://")
    assert settings.redis_occupancy_ttl_seconds == 60
    assert settings.cache_ttl_seconds == 300
