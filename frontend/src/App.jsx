import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, CirclePlus, Cpu, RefreshCw, Sparkles } from "lucide-react";
import AgentGrid from "./components/AgentGrid.jsx";
import AgentModalForm from "./components/AgentModalForm.jsx";
import ExecutionConsole from "./components/ExecutionConsole.jsx";
import ExecutionHistory from "./components/ExecutionHistory.jsx";
import Badge from "./components/common/Badge.jsx";
import Button from "./components/common/Button.jsx";
import { api } from "./services/api.js";

export default function App() {
  const [agents, setAgents] = useState([]);
  const [models, setModels] = useState([]);
  const [runStates, setRunStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [historyAgent, setHistoryAgent] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [execution, setExecution] = useState(null);
  const [executionAgentName, setExecutionAgentName] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [agentList, modelResult] = await Promise.all([api.getAgents(), api.getModels()]);
      setAgents(agentList);
      setModels(modelResult.models || []);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveAgent = async (payload, id) => {
    setSaving(true);
    try {
      await api.saveAgent(payload, id);
      setModalOpen(false);
      setEditingAgent(null);
      await loadData();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  };

  const runAgent = async (agent) => {
    setRunStates((current) => ({ ...current, [agent.id]: { status: "running" } }));
    try {
      const result = await api.runAgent(agent.id);
      setExecution({ execution_id: result.execution_id });
      setExecutionAgentName(agent.name);
      setHistoryAgent(agent);
    } catch (cause) {
      setRunStates((current) => ({ ...current, [agent.id]: { status: "failed" } }));
      setError(cause.message);
    }
  };

  const viewExecution = (item) => {
    setExecution({ execution_id: item.id });
    setExecutionAgentName(historyAgent?.name || "Agente");
  };

  const deleteAgent = async (agent) => {
    if (!window.confirm(`¿Eliminar el agente “${agent.name}” y su historial?`)) return;
    try {
      await api.deleteAgent(agent.id);
      if (historyAgent?.id === agent.id) setHistoryAgent(null);
      await loadData();
    } catch (cause) {
      setError(cause.message);
    }
  };

  const completeExecution = useCallback((result) => {
    if (execution && historyAgent) {
      setRunStates((current) => ({ ...current, [historyAgent.id]: { status: result } }));
      setHistoryRefresh((current) => current + 1);
    }
  }, [execution, historyAgent]);

  return (
    <main className="min-h-screen bg-canvas text-zinc-100">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-accent/20 bg-accent/10 text-accent shadow-glow">
              <Sparkles size={22} />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[.22em] text-accent">Local AI Workspace</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agents Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-500">Orquesta y observa tus agentes locales en un solo lugar.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={loadData} aria-label="Actualizar"><RefreshCw size={15} /> Actualizar</Button>
            <Button variant="primary" onClick={() => { setEditingAgent(null); setModalOpen(true); }}><CirclePlus size={16} /> Nuevo agente</Button>
          </div>
        </header>

        <div className="mb-7 grid gap-3 sm:grid-cols-3">
          <Summary icon={<Bot size={17} />} label="Agentes configurados" value={agents.length} />
          <Summary icon={<Cpu size={17} />} label="Modelos disponibles" value={models.length} />
          <Summary icon={<Activity size={17} />} label="Motor local" value="Ollama" trailing={<Badge status={models.length ? "success" : "idle"}>{models.length ? "Conectado" : "Revisar"}</Badge>} />
        </div>

        {error && (
          <div role="alert" className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200">
            <span>{error}. Verifica que FastAPI y Ollama estén activos.</span>
            <button onClick={() => setError("")} className="text-red-300 hover:text-white">Cerrar</button>
          </div>
        )}

        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-zinc-500">Workspace</p>
              <h2 className="text-lg font-semibold">Tus agentes</h2>
            </div>
            <span className="text-xs text-zinc-500">{agents.length} total</span>
          </div>
          {loading ? (
            <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-sm text-zinc-500">Cargando agentes...</div>
          ) : (
            <AgentGrid
              agents={agents}
              runStates={runStates}
              onRun={runAgent}
              onEdit={(agent) => { setEditingAgent(agent); setModalOpen(true); }}
              onDelete={deleteAgent}
              onHistory={setHistoryAgent}
            />
          )}
        </section>

        <ExecutionHistory agent={historyAgent} refreshKey={historyRefresh} onView={viewExecution} />
      </div>
      <AgentModalForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={saveAgent}
        agent={editingAgent}
        models={models}
        saving={saving}
      />
      <ExecutionConsole
        execution={execution}
        agentName={executionAgentName}
        onClose={() => setExecution(null)}
        onComplete={completeExecution}
      />
    </main>
  );
}

function Summary({ icon, label, value, trailing }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="text-zinc-500">{icon}</span>
        <div>
          <p className="text-[11px] text-zinc-500">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-100">{value}</p>
        </div>
      </div>
      {trailing}
    </div>
  );
}
