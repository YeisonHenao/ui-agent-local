# Local AI Agents Dashboard

Dashboard local para administrar agentes Python conectados a Ollama, con API FastAPI, historial SQLite y logs en tiempo real por WebSocket.

## Estructura

```text
backend/
  app/
    api/routes.py
    core/config.py
    services/executor.py
    database.py
    main.py
    models.py
    schemas.py
  agent_scripts/example_agent.py
  pyproject.toml
  uv.lock
  .env.example
frontend/
  src/
    components/common/
    components/
    services/api.js
    App.jsx
    main.jsx
  index.html
  package.json
  vite.config.js
```

## Inicio rápido en WSL2

Instala [uv](https://docs.astral.sh/uv/getting-started/installation/) si aún no está disponible. En una terminal WSL, inicia Ollama en Windows/WSL y descarga el modelo:

```bash
ollama pull qwen2.5:3b
```

Si Ollama está instalado en Windows y el backend corre en WSL, `localhost` puede no apuntar al host de Windows. En ese caso, configura `OLLAMA_BASE_URL` en `backend/.env` con la dirección IP del host accesible desde WSL.

Terminal 1:

```bash
cd backend
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2:

```bash
cd frontend
npm install
npm run dev
```

Abre <http://localhost:5173>. Swagger está disponible en <http://localhost:8000/docs>. La base `backend/data/agents.db` y las tablas se crean al iniciar la API. Añade agentes indicando un script existente en `backend/agent_scripts` (el script de ejemplo ya está disponible); para scripts externos, configura `AGENT_SCRIPTS_DIR` en `backend/.env`. El campo de script también admite una invocación Python con argumentos, como se explica en [backend/README.md](./backend/README.md).

## Seguridad y alcance

El backend ejecuta código Python local configurado explícitamente. Solo acepta scripts dentro de `AGENT_SCRIPTS_DIR` (por defecto `backend/agent_scripts`) y no utiliza shell para invocarlos. Mantén el servicio en localhost/red confiable, revisa los scripts antes de agregarlos y no guardes credenciales en `tools_config`.
