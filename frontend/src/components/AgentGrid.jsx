import { Bot, Pencil, Play, ScrollText, Trash2 } from "lucide-react";
import Badge from "./common/Badge.jsx";
import Button from "./common/Button.jsx";
import Card from "./common/Card.jsx";

export default function AgentGrid({ agents, runStates, onRun, onEdit, onDelete, onHistory }) {
  if (!agents.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <Bot className="mx-auto mb-4 text-zinc-600" size={30} />
        <h3 className="font-medium text-zinc-200">Todavía no hay agentes</h3>
        <p className="mt-1 text-sm text-zinc-500">Crea tu primer agente local para empezar.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => {
        const run = runStates[agent.id] || {};
        return (
          <Card key={agent.id} className="transition hover:border-zinc-600" bodyClassName="p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                  <Bot size={19} />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-zinc-100">{agent.name}</h3>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">{agent.ollama_model}</p>
                </div>
              </div>
              <Badge status={run.status || "idle"} />
            </div>
            <p className="mb-5 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-400">
              {agent.description || "Sin descripción"}
            </p>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="primary" onClick={() => onRun(agent)} loading={run.status === "running"}>
                <Play size={14} fill="currentColor" /> Ejecutar
              </Button>
              <Button onClick={() => onHistory(agent)} aria-label={`Ver logs de ${agent.name}`}><ScrollText size={15} /> Logs</Button>
              <Button variant="subtle" className="ml-auto px-2.5" onClick={() => onEdit(agent)} aria-label={`Editar ${agent.name}`}><Pencil size={15} /></Button>
              <Button variant="subtle" className="px-2.5 text-red-300 hover:text-red-200" onClick={() => onDelete(agent)} aria-label={`Eliminar ${agent.name}`}><Trash2 size={15} /></Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
