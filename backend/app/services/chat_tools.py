import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any


PROTOCOL_VERSION = "1.0"
RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "protocol_version": {"type": "string"},
        "tool": {"type": "string"},
        "ok": {"type": "boolean"},
        "data": {"type": "object"},
        "error": {
            "anyOf": [
                {"type": "object", "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"},
                }, "required": ["code", "message"], "additionalProperties": False},
                {"type": "null"},
            ]
        },
    },
    "required": ["protocol_version", "tool", "ok", "data", "error"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class ToolResult:
    tool: str
    ok: bool
    data: Any = None
    error: dict[str, str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocol_version": PROTOCOL_VERSION,
            "tool": self.tool,
            "ok": self.ok,
            "data": self.data,
            "error": self.error,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


ToolHandler = Callable[[dict[str, Any], Mapping[str, str]], Any]


@dataclass(frozen=True)
class ChatTool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolHandler
    requires_confirmation: bool = False

    def ollama_definition(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    def manifest_entry(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
            "result_schema": RESULT_SCHEMA,
            "requires_confirmation": self.requires_confirmation,
            "access": "uploaded_files_only",
        }


def _validate_path(path: Any, files: Mapping[str, str]) -> str:
    if not isinstance(path, str) or not path.strip():
        raise ValueError("invalid_path: Debes indicar la ruta relativa de un archivo.")
    if "\\" in path:
        raise ValueError("invalid_path: La ruta debe usar separadores /.")
    parsed = PurePosixPath(path)
    if parsed.is_absolute() or any(part in {"", ".", ".."} for part in parsed.parts):
        raise ValueError("invalid_path: Solo se permiten rutas relativas a los archivos seleccionados.")
    normalized = parsed.as_posix()
    if normalized not in files:
        raise FileNotFoundError("file_not_found: El archivo no está entre los adjuntos de esta consulta.")
    return normalized


def _list_uploaded_files(_: dict[str, Any], files: Mapping[str, str]) -> dict[str, Any]:
    return {
        "files": [
            {"path": path, "characters": len(content)}
            for path, content in sorted(files.items())
        ],
        "count": len(files),
    }


def _read_uploaded_file(arguments: dict[str, Any], files: Mapping[str, str]) -> dict[str, Any]:
    path = _validate_path(arguments.get("path"), files)
    lines = files[path].splitlines()
    requested_start_line = arguments.get("start_line", 1)
    start_line, start_line_adjusted = _positive_int_or_default(
        requested_start_line,
        default=1,
        maximum=None,
    )
    requested_max_lines = arguments.get("max_lines", 200)
    max_lines, max_lines_adjusted = _positive_int_or_default(
        requested_max_lines,
        default=200,
        maximum=200,
    )
    start = start_line - 1
    return {
        "path": path,
        "requested_start_line": requested_start_line,
        "start_line": start_line,
        "start_line_adjusted": start_line_adjusted,
        "requested_max_lines": requested_max_lines,
        "max_lines": max_lines,
        "max_lines_adjusted": max_lines_adjusted,
        "end_line": min(start + max_lines, len(lines)),
        "total_lines": len(lines),
        "content": "\n".join(
            f"L{line_number}: {line}"
            for line_number, line in enumerate(
                lines[start : start + max_lines],
                start=start_line,
            )
        ),
        "truncated": start + max_lines < len(lines),
    }


def _positive_int_or_default(
    value: Any,
    *,
    default: int,
    maximum: int | None,
) -> tuple[int, bool]:
    if isinstance(value, bool):
        return default, True
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = int(value.strip())
        except ValueError:
            return default, True
    else:
        return default, True
    if parsed < 1:
        return default, True
    normalized = min(parsed, maximum) if maximum is not None else parsed
    return normalized, normalized != parsed or not isinstance(value, int)


def _search_uploaded_files(arguments: dict[str, Any], files: Mapping[str, str]) -> dict[str, Any]:
    query = arguments.get("query")
    if not isinstance(query, str) or len(query.strip()) < 2:
        raise ValueError("invalid_query: La búsqueda debe contener al menos 2 caracteres.")
    max_results = arguments.get("max_results", 20)
    if not isinstance(max_results, int) or isinstance(max_results, bool) or not 1 <= max_results <= 20:
        raise ValueError("invalid_max_results: max_results debe estar entre 1 y 20.")

    matches = []
    needle = query.casefold()
    for path, content in sorted(files.items()):
        for line_number, line in enumerate(content.splitlines(), start=1):
            if needle in line.casefold():
                matches.append({
                    "path": path,
                    "line": line_number,
                    "text": line[:240],
                    "truncated": len(line) > 240,
                })
                if len(matches) >= max_results:
                    return {"query": query, "matches": matches, "truncated": True}
    return {"query": query, "matches": matches, "truncated": False}


CHAT_TOOLS = (
    ChatTool(
        name="list_uploaded_files",
        description="Lista los archivos de texto que el usuario adjuntó explícitamente en esta consulta. No accede al disco.",
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
        handler=_list_uploaded_files,
    ),
    ChatTool(
        name="read_uploaded_file",
        description="Lee un rango acotado de líneas de un archivo adjuntado explícitamente en esta consulta.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Ruta relativa tal como aparece en list_uploaded_files."},
                "start_line": {"type": "integer", "minimum": 1, "default": 1},
                "max_lines": {"type": "integer", "minimum": 1, "maximum": 200, "default": 200},
            },
            "required": ["path"],
            "additionalProperties": False,
        },
        handler=_read_uploaded_file,
    ),
    ChatTool(
        name="search_uploaded_files",
        description="Busca texto sin distinguir mayúsculas en los archivos adjuntados en esta consulta.",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "minLength": 2},
                "max_results": {"type": "integer", "minimum": 1, "maximum": 20, "default": 20},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
        handler=_search_uploaded_files,
    ),
)

_TOOLS_BY_NAME = {tool.name: tool for tool in CHAT_TOOLS}


def list_tool_manifest() -> dict[str, Any]:
    return {
        "protocol_version": PROTOCOL_VERSION,
        "result_schema": RESULT_SCHEMA,
        "tools": [tool.manifest_entry() for tool in CHAT_TOOLS],
    }


def ollama_tool_definitions() -> list[dict[str, Any]]:
    return [tool.ollama_definition() for tool in CHAT_TOOLS]


def execute_chat_tool(
    name: str,
    arguments: Any,
    files: Mapping[str, str],
) -> ToolResult:
    tool = _TOOLS_BY_NAME.get(name)
    if tool is None:
        return ToolResult(
            tool=name,
            ok=False,
            error={"code": "unknown_tool", "message": "La herramienta no está registrada."},
        )
    if not isinstance(arguments, dict):
        return ToolResult(
            tool=name,
            ok=False,
            error={"code": "invalid_arguments", "message": "Los argumentos deben ser un objeto JSON."},
        )
    allowed_arguments = set(tool.parameters["properties"])
    unexpected_arguments = set(arguments) - allowed_arguments
    missing_arguments = set(tool.parameters.get("required", [])) - set(arguments)
    if unexpected_arguments or missing_arguments:
        return ToolResult(
            tool=name,
            ok=False,
            error={
                "code": "invalid_arguments",
                "message": "Los argumentos no coinciden con el esquema publicado para esta herramienta.",
            },
        )
    if tool.requires_confirmation:
        return ToolResult(
            tool=name,
            ok=False,
            error={
                "code": "confirmation_required",
                "message": "Esta acción requiere un flujo de confirmación que aún no está habilitado.",
            },
        )
    try:
        return ToolResult(tool=name, ok=True, data=tool.handler(arguments, files))
    except FileNotFoundError as exc:
        code, _, message = str(exc).partition(": ")
        return ToolResult(tool=name, ok=False, error={"code": code, "message": message})
    except ValueError as exc:
        code, _, message = str(exc).partition(": ")
        return ToolResult(tool=name, ok=False, error={"code": code, "message": message})
