const API_BASE = "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Error HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  getAgents: () => request("/agents"),
  getModels: () => request("/models"),
  saveAgent: (agent, id) =>
    request(id ? `/agents/${id}` : "/agents", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(agent)
    }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: "DELETE" }),
  runAgent: (id) => request(`/agents/${id}/run`, { method: "POST" }),
  getExecutions: (agentId) => request(`/agents/${agentId}/executions`)
};

export function logsSocketUrl(executionId) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/logs/${executionId}`;
}
