from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./data/agents.db"
    ollama_base_url: str = "http://localhost:11434"
    agent_scripts_dir: Path = BACKEND_DIR / "agent_scripts"
    frontend_origin: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def scripts_root(self) -> Path:
        path = self.agent_scripts_dir
        if not path.is_absolute():
            path = BACKEND_DIR / path
        return path.resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
