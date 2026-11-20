# Local AI Agents Dashboard

Dashboard local para conversar directamente con modelos Ollama o administrar agentes Python, con API FastAPI, historial SQLite y logs de ejecuciones en tiempo real por WebSocket.

El chat general conversa directamente con Ollama, mantiene el contexto y guarda sus conversaciones en SQLite. También puedes cambiar al modo de ejecución para invocar agentes configurados: sus conversaciones se guardan según la configuración de cada agente, y los agentes de datos privados pueden ejecutarse sin guardar prompts, respuestas ni logs.

En el chat general puedes adjuntar archivos TXT, Markdown, CSV o JSON, o seleccionar una carpeta desde el navegador. Los adjuntos pequeños (hasta 32.000 caracteres en total) se incluyen directamente en la consulta del modelo; los mayores se inspeccionan con herramientas limitadas a los archivos seleccionados. Los archivos y resultados internos de herramientas no se guardan en SQLite; el historial sí conserva la pregunta y la respuesta final. Las herramientas disponibles y el formato de sus resultados se publican en `GET /api/chat/tools`.

Las respuestas del asistente se muestran como Markdown compatible con GitHub Flavored Markdown: encabezados, listas, tareas, enlaces, tablas con desplazamiento horizontal y bloques de código con botón para copiar. El modelo recibe instrucciones para generar ese formato; el renderizador no permite HTML arbitrario.

La sección **Memoria entre chats** permite guardar, editar y borrar hasta 20 recuerdos manuales que el asistente usará como contexto. No se guardan automáticamente. Para respuestas más consistentes se usa una temperatura baja y se piden referencias a líneas de los archivos cuando correspondan; esto no garantiza que las respuestas generales sean siempre correctas.

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
