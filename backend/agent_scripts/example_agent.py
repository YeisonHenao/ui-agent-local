import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    model = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    system_prompt = os.environ.get("AGENT_SYSTEM_PROMPT", "Eres un asistente útil.")
    tools = json.loads(os.environ.get("AGENT_TOOLS_CONFIG", "{}"))

    print(f"Usando modelo {model} en Ollama...")
    print(f"Configuración de herramientas recibida: {len(tools)} elemento(s).")
    payload = json.dumps(
        {
            "model": model,
            "prompt": "Describe brevemente qué puede hacer este agente local.",
            "system": system_prompt,
            "stream": False,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"No se pudo consultar Ollama: {exc}", file=sys.stderr)
        return 1
    print("Respuesta generada:")
    print(result.get("response", "Ollama no devolvió texto."))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
