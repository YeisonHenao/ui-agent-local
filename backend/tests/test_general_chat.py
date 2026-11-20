from app.api import routes


def test_general_chat_keeps_context_without_creating_an_agent(client, monkeypatch):
    requests = []

    class FakeResponse:
        def __init__(self, answer):
            self.answer = answer

        def raise_for_status(self):
            pass

        def json(self):
            return {"message": {"content": self.answer}}

    class FakeAsyncClient:
        def __init__(self, timeout):
            assert timeout == 120.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def post(self, url, json):
            requests.append((url, json))
            return FakeResponse(f"Respuesta {len(requests)}")

    monkeypatch.setattr(routes.httpx, "AsyncClient", FakeAsyncClient)
    agent_count = len(client.get("/api/agents").json())

    first = client.post(
        "/api/chat/general",
        json={"model": "qwen2.5:3b", "prompt": "Hola"},
    )
    assert first.status_code == 200, first.text
    conversation_id = first.json()["conversation_id"]
    assert first.json()["response"] == "Respuesta 1"
    assert requests[0][0].endswith("/api/chat")
    assert requests[0][1]["messages"][-1] == {"role": "user", "content": "Hola"}

    second = client.post(
        "/api/chat/general",
        json={
            "model": "qwen2.5:3b",
            "prompt": "¿Qué te pregunté?",
            "conversation_id": conversation_id,
        },
    )
    assert second.status_code == 200, second.text
    assert [message["role"] for message in requests[1][1]["messages"]] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert requests[1][1]["messages"][1]["content"] == "Hola"

    messages = client.get(
        f"/api/general/conversations/{conversation_id}/messages"
    ).json()
    assert [message["content"] for message in messages] == [
        "Hola",
        "Respuesta 1",
        "¿Qué te pregunté?",
        "Respuesta 2",
    ]
    assert len(client.get("/api/agents").json()) == agent_count
    assert client.delete(f"/api/general/conversations/{conversation_id}").status_code == 204
    assert client.get(
        f"/api/general/conversations/{conversation_id}/messages"
    ).status_code == 404
