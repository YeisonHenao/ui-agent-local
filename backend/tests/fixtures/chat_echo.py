import os

print(f"request={os.environ.get('AGENT_USER_MESSAGE', '')}", flush=True)
