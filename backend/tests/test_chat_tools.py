import json

from app.api import routes
from app.services.chat_tools import execute_chat_tool, list_tool_manifest


def test_tool_protocol_returns_consistent_bounded_results():
    files = {"docs/guide.txt": "Alpha\nNeedle here\nOmega"}

    listed = execute_chat_tool("list_uploaded_files", {}, files).to_dict()
    assert listed["protocol_version"] == "1.0"
    assert listed["ok"] is True
    assert listed["data"]["files"] == [{"path": "docs/guide.txt", "characters": 23}]

    read = execute_chat_tool(
        "read_uploaded_file",
        {"path": "../secret.txt"},
        files,
    ).to_dict()
    assert read["ok"] is False
    assert read["error"]["code"] == "invalid_path"

    searched = execute_chat_tool("search_uploaded_files", {"query": "needle"}, files).to_dict()
    assert searched["data"]["matches"][0]["line"] == 2
    assert searched["data"]["matches"][0]["text"] == "Needle here"

    manifest = list_tool_manifest()
    assert manifest["protocol_version"] == "1.0"
    assert {tool["name"] for tool in manifest["tools"]} == {
        "list_uploaded_files",
        "read_uploaded_file",
        "search_uploaded_files",
    }
    assert all(not tool["requires_confirmation"] for tool in manifest["tools"])
    invalid_arguments = execute_chat_tool(
        "list_uploaded_files",
        {"arbitrary_path": "/etc/passwd"},
        files,
    ).to_dict()
    assert invalid_arguments["error"]["code"] == "invalid_arguments"

    adjusted_read = execute_chat_tool(
        "read_uploaded_file",
        {"path": "docs/guide.txt", "start_line": "no es un número", "max_lines": 500},
        files,
    ).to_dict()
    assert adjusted_read["ok"] is True
    assert adjusted_read["data"]["content"] == "L1: Alpha\nL2: Needle here\nL3: Omega"
    assert adjusted_read["data"]["start_line"] == 1
    assert adjusted_read["data"]["start_line_adjusted"] is True
    assert adjusted_read["data"]["max_lines"] == 200
    assert adjusted_read["data"]["max_lines_adjusted"] is True
    assert "L2: Needle here" in adjusted_read["data"]["content"]


def test_general_chat_uses_tools_for_ephemeral_attachments(client, monkeypatch):
    requests = []
    file_content = "SECRET_TEXT_FROM_ATTACHMENT\n" + ("line\n" * 7_000)

    class FakeResponse:
        def __init__(self, message):
            self.message = message

        def raise_for_status(self):
            pass

        def json(self):
            return {"message": self.message}

    class FakeAsyncClient:
        def __init__(self, timeout):
            assert timeout == 120.0
            self.responses = iter([
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {"function": {"name": "list_uploaded_files", "arguments": {}}}
                    ],
                },
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "function": {
                                "name": "read_uploaded_file",
                                "arguments": {"path": "folder/notes.txt", "max_lines": 10},
                            }
                        }
                    ],
                },
                {"role": "assistant", "content": "El archivo contiene la nota solicitada."},
            ])

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, json):
            requests.append((url, json))
            return FakeResponse(next(self.responses))

    monkeypatch.setattr(routes.httpx, "AsyncClient", FakeAsyncClient)
    response = client.post(
        "/api/chat/general",
        json={
            "model": "qwen2.5:3b",
            "prompt": "Revisa mi nota",
            "attachments": [{"path": "folder/notes.txt", "content": file_content}],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["response"] == "El archivo contiene la nota solicitada."
    assert len(requests) == 3
    assert {tool["function"]["name"] for tool in requests[0][1]["tools"]} == {
        "list_uploaded_files",
        "read_uploaded_file",
        "search_uploaded_files",
    }
    assert "folder/notes.txt" in requests[0][1]["messages"][-1]["content"]
    tool_result = json.loads(requests[2][1]["messages"][-1]["content"])
    assert tool_result["ok"] is True
    assert "SECRET_TEXT_FROM_ATTACHMENT" in tool_result["data"]["content"]

    conversation_id = response.json()["conversation_id"]
    saved_messages = client.get(
        f"/api/general/conversations/{conversation_id}/messages"
    ).json()
    assert all(file_content not in message["content"] for message in saved_messages)
    assert [message["role"] for message in saved_messages] == ["user", "assistant"]


def test_small_attachments_are_sent_directly_to_the_model(client, monkeypatch):
    requests = []

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"message": {"role": "assistant", "content": "El pedido está duplicado."}}

    class FakeAsyncClient:
        def __init__(self, timeout):
            assert timeout == 120.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, json):
            requests.append((url, json))
            return FakeResponse()

    monkeypatch.setattr(routes.httpx, "AsyncClient", FakeAsyncClient)
    response = client.post(
        "/api/chat/general",
        json={
            "model": "qwen2.5:3b",
            "prompt": "Encuentra datos duplicados.",
            "attachments": [
                {"path": "orders.csv", "content": "id,status\n918,open\n918,open"}
            ],
        },
    )
    assert response.status_code == 200, response.text
    request_payload = requests[0][1]
    assert "tools" not in request_payload
    assert "L2: 918,open" in request_payload["messages"][-1]["content"]
    assert "archivo.csv:L2-L4" in request_payload["messages"][0]["content"]
    assert request_payload["options"]["temperature"] == 0.2


def test_chat_tools_endpoint_publishes_shared_protocol(client):
    response = client.get("/api/chat/tools")
    assert response.status_code == 200
    manifest = response.json()
    assert manifest["protocol_version"] == "1.0"
    assert manifest["result_schema"]["required"] == [
        "protocol_version",
        "tool",
        "ok",
        "data",
        "error",
    ]


def test_general_chat_rejects_paths_and_unsupported_attachment_types(client):
    for path in ("../outside.txt", "/etc/passwd", "folder/image.png"):
        response = client.post(
            "/api/chat/general",
            json={
                "model": "qwen2.5:3b",
                "prompt": "Lee el archivo",
                "attachments": [{"path": path, "content": "contenido"}],
            },
        )
        assert response.status_code == 422
