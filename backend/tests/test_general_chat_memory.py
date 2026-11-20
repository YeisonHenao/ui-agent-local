from app.api import routes


def test_memories_are_explicitly_saved_edited_deleted_and_used(client, monkeypatch):
    requests = []

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"message": {"content": "Entendido."}}

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

    created = client.post(
        "/api/general/memories",
        json={"content": "Prefiero respuestas breves con ejemplos."},
    )
    assert created.status_code == 201, created.text
    memory_id = created.json()["id"]
    assert client.get("/api/general/memories").json()[0]["content"] == (
        "Prefiero respuestas breves con ejemplos."
    )
    assert client.post(
        "/api/general/memories",
        json={"content": "  prefiero respuestas breves con ejemplos.  "},
    ).status_code == 409

    updated = client.put(
        f"/api/general/memories/{memory_id}",
        json={"content": "Prefiero respuestas breves y en español."},
    )
    assert updated.status_code == 200

    chat = client.post(
        "/api/chat/general",
        json={"model": "qwen2.5:3b", "prompt": "¿Cómo prefiero las respuestas?"},
    )
    assert chat.status_code == 200, chat.text
    system_prompt = requests[0][1]["messages"][0]["content"]
    assert "Prefiero respuestas breves y en español." in system_prompt
    assert requests[0][1]["options"]["temperature"] == 0.2

    assert client.delete(f"/api/general/memories/{memory_id}").status_code == 204
    assert client.get("/api/general/memories").json() == []
