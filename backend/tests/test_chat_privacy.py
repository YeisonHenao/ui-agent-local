import sqlite3

from conftest import DATABASE_PATH


def collect_output(client, execution_id: int) -> str:
    output = []
    with client.websocket_connect(f"/ws/logs/{execution_id}") as socket:
        while True:
            message = socket.receive_json()
            if message["type"] == "output":
                output.append(message["data"])
            elif message["type"] == "complete":
                assert message["data"] == "SUCCESS"
                return "".join(output)


def test_chat_persistence_and_private_agent_data_is_not_stored(client):
    existing_agents = client.get("/api/agents").json()
    email_agent = next(agent for agent in existing_agents if agent["id"] == 1)
    assert email_agent["persist_history"] is False

    connection = sqlite3.connect(DATABASE_PATH)
    assert connection.execute("SELECT COUNT(*) FROM execution_logs WHERE agent_id = 1").fetchone()[0] == 0
    connection.close()

    general = client.post(
        "/api/agents",
        json={"name": "General", "script_path": "chat_echo.py", "persist_history": True},
    )
    assert general.status_code == 201, general.text
    general_id = general.json()["id"]

    run = client.post(
        "/api/chat/run",
        json={"agent_id": general_id, "prompt": "General prompt to keep"},
    )
    assert run.status_code == 202, run.text
    conversation_id = run.json()["conversation_id"]
    execution_id = run.json()["execution_id"]
    assert "request=General prompt to keep" in collect_output(client, execution_id)

    messages = client.get(f"/api/conversations/{conversation_id}/messages").json()
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "General prompt to keep"
    assert "General prompt to keep" in messages[1]["content"]

    deleted = client.delete(f"/api/conversations/{conversation_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/conversations/{conversation_id}/messages").status_code == 404
    persisted = sqlite3.connect(DATABASE_PATH)
    assert persisted.execute(
        "SELECT COUNT(*) FROM execution_logs WHERE id = ?", (execution_id,)
    ).fetchone()[0] == 0
    persisted.close()

    direct_run = client.post(f"/api/agents/{general_id}/run")
    assert direct_run.status_code == 202, direct_run.text
    direct_execution_id = direct_run.json()["execution_id"]
    assert collect_output(client, direct_execution_id)

    private = client.post(
        "/api/agents",
        json={"name": "Correo privado", "script_path": "private_echo.py", "persist_history": False},
    )
    assert private.status_code == 201, private.text
    private_id = private.json()["id"]
    private_prompt = "PRIVATE_PROMPT_SHOULD_NOT_PERSIST"
    private_run = client.post(
        "/api/chat/run",
        json={"agent_id": private_id, "prompt": private_prompt},
    )
    assert private_run.status_code == 202, private_run.text
    private_execution_id = private_run.json()["execution_id"]
    assert private_run.json()["conversation_id"] is None
    private_output = collect_output(client, private_execution_id)
    assert private_prompt in private_output
    assert "PRIVATE_RESULT_SHOULD_NOT_PERSIST" in private_output
    assert client.get(f"/api/agents/{private_id}/executions").json() == []
    assert client.get(f"/api/conversations?agent_id={private_id}").json() == []

    persisted = sqlite3.connect(DATABASE_PATH)
    saved_chat = "\n".join(
        str(row[0])
        for table, column in (
            ("execution_logs", "output_stream"),
            ("conversations", "title"),
            ("chat_messages", "content"),
        )
        for row in persisted.execute(f"SELECT {column} FROM {table}")
    )
    assert private_prompt not in saved_chat
    assert "PRIVATE_RESULT_SHOULD_NOT_PERSIST" not in saved_chat
    assert "OLD_PRIVATE_OUTPUT" not in saved_chat
    assert persisted.execute(
        "SELECT COUNT(*) FROM execution_logs WHERE agent_id = ?", (private_id,)
    ).fetchone()[0] == 0
    persisted.close()

    disabled = client.put(f"/api/agents/{general_id}", json={"persist_history": False})
    assert disabled.status_code == 200
    assert client.get(f"/api/conversations?agent_id={general_id}").json() == []
    assert client.get(f"/api/agents/{general_id}/executions").json() == []
    persisted = sqlite3.connect(DATABASE_PATH)
    assert persisted.execute(
        "SELECT COUNT(*) FROM execution_logs WHERE agent_id = ?", (general_id,)
    ).fetchone()[0] == 0
    persisted.close()
