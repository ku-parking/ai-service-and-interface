from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    allow_origins: list[str]
    allow_methods: list[str]
    allow_headers: list[str]
    
    model_config = SettingsConfigDict(env_file=".env")