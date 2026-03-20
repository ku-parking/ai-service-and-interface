from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    allow_origins: list[str]
    allow_methods: list[str]
    allow_headers: list[str]
    database_url: str
    redis_url: str
    redis_occupancy_ttl_seconds: int
    cache_ttl_seconds: int
    iou_threshold: float


    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

@lru_cache
def get_settings():
    return Settings()