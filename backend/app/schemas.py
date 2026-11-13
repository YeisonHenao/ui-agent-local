from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import ExecutionStatus


class AgentBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    system_prompt: str = ""
    ollama_model: str = Field(default="qwen2.5:3b", min_length=1, max_length=160)
    script_path: str = Field(min_length=1, max_length=1024)
    tools_config: dict[str, Any] = Field(default_factory=dict)


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    system_prompt: str | None = None
    ollama_model: str | None = Field(default=None, min_length=1, max_length=160)
    script_path: str | None = Field(default=None, min_length=1, max_length=1024)
    tools_config: dict[str, Any] | None = None


class AgentRead(AgentBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExecutionRead(BaseModel):
    id: int
    agent_id: int
    status: ExecutionStatus
    output_stream: str
    execution_time_ms: int | None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class ExecutionStarted(BaseModel):
    execution_id: int
    status: ExecutionStatus
