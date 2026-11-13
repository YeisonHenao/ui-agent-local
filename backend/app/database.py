from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_directory(database_url: str) -> None:
    prefix = "sqlite+aiosqlite:///"
    if not database_url.startswith(prefix):
        return
    database_path = database_url.removeprefix(prefix)
    if database_path != ":memory:" and not database_path.startswith("file:"):
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)


_database_url = get_settings().database_url
_ensure_sqlite_directory(_database_url)
engine = create_async_engine(_database_url, connect_args={"check_same_thread": False})
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
