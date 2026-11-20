import os
import sqlite3
import sys
import tempfile
from pathlib import Path

import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
DATABASE_PATH = Path(tempfile.gettempdir()) / f"ui-agents-test-{os.getpid()}.db"
DATABASE_PATH.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{DATABASE_PATH}"
os.environ["AGENT_SCRIPTS_DIR"] = str(BACKEND_DIR / "tests" / "fixtures")
sys.path.insert(0, str(BACKEND_DIR))

legacy_db = sqlite3.connect(DATABASE_PATH)
legacy_db.executescript(
    """
    CREATE TABLE agents (
        id INTEGER PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        description TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        ollama_model VARCHAR(160) NOT NULL,
        script_path VARCHAR(1024) NOT NULL,
        tools_config JSON NOT NULL,
        created_at DATETIME NOT NULL
    );
    CREATE TABLE execution_logs (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id),
        status VARCHAR(16) NOT NULL,
        output_stream TEXT NOT NULL,
        execution_time_ms INTEGER,
        timestamp DATETIME NOT NULL
    );
    INSERT INTO agents VALUES (
        1, 'Leer correo', '', '', 'qwen2.5:3b',
        '/home/example/email-reader/run_email_reader.py --json',
        '{}', '2026-11-17 00:00:00'
    );
    INSERT INTO execution_logs VALUES (
        1, 1, 'FAILED', 'OLD_PRIVATE_OUTPUT', 10, '2026-11-17 00:00:00'
    );
    """
)
legacy_db.commit()
legacy_db.close()

from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client
    DATABASE_PATH.unlink(missing_ok=True)
