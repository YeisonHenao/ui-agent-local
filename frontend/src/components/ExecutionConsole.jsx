import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import Badge from "./common/Badge.jsx";
import Card from "./common/Card.jsx";
import Modal from "./common/Modal.jsx";
import TerminalStream from "./common/TerminalStream.jsx";
import { logsSocketUrl } from "../services/api.js";

export default function ExecutionConsole({ execution, agentName, onClose, onComplete }) {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("running");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!execution?.execution_id) return undefined;
    setOutput("");
    setStatus("running");
    let socket;
    let cancelled = false;
    const connectionTimer = window.setTimeout(() => {
      if (cancelled) return;
      socket = new WebSocket(logsSocketUrl(execution.execution_id));
      socket.onopen = () => setConnected(true);
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "output") setOutput((current) => current + message.data);
        if (message.type === "complete") {
          const result = message.data.toLowerCase() === "success" ? "success" : "failed";
          setStatus(result);
          onComplete?.(result);
          socket.close();
        }
        if (message.type === "error") {
          setOutput((current) => `${current}${message.data}\n`);
          setStatus("failed");
          socket.close();
        }
      };
      socket.onclose = () => setConnected(false);
      socket.onerror = () => {
        setConnected(false);
        setOutput((current) => current || "No fue posible conectar con el stream de logs.\n");
      };
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(connectionTimer);
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    };
  }, [execution?.execution_id, onComplete]);

  return (
    <Modal open={Boolean(execution)} onClose={onClose} title={`Ejecución · ${agentName || "Agente"}`} wide>
      <Card
        eyebrow={`Execution #${execution?.execution_id ?? "—"}`}
        title="Terminal de agente"
        action={<div className="flex items-center gap-3">{connected ? <Wifi size={15} className="text-lime-300" /> : <WifiOff size={15} className="text-zinc-600" />}<Badge status={status} /></div>}
        bodyClassName="p-4"
      >
        <TerminalStream output={output} className="max-h-[55vh]" />
      </Card>
    </Modal>
  );
}
