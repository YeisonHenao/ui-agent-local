import asyncio
import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import update

from app.core.config import get_settings
from app.database import SessionLocal
from app.models import Agent, ExecutionLog, ExecutionStatus


@dataclass(frozen=True)
class ScriptCommand:
    argv: tuple[str, ...]
    script_path: Path


@dataclass
class ExecutionRuntime:
    subscribers: set[asyncio.Queue[dict[str, str]]] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    output: str = ""
    finished: bool = False
    status: str = ExecutionStatus.RUNNING.value


class ExecutionManager:
    def __init__(self) -> None:
        self._runtimes: dict[int, ExecutionRuntime] = {}
        self._tasks: set[asyncio.Task[None]] = set()

    def start(
        self,
        execution_id: int,
        script_command: ScriptCommand,
        environment: dict[str, str],
    ) -> None:
        runtime = ExecutionRuntime()
        self._runtimes[execution_id] = runtime
        task = asyncio.create_task(self._run(execution_id, script_command, environment, runtime))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def stream(self, execution_id: int) -> AsyncIterator[dict[str, str]]:
        runtime = self._runtimes.get(execution_id)
        if runtime is None:
            async with SessionLocal() as session:
                execution = await session.get(ExecutionLog, execution_id)
            if execution is None:
                yield {"type": "error", "data": "Ejecución no encontrada"}
                return
            if execution.output_stream:
                yield {"type": "output", "data": execution.output_stream}
            yield {"type": "complete", "data": execution.status.value}
            return

        queue: asyncio.Queue[dict[str, str]] = asyncio.Queue()
        async with runtime.lock:
            initial_output = runtime.output
            finished = runtime.finished
            if not finished:
                runtime.subscribers.add(queue)
        if initial_output:
            yield {"type": "output", "data": initial_output}
        if finished:
            yield {"type": "complete", "data": runtime.status}
            return

        try:
            while True:
                message = await queue.get()
                yield message
                if message["type"] in {"complete", "error"}:
                    return
        finally:
            async with runtime.lock:
                runtime.subscribers.discard(queue)

    async def _publish(self, runtime: ExecutionRuntime, message: dict[str, str]) -> None:
        async with runtime.lock:
            if message["type"] == "output":
                runtime.output += message["data"]
            if message["type"] == "complete":
                runtime.finished = True
                runtime.status = message["data"]
            for queue in runtime.subscribers:
                queue.put_nowait(message)

    async def _run(
        self,
        execution_id: int,
        script_command: ScriptCommand,
        environment: dict[str, str],
        runtime: ExecutionRuntime,
    ) -> None:
        started = time.monotonic()
        status = ExecutionStatus.FAILED
        process: asyncio.subprocess.Process | None = None
        try:
            process = await asyncio.create_subprocess_exec(
                *script_command.argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=environment,
                cwd=script_command.script_path.parent,
            )
            assert process.stdout is not None
            while chunk := await process.stdout.read(1024):
                text = chunk.decode("utf-8", errors="replace")
                await self._append_output(execution_id, text)
                await self._publish(runtime, {"type": "output", "data": text})
            return_code = await process.wait()
            status = ExecutionStatus.SUCCESS if return_code == 0 else ExecutionStatus.FAILED
            if return_code != 0:
                await self._append_output(execution_id, f"\nEl proceso terminó con código {return_code}.\n")
                await self._publish(
                    runtime,
                    {"type": "output", "data": f"\nEl proceso terminó con código {return_code}.\n"},
                )
        except (OSError, asyncio.SubprocessError) as exc:
            error = f"Error al iniciar o ejecutar el agente: {exc}\n"
            await self._append_output(execution_id, error)
            await self._publish(runtime, {"type": "output", "data": error})
        finally:
            if process is not None and process.returncode is None:
                process.kill()
                await process.wait()
            elapsed_ms = int((time.monotonic() - started) * 1000)
            async with SessionLocal() as session:
                await session.execute(
                    update(ExecutionLog)
                    .where(ExecutionLog.id == execution_id)
                    .values(status=status, execution_time_ms=elapsed_ms)
                )
                await session.commit()
            await self._publish(runtime, {"type": "complete", "data": status.value})

    @staticmethod
    async def _append_output(execution_id: int, text: str) -> None:
        async with SessionLocal() as session:
            execution = await session.get(ExecutionLog, execution_id)
            if execution is not None:
                execution.output_stream += text
                await session.commit()


execution_manager = ExecutionManager()


def make_agent_environment(
    agent: Agent,
    base_environment: dict[str, str],
) -> dict[str, str]:
    return {
        **base_environment,
        "OLLAMA_BASE_URL": get_settings().ollama_base_url,
        "OLLAMA_MODEL": agent.ollama_model,
        "AGENT_SYSTEM_PROMPT": agent.system_prompt,
        "AGENT_TOOLS_CONFIG": json.dumps(agent.tools_config, ensure_ascii=False),
    }
