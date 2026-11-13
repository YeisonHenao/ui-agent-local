import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.database import Base, engine
from app.models import Agent, ExecutionLog
from app.services.executor import execution_manager


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield
    for task in tuple(execution_manager._tasks):
        task.cancel()
    if execution_manager._tasks:
        await asyncio.gather(*execution_manager._tasks, return_exceptions=True)
    await engine.dispose()


app = FastAPI(title="Local AI Agents Dashboard API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/logs/{execution_id}")
async def execution_logs(websocket: WebSocket, execution_id: int) -> None:
    await websocket.accept()
    try:
        async for message in execution_manager.stream(execution_id):
            await websocket.send_json(message)
        await websocket.close()
    except WebSocketDisconnect:
        return
