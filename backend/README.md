# Backend

API local para agentes basada en FastAPI, SQLAlchemy asíncrono y SQLite. La base de datos se crea automáticamente al iniciar FastAPI.

## Requisitos

- [uv](https://docs.astral.sh/uv/) (uv gestiona el entorno y Python si hace falta)
- Ollama escuchando en `http://localhost:11434`
- Un modelo instalado, por ejemplo `ollama pull qwen2.5:3b`

## Instalación y ejecución en WSL2

Desde la raíz del proyecto:

```bash
cd backend
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

La API interactiva queda en <http://localhost:8000/docs>. SQLite se guarda en `backend/data/agents.db`. No se requiere un comando de migración inicial; las tablas se crean al arrancar.

Los scripts se restringen por defecto a `backend/agent_scripts`. Para usar otra carpeta, establece `AGENT_SCRIPTS_DIR` en `.env`; usa una ruta visible desde WSL. El campo `script_path` acepta una ruta `.py` relativa/absoluta o un comando Python con intérprete y argumentos. Por ejemplo, para un proyecto hermano:

```dotenv
AGENT_SCRIPTS_DIR=/home/alexander/projects/projects-ia/email-reader
```

Y como `script_path`:

```text
/home/alexander/projects/projects-ia/email-reader/.venv/bin/python /home/alexander/projects/projects-ia/email-reader/run_email_reader.py --json
```

El comando se separa en argumentos y se ejecuta sin shell; el archivo `.py` debe permanecer dentro de `AGENT_SCRIPTS_DIR`. El ejemplo `agent_scripts/example_agent.py` prueba la conexión con Ollama.

## Endpoints principales

- `GET /api/models`
- `GET|POST /api/agents`
- `GET|PUT|DELETE /api/agents/{id}`
- `POST /api/agents/{id}/run`
- `GET /api/agents/{id}/executions`
- `GET /api/executions/{id}`
- `WS /ws/logs/{execution_id}`

Un script recibe `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `AGENT_SYSTEM_PROMPT` y `AGENT_TOOLS_CONFIG` (JSON) en su entorno. La salida estándar y de error se combina y se emite en tiempo real.

> La ejecución de scripts equivale a ejecutar código local. Mantén el backend accesible solo desde tu equipo y registra únicamente scripts de confianza. `tools_config` es configuración descriptiva; no almacenes credenciales en texto plano.
