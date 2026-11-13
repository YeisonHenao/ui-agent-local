from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExecutionStatus(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    RUNNING = "RUNNING"


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, default="", nullable=False)
    ollama_model: Mapped[str] = mapped_column(String(160), default="qwen2.5:3b", nullable=False)
    script_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    tools_config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    executions: Mapped[list["ExecutionLog"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )


class ExecutionLog(Base):
    __tablename__ = "execution_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[ExecutionStatus] = mapped_column(
        SqlEnum(ExecutionStatus, native_enum=False), default=ExecutionStatus.RUNNING, nullable=False
    )
    output_stream: Mapped[str] = mapped_column(Text, default="", nullable=False)
    execution_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    agent: Mapped[Agent] = relationship(back_populates="executions")
