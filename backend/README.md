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

La API interactiva queda en <http://localhost:8000/docs>. SQLite se guarda en `backend/data/agents.db`. No se requiere un comando de migración inicial; las tablas se crean al arrancar. Al actualizar una base existente, se agrega el control de privacidad. El agente configurado con `run_email_reader.py` se migra a modo privado y se borran sus ejecuciones históricas del dashboard.

Para ejecutar las pruebas de backend: `uv sync --group dev` y `uv run --group dev pytest`.

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
- `POST /api/chat/run`
- `POST /api/chat/general`
- `GET /api/chat/tools`
- `GET /api/general/conversations`
- `GET /api/general/conversations/{id}/messages`
- `DELETE /api/general/conversations/{id}`
- `GET|POST /api/general/memories`
- `PUT|DELETE /api/general/memories/{id}`
- `GET /api/conversations?agent_id={id}`
- `GET /api/conversations/{id}/messages`
- `DELETE /api/conversations/{id}`
- `WS /ws/logs/{execution_id}`

El endpoint `/api/chat/general` conversa directamente con Ollama usando el modelo indicado, envía el historial de la conversación para conservar el contexto y guarda mensajes en tablas separadas de las ejecuciones de agentes. En el formulario del agente, desactiva **Guardar conversaciones e historial** para cualquier agente que procese información privada. En ese modo, sus mensajes, resultados, logs y ejecuciones nuevas no se escriben en SQLite; solo viven en memoria mientras se atiende la sesión del proceso. Los chats generales se persisten y se pueden borrar desde el panel lateral.

El chat general también admite adjuntos de texto TXT, Markdown, CSV y JSON (máximo 25 archivos, 500 KB por archivo y 1.5 MB en total). La selección de carpeta se realiza explícitamente desde el navegador. Hasta 32.000 caracteres se incluyen directamente en la consulta de Ollama; los adjuntos mayores usan las herramientas de lectura. El backend solo expone los adjuntos durante la solicitud y no guarda los archivos ni los resultados internos de herramientas; el historial sí conserva la pregunta y la respuesta final. Las rutas enviadas por el modelo se resuelven únicamente contra los adjuntos, nunca contra el disco del servidor.

`GET /api/chat/tools` devuelve el protocolo versionado de herramientas, sus esquemas de argumentos, el esquema de respuesta común (`protocol_version`, `tool`, `ok`, `data`, `error`) y si requieren confirmación. El mismo registro se usa para anunciar funciones a Ollama y despacharlas en el backend. Actualmente incluye `list_uploaded_files`, `read_uploaded_file` y `search_uploaded_files`, todas de solo lectura y limitadas a archivos adjuntos. Para añadir herramientas, registra una definición y un ejecutor en `app/services/chat_tools.py`; las acciones con efectos secundarios deben marcarse y requerir confirmación antes de incorporarlas al flujo.

El prompt del chat general solicita respuestas Markdown compatibles con GitHub Flavored Markdown. El frontend las renderiza con `react-markdown` y `remark-gfm`; no habilita HTML arbitrario. Las tablas se muestran dentro de contenedores desplazables y los bloques de código incluyen una acción para copiar.

El asistente usa temperatura `0.2` para reducir variaciones y solicita diferenciar evidencia de inferencias, expresar incertidumbre y citar líneas exactas de los adjuntos. Esto mejora la consistencia, pero no garantiza que toda respuesta general sea correcta.

La memoria entre chats es manual: el usuario crea, edita y borra hasta 20 recuerdos desde el panel **Memoria entre chats** del chat general. Solo se incluyen en el prompt los recuerdos guardados explícitamente; el asistente no los extrae automáticamente. Se guardan localmente en SQLite.

Un script recibe `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `AGENT_SYSTEM_PROMPT`, `AGENT_TOOLS_CONFIG` (JSON) y `AGENT_USER_MESSAGE` en su entorno. El agente de ejemplo usa el mensaje del chat como prompt; los scripts existentes pueden ignorarlo si implementan una tarea fija. La salida estándar y de error se combina y se emite en tiempo real.

> La ejecución de scripts equivale a ejecutar código local. Mantén el backend accesible solo desde tu equipo y registra únicamente scripts de confianza. `tools_config` es configuración descriptiva; no almacenes credenciales en texto plano.
