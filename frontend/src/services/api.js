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
  getExecutions: (agentId) => request(`/agents/${agentId}/executions`),
  getConversations: (agentId) => request(`/conversations?agent_id=${agentId}`),
  getConversationMessages: (id) => request(`/conversations/${id}/messages`),
  deleteConversation: (id) => request(`/conversations/${id}`, { method: "DELETE" }),
  getGeneralConversations: () => request("/general/conversations"),
  getGeneralConversationMessages: (id) => request(`/general/conversations/${id}/messages`),
  deleteGeneralConversation: (id) => request(`/general/conversations/${id}`, { method: "DELETE" }),
  getAssistantMemories: () => request("/general/memories"),
  createAssistantMemory: (content) =>
    request("/general/memories", { method: "POST", body: JSON.stringify({ content }) }),
  updateAssistantMemory: (id, content) =>
    request(`/general/memories/${id}`, { method: "PUT", body: JSON.stringify({ content }) }),
  deleteAssistantMemory: (id) => request(`/general/memories/${id}`, { method: "DELETE" }),
  getChatTools: () => request("/chat/tools"),
  runGeneralChat: (payload) =>
    request("/chat/general", { method: "POST", body: JSON.stringify(payload) }),
  runChatAgent: (payload) =>
    request("/chat/run", { method: "POST", body: JSON.stringify(payload) })
};

export function logsSocketUrl(executionId) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/logs/${executionId}`;
}
