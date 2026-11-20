import asyncio
import itertools
import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import update

from app.core.config import get_settings
from app.database import SessionLocal
from app.models import Agent, ChatMessage, Conversation, ExecutionLog, ExecutionStatus


@dataclass(frozen=True)
class ScriptCommand:
    argv: tuple[str, ...]
    script_path: Path


@dataclass
class ExecutionRuntime:
    subscribers: set[asyncio.Queue[dict[str, str]]] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    persistence_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    output: str = ""
    finished: bool = False
    status: str = ExecutionStatus.RUNNING.value
    persist_output: bool = True
    agent_id: int | None = None
    conversation_id: int | None = None


class ExecutionManager:
    def __init__(self) -> None:
        self._runtimes: dict[int, ExecutionRuntime] = {}
        self._tasks: set[asyncio.Task[None]] = set()

    def start(
        self,
        execution_id: int,
        script_command: ScriptCommand,
        environment: dict[str, str],
        *,
        persist_output: bool = True,
        conversation_id: int | None = None,
        agent_id: int | None = None,
    ) -> None:
        runtime = ExecutionRuntime(
            persist_output=persist_output,
            agent_id=agent_id,
            conversation_id=conversation_id,
        )
        self._runtimes[execution_id] = runtime
        task = asyncio.create_task(
            self._run(execution_id, script_command, environment, runtime)
        )
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

    def release_ephemeral(self, execution_id: int) -> None:
        runtime = self._runtimes.get(execution_id)
        if runtime is None or runtime.persist_output or not runtime.finished or runtime.subscribers:
            return
        runtime.output = ""
        self._runtimes.pop(execution_id, None)

    def _expire_ephemeral(self, execution_id: int, runtime: ExecutionRuntime) -> None:
        if self._runtimes.get(execution_id) is runtime:
            self.release_ephemeral(execution_id)

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
                await self._append_output(execution_id, text, runtime)
                await self._publish(runtime, {"type": "output", "data": text})
            return_code = await process.wait()
            status = ExecutionStatus.SUCCESS if return_code == 0 else ExecutionStatus.FAILED
            if return_code != 0:
                failure_message = f"\nEl proceso terminó con código {return_code}.\n"
                await self._append_output(execution_id, failure_message, runtime)
                await self._publish(
                    runtime,
                    {"type": "output", "data": failure_message},
                )
        except (OSError, asyncio.SubprocessError) as exc:
            error = f"Error al iniciar o ejecutar el agente: {exc}\n"
            await self._append_output(execution_id, error, runtime)
            await self._publish(runtime, {"type": "output", "data": error})
        finally:
            if process is not None and process.returncode is None:
                process.kill()
                await process.wait()
            elapsed_ms = int((time.monotonic() - started) * 1000)
            async with runtime.persistence_lock:
                if execution_id > 0:
                    async with SessionLocal() as session:
                        await session.execute(
                            update(ExecutionLog)
                            .where(ExecutionLog.id == execution_id)
                            .values(status=status, execution_time_ms=elapsed_ms)
                        )
                        if runtime.persist_output and runtime.conversation_id is not None:
                            execution = await session.get(ExecutionLog, execution_id)
                            if execution is not None:
                                content = self._assistant_content(runtime.output, status)
                                session.add(
                                    ChatMessage(
                                        conversation_id=runtime.conversation_id,
                                        execution_id=execution_id,
                                        role="assistant",
                                        content=content,
                                    )
                                )
                                conversation = await session.get(Conversation, runtime.conversation_id)
                                if conversation is not None:
                                    conversation.updated_at = datetime.now(timezone.utc)
                        await session.commit()
            await self._publish(runtime, {"type": "complete", "data": status.value})
            if not runtime.persist_output and not runtime.subscribers:
                asyncio.get_running_loop().call_later(
                    30,
                    self._expire_ephemeral,
                    execution_id,
                    runtime,
                )

    async def disable_agent_persistence(self, agent_id: int) -> None:
        for runtime in self._runtimes.values():
            if runtime.agent_id == agent_id:
                async with runtime.persistence_lock:
                    runtime.persist_output = False
                    runtime.conversation_id = None

    @staticmethod
    def _assistant_content(output: str, status: ExecutionStatus) -> str:
        for line in reversed(output.splitlines()):
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict) and isinstance(payload.get("summary"), str):
                return payload["summary"]
        if output.strip():
            return output.strip()
        if status is ExecutionStatus.FAILED:
            return "La ejecución terminó con un error. Revisa los detalles de ejecución."
        return "El agente terminó sin devolver texto."

    @staticmethod
    async def _append_output(execution_id: int, text: str, runtime: ExecutionRuntime) -> None:
        async with runtime.persistence_lock:
            if not runtime.persist_output:
                return
            async with SessionLocal() as session:
                execution = await session.get(ExecutionLog, execution_id)
                if execution is not None:
                    execution.output_stream += text
                    await session.commit()


execution_manager = ExecutionManager()
ephemeral_execution_ids = itertools.count(1)


def make_agent_environment(
    agent: Agent,
    base_environment: dict[str, str],
    user_message: str = "",
) -> dict[str, str]:
    return {
        **base_environment,
        "OLLAMA_BASE_URL": get_settings().ollama_base_url,
        "OLLAMA_MODEL": agent.ollama_model,
        "AGENT_SYSTEM_PROMPT": agent.system_prompt,
        "AGENT_TOOLS_CONFIG": json.dumps(agent.tools_config, ensure_ascii=False),
        "AGENT_USER_MESSAGE": user_message,
    }
