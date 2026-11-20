from datetime import datetime
from pathlib import PurePosixPath
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ExecutionStatus


class AgentBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    system_prompt: str = ""
    ollama_model: str = Field(default="qwen2.5:3b", min_length=1, max_length=160)
    script_path: str = Field(min_length=1, max_length=1024)
    tools_config: dict[str, Any] = Field(default_factory=dict)
    persist_history: bool = True


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    system_prompt: str | None = None
    ollama_model: str | None = Field(default=None, min_length=1, max_length=160)
    script_path: str | None = Field(default=None, min_length=1, max_length=1024)
    tools_config: dict[str, Any] | None = None
    persist_history: bool | None = None


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
    persisted: bool = True


class ConversationRead(BaseModel):
    id: int
    agent_id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatMessageRead(BaseModel):
    id: int
    conversation_id: int
    execution_id: int | None
    role: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatRunRequest(BaseModel):
    agent_id: int
    prompt: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = None

    @field_validator("prompt")
    @classmethod
    def prompt_must_contain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("El mensaje no puede estar vacío.")
        return value


class ChatRunStarted(BaseModel):
    execution_id: int
    conversation_id: int | None
    persisted: bool


class GeneralChatAttachment(BaseModel):
    path: str = Field(min_length=1, max_length=512)
    content: str = Field(max_length=512_000)

    @field_validator("path")
    @classmethod
    def path_must_be_safe_and_supported(cls, value: str) -> str:
        if "\\" in value or "\x00" in value:
            raise ValueError("La ruta del adjunto no es válida.")
        path = PurePosixPath(value)
        if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
            raise ValueError("La ruta del adjunto debe ser relativa y no puede salir de la carpeta seleccionada.")
        if path.suffix.lower() not in {".txt", ".md", ".markdown", ".csv", ".json"}:
            raise ValueError("Formato no permitido. Usa TXT, Markdown, CSV o JSON.")
        return path.as_posix()

    @field_validator("content")
    @classmethod
    def content_must_be_text(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("El archivo contiene datos binarios; solo se admiten archivos de texto.")
        return value


class GeneralChatRequest(BaseModel):
    model: str = Field(min_length=1, max_length=160)
    prompt: str = Field(min_length=1, max_length=4000)
    conversation_id: int | None = None
    attachments: list[GeneralChatAttachment] = Field(default_factory=list, max_length=25)

    @field_validator("model")
    @classmethod
    def model_must_contain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Debes seleccionar un modelo.")
        return value

    @field_validator("prompt")
    @classmethod
    def prompt_must_contain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("El mensaje no puede estar vacío.")
        return value

    @field_validator("attachments")
    @classmethod
    def attachments_must_be_unique_and_bounded(
        cls,
        value: list[GeneralChatAttachment],
    ) -> list[GeneralChatAttachment]:
        if sum(len(item.content) for item in value) > 1_500_000:
            raise ValueError("Los adjuntos no pueden superar 1.5 millones de caracteres en total.")
        paths = [item.path for item in value]
        if len(set(paths)) != len(paths):
            raise ValueError("Los adjuntos no pueden repetir rutas.")
        return value


class GeneralChatStarted(BaseModel):
    conversation_id: int
    response: str
    model: str


class GeneralConversationRead(BaseModel):
    id: int
    title: str
    model: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GeneralChatMessageRead(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssistantMemoryBase(BaseModel):
    content: str = Field(min_length=1, max_length=500)

    @field_validator("content")
    @classmethod
    def content_must_contain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("El recuerdo no puede estar vacío.")
        return value.strip()


class AssistantMemoryCreate(AssistantMemoryBase):
    pass


class AssistantMemoryUpdate(AssistantMemoryBase):
    pass


class AssistantMemoryRead(AssistantMemoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
