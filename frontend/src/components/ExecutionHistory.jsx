import { Clock3, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import Badge from "./common/Badge.jsx";
import Button from "./common/Button.jsx";
import Card from "./common/Card.jsx";

function formatDate(value) {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ExecutionHistory({ agent, refreshKey, onView }) {
  const [executions, setExecutions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!agent) return undefined;
    let active = true;
    api.getExecutions(agent.id)
      .then((items) => { if (active) { setExecutions(items); setError(""); } })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [agent, refreshKey]);

  return (
    <Card title="Historial de ejecuciones" eyebrow={agent ? agent.name : "Selecciona un agente"} bodyClassName="p-0">
      {!agent ? (
        <div className="px-5 py-8 text-sm text-zinc-500">Elige “Logs” en una tarjeta para consultar el historial.</div>
      ) : error ? (
        <div role="alert" className="px-5 py-6 text-sm text-red-300">{error}</div>
      ) : executions.length === 0 ? (
        <div className="px-5 py-8 text-sm text-zinc-500">No hay ejecuciones registradas.</div>
      ) : (
        <div className="divide-y divide-line">
          {executions.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <Clock3 size={15} className="text-zinc-500" />
                <div>
                  <p className="text-sm text-zinc-200">Ejecución #{item.id}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{formatDate(item.timestamp)} · {item.execution_time_ms == null ? "—" : `${item.execution_time_ms} ms`}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge status={item.status} />
                <Button variant="subtle" className="px-2" onClick={() => onView(item)} aria-label={`Ver ejecución ${item.id}`}><Eye size={16} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
