import os

print(os.environ.get("AGENT_USER_MESSAGE", ""), flush=True)
print("PRIVATE_RESULT_SHOULD_NOT_PERSIST", flush=True)
