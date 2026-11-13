import os
import re
import shlex
import shutil
import sys
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.database import get_db
from app.models import Agent, ExecutionLog, ExecutionStatus
from app.schemas import (
    AgentCreate,
    AgentRead,
    AgentUpdate,
    ExecutionRead,
    ExecutionStarted,
)
from app.services.executor import ScriptCommand, execution_manager, make_agent_environment


router = APIRouter(prefix="/api")
DbSession = Annotated[AsyncSession, Depends(get_db)]


def resolve_script_command(script_command: str) -> ScriptCommand:
    settings = get_settings()
    normalized_command = re.sub(r"\\\r?\n[ \t]*", " ", script_command).strip()
    try:
        parts = shlex.split(normalized_command)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Comando de script inválido: {exc}") from exc
    if not parts:
        raise HTTPException(status_code=400, detail="Debes indicar la ruta del script Python")

    script_index = next(
        (index for index, part in enumerate(parts) if part.lower().endswith(".py")),
        0 if len(parts) == 1 else -1,
    )
    if script_index < 0:
        raise HTTPException(
            status_code=400,
            detail="Indica un archivo .py o un comando Python con la ruta del archivo .py",
        )

    candidate = Path(parts[script_index]).expanduser()
    if not candidate.is_absolute():
        candidate = settings.scripts_root / candidate
    resolved = candidate.resolve()
    try:
        resolved.relative_to(settings.scripts_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"El script debe estar dentro de {settings.scripts_root}. "
                "Para permitir otra carpeta, configura AGENT_SCRIPTS_DIR y reinicia el backend."
            ),
        ) from exc
    if not resolved.is_file():
        raise HTTPException(status_code=400, detail=f"No se encontró el script: {resolved}")

    if script_index == 0:
        return ScriptCommand(
            argv=(sys.executable, "-u", str(resolved)),
            script_path=resolved,
        )

    interpreter = Path(parts[0]).expanduser()
    if not interpreter.is_absolute():
        interpreter_from_path = shutil.which(parts[0])
        if interpreter_from_path is None:
            raise HTTPException(status_code=400, detail=f"No se encontró el intérprete: {parts[0]}")
        interpreter = Path(interpreter_from_path)
    interpreter = Path(os.path.abspath(interpreter))
    if not interpreter.is_file() or not os.access(interpreter, os.X_OK):
        raise HTTPException(status_code=400, detail=f"El intérprete no existe o no es ejecutable: {interpreter}")
    if not interpreter.name.lower().startswith("python"):
        raise HTTPException(status_code=400, detail="El comando debe usar un intérprete Python")

    interpreter_args = parts[1:script_index]
    if "-u" not in interpreter_args:
        interpreter_args.append("-u")
    argv = (str(interpreter), *interpreter_args, str(resolved), *parts[script_index + 1 :])
    return ScriptCommand(argv=argv, script_path=resolved)


@router.get("/models")
async def list_models() -> dict[str, list[dict[str, str]]]:
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.ollama_base_url.rstrip('/')}/api/tags")
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar Ollama: {exc}") from exc
    payload = response.json()
    return {
        "models": [
            {"name": model["name"], "size": str(model.get("size", ""))}
            for model in payload.get("models", [])
            if isinstance(model, dict) and isinstance(model.get("name"), str)
        ]
    }


@router.get("/agents", response_model=list[AgentRead])
async def list_agents(db: DbSession) -> list[Agent]:
    result = await db.scalars(select(Agent).order_by(Agent.created_at.desc()))
    return list(result)


@router.post("/agents", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(payload: AgentCreate, db: DbSession) -> Agent:
    resolve_script_command(payload.script_path)
    agent = Agent(**payload.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/agents/{agent_id}", response_model=AgentRead)
async def get_agent(agent_id: int, db: DbSession) -> Agent:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return agent


@router.put("/agents/{agent_id}", response_model=AgentRead)
async def update_agent(agent_id: int, payload: AgentUpdate, db: DbSession) -> Agent:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    changes = payload.model_dump(exclude_unset=True)
    if "script_path" in changes:
        resolve_script_command(changes["script_path"])
    for field, value in changes.items():
        setattr(agent, field, value)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.delete("/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: int, db: DbSession) -> None:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    await db.delete(agent)
    await db.commit()


@router.post(
    "/agents/{agent_id}/run",
    response_model=ExecutionStarted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def run_agent(agent_id: int, db: DbSession) -> ExecutionStarted:
    agent = await db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    script_command = resolve_script_command(agent.script_path)
    execution = ExecutionLog(agent_id=agent.id, status=ExecutionStatus.RUNNING, output_stream="")
    db.add(execution)
    await db.commit()
    await db.refresh(execution)
    environment = make_agent_environment(agent, os.environ)
    execution_manager.start(execution.id, script_command, environment)
    return ExecutionStarted(execution_id=execution.id, status=execution.status)


@router.get("/agents/{agent_id}/executions", response_model=list[ExecutionRead])
async def list_executions(agent_id: int, db: DbSession, limit: int = 50) -> list[ExecutionLog]:
    if await db.get(Agent, agent_id) is None:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    result = await db.scalars(
        select(ExecutionLog)
        .where(ExecutionLog.agent_id == agent_id)
        .order_by(ExecutionLog.timestamp.desc())
        .limit(max(1, min(limit, 200)))
    )
    return list(result)


@router.get("/executions/{execution_id}", response_model=ExecutionRead)
async def get_execution(execution_id: int, db: DbSession) -> ExecutionLog:
    execution = await db.get(ExecutionLog, execution_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada")
    return execution
