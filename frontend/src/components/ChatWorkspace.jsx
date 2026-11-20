import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Brain, FileText, FolderOpen, LoaderCircle, MessageCircle, Pencil, Plus, Send, ShieldCheck, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { api, logsSocketUrl } from "../services/api.js";
import Button from "./common/Button.jsx";
import MarkdownContent from "./common/MarkdownContent.jsx";
import Select from "./common/Select.jsx";
import TerminalStream from "./common/TerminalStream.jsx";

function assistantText(output) {
  for (const line of output.split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line);
      if (typeof value.summary === "string") return value.summary;
    } catch {
      continue;
    }
  }
  const marker = "Respuesta generada:";
  const markerIndex = output.lastIndexOf(marker);
  if (markerIndex >= 0) return output.slice(markerIndex + marker.length).trim();
  return output.trim() || "El agente terminó sin devolver texto.";
}

function formatTime(value) {
  return new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

const DIRECT_ATTACHMENT_CONTEXT_LIMIT = 32_000;

export default function ChatWorkspace({ agents, models, onError, onBusyChange }) {
  const [mode, setMode] = useState("general");
  const [generalBusy, setGeneralBusy] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [output, setOutput] = useState("");
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const outputRef = useRef("");
  const completedRef = useRef(false);
  const agent = useMemo(() => agents.find((item) => item.id === Number(agentId)), [agents, agentId]);

  useEffect(() => {
    if (!agentId && agents.length) setAgentId(String(agents[0].id));
  }, [agents, agentId]);

  const refreshConversations = useCallback(async (selectedAgentId) => {
    const items = await api.getConversations(selectedAgentId);
    setConversations(items);
    return items;
  }, []);

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setOutput("");
    setConversations([]);
    if (!agent?.persist_history) return undefined;
    let active = true;
    api.getConversations(agent.id)
      .then(async (items) => {
        if (!active) return;
        setConversations(items);
        const latest = items[0];
        if (!latest) return;
        setConversationId(latest.id);
        const history = await api.getConversationMessages(latest.id);
        if (active) setMessages(history);
      })
      .catch((cause) => { if (active) onError(cause.message); });
    return () => { active = false; };
  }, [agent, onError]);

  useEffect(() => {
    if (!conversationId || !agent?.persist_history) return undefined;
    let active = true;
    api.getConversationMessages(conversationId)
      .then((history) => { if (active) setMessages(history); })
      .catch((cause) => { if (active) onError(cause.message); });
    return () => { active = false; };
  }, [agent?.persist_history, conversationId, onError]);

  useEffect(() => {
    onBusyChange(pending || (mode === "general" && generalBusy));
  }, [generalBusy, mode, onBusyChange, pending]);

  useEffect(() => () => {
    completedRef.current = true;
    socketRef.current?.close();
  }, []);

  const chooseConversation = async (id) => {
    setConversationId(id);
    setOutput("");
    try {
      setMessages(await api.getConversationMessages(id));
    } catch (cause) {
      onError(cause.message);
    }
  };

  const startNewConversation = () => {
    if (pending) return;
    setConversationId(null);
    setMessages([]);
    setOutput("");
  };

  const deleteConversation = async (id, event) => {
    event.stopPropagation();
    if (pending) return;
    if (!window.confirm("¿Eliminar esta conversación y sus resultados guardados?")) return;
    try {
      await api.deleteConversation(id);
      const remaining = await refreshConversations(agent.id);
      if (conversationId === id) {
        setConversationId(remaining[0]?.id ?? null);
        setMessages(remaining[0] ? await api.getConversationMessages(remaining[0].id) : []);
      }
    } catch (cause) {
      onError(cause.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || !agent || pending) return;

    setDraft("");
    setPending(true);
    setConnected(false);
    completedRef.current = false;
    outputRef.current = "";
    setOutput("");
    setMessages((current) => [...current, {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: prompt,
      created_at: new Date().toISOString()
    }]);

    try {
      const started = await api.runChatAgent({
        agent_id: agent.id,
        prompt,
        ...(agent.persist_history && conversationId ? { conversation_id: conversationId } : {})
      });
      if (started.conversation_id) {
        setConversationId(started.conversation_id);
        setConversations(await refreshConversations(agent.id));
      }
      const socket = new WebSocket(logsSocketUrl(started.execution_id));
      socketRef.current = socket;
      socket.onopen = () => setConnected(true);
      socket.onmessage = async (socketEvent) => {
        const message = JSON.parse(socketEvent.data);
        if (message.type === "output") {
          outputRef.current += message.data;
          setOutput((current) => current + message.data);
        } else if (message.type === "complete") {
          completedRef.current = true;
          const answer = assistantText(outputRef.current);
          setPending(false);
          setConnected(false);
          if (started.persisted && started.conversation_id) {
            try {
              const history = await api.getConversationMessages(started.conversation_id);
              setMessages(history);
            } catch (cause) {
              onError(cause.message);
              setMessages((current) => [...current, {
                id: `local-assistant-${Date.now()}`,
                role: "assistant",
                content: answer,
                created_at: new Date().toISOString()
              }]);
            }
          } else {
            setMessages((current) => [...current, {
              id: `local-assistant-${Date.now()}`,
              role: "assistant",
              content: answer,
              created_at: new Date().toISOString()
            }]);
          }
          socket.close();
        } else if (message.type === "error") {
          completedRef.current = true;
          setPending(false);
          setConnected(false);
          onError(message.data);
          socket.close();
        }
      };
      socket.onerror = () => {
        completedRef.current = true;
        setPending(false);
        setConnected(false);
        onError("No se pudo conectar al stream del agente.");
      };
      socket.onclose = () => {
        setConnected(false);
        if (!completedRef.current) {
          setPending(false);
          onError("El stream del agente se cerró antes de completar la ejecución.");
        }
      };
    } catch (cause) {
      setPending(false);
      onError(cause.message);
      setMessages((current) => [...current, {
        id: `local-error-${Date.now()}`,
        role: "assistant",
        content: `No se pudo iniciar el agente: ${cause.message}`,
        created_at: new Date().toISOString()
      }]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Modo de chat">
        <Button variant={mode === "general" ? "primary" : "ghost"} disabled={pending || generalBusy} onClick={() => setMode("general")}>
          <MessageCircle size={15} /> Chat general
        </Button>
        <Button variant={mode === "agent" ? "primary" : "ghost"} disabled={pending || generalBusy} onClick={() => setMode("agent")}>
          <Bot size={15} /> Ejecutar agente
        </Button>
      </div>
      {mode === "general" ? (
        <GeneralChat models={models} onError={onError} onBusyChange={setGeneralBusy} />
      ) : !agents.length ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-zinc-500">
          Todavía no hay agentes. Crea uno desde la sección Agentes para ejecutarlo aquí.
        </div>
      ) : (
      <section className="grid min-h-[68vh] overflow-hidden rounded-2xl border border-line bg-panel lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="border-b border-line p-4 lg:border-b-0 lg:border-r">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Conversaciones</h2>
          {agent?.persist_history && (
            <button onClick={startNewConversation} disabled={pending} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-accent disabled:opacity-40" aria-label="Nueva conversación">
              <Plus size={17} />
            </button>
          )}
        </div>
        {agent?.persist_history ? (
          <div className="space-y-1">
            {conversations.map((item) => (
              <div key={item.id} className="group flex items-center gap-1">
                <button
                  onClick={() => chooseConversation(item.id)}
                  disabled={pending}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${conversationId === item.id ? "bg-white/[0.07] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"}`}
                >
                  <MessageCircle size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </button>
                <button type="button" aria-label="Eliminar conversación" disabled={pending} onClick={(event) => deleteConversation(item.id, event)} className="rounded p-1.5 text-zinc-600 opacity-0 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100 disabled:opacity-30">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {!conversations.length && <p className="px-3 py-2 text-xs leading-5 text-zinc-600">Tus conversaciones generales aparecerán aquí.</p>}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-xs leading-5 text-amber-100/70">
            <ShieldCheck size={16} className="mb-2 text-amber-300" />
            Este agente no guarda mensajes, resultados ni logs en SQLite. El chat solo vive en esta pestaña.
          </div>
        )}
      </aside>

      <div className="flex min-h-[68vh] min-w-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent"><Bot size={18} /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">Chat con agente</p>
              <p className="text-xs text-zinc-500">{agent?.description || "Ejecuta un agente local desde el chat."}</p>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <Select aria-label="Seleccionar agente" value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={pending}>
              {agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-7">
          {!messages.length && !pending && (
            <div className="mx-auto mt-12 max-w-md text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-accent/20 bg-accent/10 text-accent"><MessageCircle size={22} /></div>
              <h3 className="font-semibold text-zinc-200">¿Qué quieres ejecutar?</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                {agent?.persist_history
                  ? "Cada envío inicia una ejecución independiente. El mensaje se entrega como AGENT_USER_MESSAGE; el historial se guarda, pero aún no se usa como memoria del agente."
                  : "Este agente ejecuta su tarea configurada. La solicitud y el resultado solo se conservan en esta vista; el script puede ignorar el mensaje si su tarea es fija."}
              </p>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${message.role === "user" ? "bg-accent text-zinc-950" : "border border-line bg-black/20 text-zinc-200"}`}>
                {message.role === "assistant"
                  ? <MarkdownContent content={message.content} />
                  : <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>}
                <time className={`mt-2 block text-[10px] ${message.role === "user" ? "text-zinc-800/70" : "text-zinc-600"}`}>{formatTime(message.created_at)}</time>
              </div>
            </article>
          ))}
          {pending && (
            <article className="flex justify-start">
              <div className="w-full max-w-[90%] space-y-3 rounded-2xl border border-line bg-black/20 p-4 sm:max-w-[78%]">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <LoaderCircle size={15} className="animate-spin text-accent" />
                  {connected ? "El agente está trabajando..." : "Conectando con el agente..."}
                  {connected ? <Wifi size={14} className="ml-auto text-lime-300" /> : <WifiOff size={14} className="ml-auto text-zinc-600" />}
                </div>
                {output && <TerminalStream output={output} className="max-h-64 min-h-20" />}
              </div>
            </article>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-line p-4 sm:p-5">
          <div className="flex items-end gap-2 rounded-xl border border-line bg-black/25 p-2 focus-within:border-accent/40">
            <textarea
              aria-label="Mensaje para el agente"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              placeholder={agent?.persist_history ? "Escribe una solicitud..." : "Ej.: resumir los últimos 10 correos"}
              rows={2}
              maxLength={4000}
              disabled={pending}
              className="max-h-36 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-50"
            />
            <Button type="submit" variant="primary" className="mb-1 px-3" disabled={!draft.trim() || pending} aria-label="Enviar mensaje">
              <Send size={15} />
            </Button>
          </div>
          <p className="mt-2 px-1 text-[10px] text-zinc-600">Enter para enviar · Shift+Enter para nueva línea{!agent?.persist_history && " · No se guarda en SQLite"}</p>
        </form>
      </div>
      </section>
      )}
    </div>
  );
}

function GeneralChat({ models, onError, onBusyChange }) {
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("");
  const [pending, setPending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [toolManifest, setToolManifest] = useState(null);
  const [memories, setMemories] = useState([]);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState(null);
  const [memorySaving, setMemorySaving] = useState(false);
  const modelAvailable = models.some((item) => item.name === model);
  const attachmentCharacters = attachments.reduce((total, item) => total + item.content.length, 0);

  useEffect(() => {
    if (!model && models.length) setModel(models[0].name);
  }, [model, models]);

  useEffect(() => { onBusyChange(pending); }, [onBusyChange, pending]);

  useEffect(() => {
    api.getChatTools()
      .then(setToolManifest)
      .catch((cause) => onError(cause.message));
  }, [onError]);

  useEffect(() => {
    api.getAssistantMemories()
      .then(setMemories)
      .catch((cause) => onError(cause.message));
  }, [onError]);

  useEffect(() => {
    let active = true;
    api.getGeneralConversations()
      .then(async (items) => {
        if (!active) return;
        setConversations(items);
        const latest = items[0];
        if (!latest) return;
        setConversationId(latest.id);
        setModel(latest.model);
        const history = await api.getGeneralConversationMessages(latest.id);
        if (active) setMessages(history);
      })
      .catch((cause) => { if (active) onError(cause.message); });
    return () => { active = false; };
  }, [onError]);

  const refreshConversations = async () => {
    const items = await api.getGeneralConversations();
    setConversations(items);
    return items;
  };

  const refreshMemories = async () => {
    const items = await api.getAssistantMemories();
    setMemories(items);
    return items;
  };

  const saveMemory = async (event) => {
    event.preventDefault();
    const content = memoryDraft.trim();
    if (!content || memorySaving) return;
    setMemorySaving(true);
    try {
      if (editingMemoryId) {
        await api.updateAssistantMemory(editingMemoryId, content);
      } else {
        await api.createAssistantMemory(content);
      }
      await refreshMemories();
      setMemoryDraft("");
      setEditingMemoryId(null);
    } catch (cause) {
      onError(cause.message);
    } finally {
      setMemorySaving(false);
    }
  };

  const editMemory = (memory) => {
    setMemoryPanelOpen(true);
    setEditingMemoryId(memory.id);
    setMemoryDraft(memory.content);
  };

  const cancelMemoryEdit = () => {
    setEditingMemoryId(null);
    setMemoryDraft("");
  };

  const deleteMemory = async (memory) => {
    if (!window.confirm("¿Eliminar este recuerdo de la memoria entre chats?")) return;
    try {
      await api.deleteAssistantMemory(memory.id);
      await refreshMemories();
      if (editingMemoryId === memory.id) cancelMemoryEdit();
    } catch (cause) {
      onError(cause.message);
    }
  };

  const chooseConversation = async (item) => {
    setConversationId(item.id);
    setModel(item.model);
    try {
      setMessages(await api.getGeneralConversationMessages(item.id));
    } catch (cause) {
      onError(cause.message);
    }
  };

  const startNewConversation = () => {
    if (pending) return;
    setConversationId(null);
    setMessages([]);
  };

  const deleteConversation = async (id, event) => {
    event.stopPropagation();
    if (pending) return;
    if (!window.confirm("¿Eliminar esta conversación y sus mensajes?")) return;
    try {
      await api.deleteGeneralConversation(id);
      const remaining = await refreshConversations();
      if (conversationId === id) {
        const next = remaining[0];
        setConversationId(next?.id ?? null);
        setModel(next?.model || models[0]?.name || "");
        setMessages(next ? await api.getGeneralConversationMessages(next.id) : []);
      }
    } catch (cause) {
      onError(cause.message);
    }
  };

  const addFiles = async (fileList) => {
    const selected = Array.from(fileList);
    if (!selected.length) return;
    try {
      const supported = selected.filter((file) => /\.(txt|md|markdown|csv|json)$/i.test(file.webkitRelativePath || file.name));
      const skipped = selected.length - supported.length;
      if (!supported.length) {
        throw new Error("No se encontraron archivos TXT, Markdown, CSV o JSON.");
      }
      if (attachments.length + supported.length > 25) {
        throw new Error("Puedes adjuntar hasta 25 archivos por consulta.");
      }
      const loaded = await Promise.all(supported.map(async (file) => {
        const path = file.webkitRelativePath || file.name;
        if (file.size > 512_000) {
          throw new Error(`${path} supera el límite de 500 KB.`);
        }
        const content = await file.text();
        if (content.includes("\u0000")) {
          throw new Error(`${path} no parece ser un archivo de texto válido.`);
        }
        return { path, content, size: file.size };
      }));
      const combined = [...attachments, ...loaded];
      if (new Set(combined.map((item) => item.path)).size !== combined.length) {
        throw new Error("Hay archivos repetidos. Quita el duplicado antes de continuar.");
      }
      if (combined.reduce((total, item) => total + item.size, 0) > 1_500_000) {
        throw new Error("Los adjuntos no pueden superar 1.5 MB en total.");
      }
      setAttachments(combined);
      setAttachmentNotice(skipped ? `Se omitieron ${skipped} archivo(s) con formato no compatible.` : "");
    } catch (cause) {
      setAttachmentNotice(cause.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const prompt = draft.trim();
    if (!prompt || !model || pending) return;
    setDraft("");
    setPending(true);
    setMessages((current) => [...current, {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: prompt,
      created_at: new Date().toISOString()
    }]);

    try {
      const result = await api.runGeneralChat({
        model,
        prompt,
        attachments: attachments.map(({ path, content }) => ({ path, content })),
        ...(conversationId ? { conversation_id: conversationId } : {})
      });
      setAttachments([]);
      setAttachmentNotice("");
      setConversationId(result.conversation_id);
      setMessages((current) => [...current, {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: result.response,
        created_at: new Date().toISOString()
      }]);
      try {
        const [history] = await Promise.all([
          api.getGeneralConversationMessages(result.conversation_id),
          refreshConversations()
        ]);
        setMessages(history);
      } catch (cause) {
        onError(cause.message);
      }
    } catch (cause) {
      onError(cause.message);
      setMessages((current) => [...current, {
        id: `local-error-${Date.now()}`,
        role: "assistant",
        content: `No se pudo obtener una respuesta: ${cause.message}`,
        created_at: new Date().toISOString()
      }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="grid min-h-[68vh] overflow-hidden rounded-2xl border border-line bg-panel lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="border-b border-line p-4 lg:border-b-0 lg:border-r">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Chats generales</h2>
          <button onClick={startNewConversation} disabled={pending} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-accent disabled:opacity-40" aria-label="Nuevo chat">
            <Plus size={17} />
          </button>
        </div>
        <div className="space-y-1">
          {conversations.map((item) => (
            <div key={item.id} className="group flex items-center gap-1">
              <button
                onClick={() => chooseConversation(item)}
                disabled={pending}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${conversationId === item.id ? "bg-white/[0.07] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"}`}
              >
                <MessageCircle size={15} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
              </button>
              <button type="button" aria-label="Eliminar conversación" disabled={pending} onClick={(event) => deleteConversation(item.id, event)} className="rounded p-1.5 text-zinc-600 opacity-0 hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100 disabled:opacity-30">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {!conversations.length && <p className="px-3 py-2 text-xs leading-5 text-zinc-600">Tus chats se guardan aquí automáticamente.</p>}
        </div>
        <div className="mt-6 border-t border-line pt-4">
          <button
            type="button"
            aria-expanded={memoryPanelOpen}
            onClick={() => setMemoryPanelOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-zinc-300 hover:bg-white/[0.04]"
          >
            <span className="flex items-center gap-2"><Brain size={15} className="text-accent" /> Memoria entre chats</span>
            <span className="text-xs text-zinc-500">{memories.length}/20</span>
          </button>
          {memoryPanelOpen && (
            <div className="mt-2 space-y-3 px-1">
              <p className="text-[11px] leading-5 text-zinc-500">
                Solo se guarda lo que escribas aquí. Estos recuerdos se usan como contexto en tus chats y puedes editarlos o borrarlos.
              </p>
              {memories.map((memory) => (
                <div key={memory.id} className="group rounded-lg border border-line bg-black/15 p-2.5">
                  <p className="whitespace-pre-wrap break-words text-xs leading-5 text-zinc-300">{memory.content}</p>
                  <div className="mt-2 flex justify-end gap-1">
                    <button type="button" onClick={() => editMemory(memory)} className="rounded p-1.5 text-zinc-500 hover:bg-white/[0.06] hover:text-accent" aria-label="Editar recuerdo">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => deleteMemory(memory)} className="rounded p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Eliminar recuerdo">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <form onSubmit={saveMemory} className="space-y-2">
                <textarea
                  aria-label="Recuerdo para usar entre chats"
                  value={memoryDraft}
                  onChange={(event) => setMemoryDraft(event.target.value)}
                  placeholder="Ej.: Prefiero respuestas breves con ejemplos."
                  rows={3}
                  maxLength={500}
                  disabled={memorySaving}
                  className="w-full resize-y rounded-lg border border-line bg-black/25 px-3 py-2 text-xs leading-5 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-accent/40"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-600">{memoryDraft.length}/500</span>
                  <div className="flex gap-2">
                    {editingMemoryId && <Button type="button" className="px-2 py-1 text-xs" onClick={cancelMemoryEdit}>Cancelar</Button>}
                    <Button type="submit" variant="primary" className="px-2 py-1 text-xs" disabled={!memoryDraft.trim() || memorySaving || (!editingMemoryId && memories.length >= 20)}>
                      {editingMemoryId ? "Actualizar" : "Guardar"}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-[68vh] min-w-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent"><MessageCircle size={18} /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">Chat abierto</p>
              <p className="text-xs text-zinc-500">Conversa directamente con Ollama, sin ejecutar un agente.</p>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <Select aria-label="Seleccionar modelo" value={model} onChange={(event) => setModel(event.target.value)} disabled={pending || !models.length}>
              {!models.length && <option value="">No hay modelos disponibles</option>}
              {model && models.length > 0 && !modelAvailable && <option value={model}>{model} (no disponible)</option>}
              {models.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </Select>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-7">
          {!messages.length && !pending && (
            <div className="mx-auto mt-12 max-w-md text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-accent/20 bg-accent/10 text-accent"><MessageCircle size={22} /></div>
              <h3 className="font-semibold text-zinc-200">¿En qué puedo ayudarte?</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Haz preguntas generales y mantén el contexto durante toda la conversación. Puedes cambiar de modelo cuando quieras.</p>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${message.role === "user" ? "bg-accent text-zinc-950" : "border border-line bg-black/20 text-zinc-200"}`}>
                {message.role === "assistant"
                  ? <MarkdownContent content={message.content} />
                  : <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>}
                <time className={`mt-2 block text-[10px] ${message.role === "user" ? "text-zinc-800/70" : "text-zinc-600"}`}>{formatTime(message.created_at)}</time>
              </div>
            </article>
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <LoaderCircle size={15} className="animate-spin text-accent" />
              {attachments.length ? "El modelo está revisando los archivos..." : "El modelo está preparando una respuesta..."}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-line p-4 sm:p-5">
          {attachmentNotice && <p role="alert" className="mb-3 text-xs text-amber-200">{attachmentNotice}</p>}
          {attachments.length > 0 && (
            <div className="mb-3 space-y-2" aria-label="Archivos seleccionados">
              <p className="text-xs text-zinc-400">{attachments.length} archivo(s) · disponibles solo para esta consulta</p>
              <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                {attachments.map((item) => (
                  <span key={item.path} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-xs text-zinc-300">
                    <FileText size={13} className="shrink-0 text-accent" />
                    <span className="max-w-64 truncate">{item.path}</span>
                    <button type="button" aria-label={`Quitar ${item.path}`} disabled={pending} onClick={() => setAttachments((current) => current.filter((file) => file.path !== item.path))} className="text-zinc-500 hover:text-red-300">
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-line bg-black/25 p-2 focus-within:border-accent/40">
            <textarea
              aria-label="Mensaje para el chat general"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              placeholder="Escribe cualquier pregunta..."
              rows={2}
              maxLength={4000}
              disabled={pending}
              className="max-h-36 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-50"
            />
            <label className="mb-1 cursor-pointer rounded-lg p-2.5 text-zinc-400 hover:bg-white/[0.06] hover:text-accent" title="Adjuntar archivos de texto">
              <FileText size={17} />
              <input
                type="file"
                multiple
                accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                disabled={pending}
                onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
                className="sr-only"
                aria-label="Adjuntar archivos"
              />
            </label>
            <label className="mb-1 cursor-pointer rounded-lg p-2.5 text-zinc-400 hover:bg-white/[0.06] hover:text-accent" title="Seleccionar una carpeta">
              <FolderOpen size={17} />
              <input
                type="file"
                multiple
                webkitdirectory=""
                disabled={pending}
                onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
                className="sr-only"
                aria-label="Seleccionar carpeta"
              />
            </label>
            <Button type="submit" variant="primary" className="mb-1 px-3" disabled={!draft.trim() || !modelAvailable || pending} aria-label="Enviar mensaje">
              <Send size={15} />
            </Button>
          </div>
          <p className="mt-2 px-1 text-[10px] text-zinc-600">
            Enter para enviar · Shift+Enter para nueva línea · TXT, Markdown, CSV y JSON · Los archivos no se guardan; la pregunta y respuesta sí
            {model && models.length > 0 && !modelAvailable && " · Elige un modelo disponible para continuar"}
          </p>
          {attachments.length > 0 && attachmentCharacters <= DIRECT_ATTACHMENT_CONTEXT_LIMIT && (
            <p className="mt-1 px-1 text-[10px] text-zinc-500">
              El contenido se enviará directamente al modelo.
            </p>
          )}
          {attachments.length > 0 && attachmentCharacters > DIRECT_ATTACHMENT_CONTEXT_LIMIT && toolManifest && (
            <p className="mt-1 px-1 text-[10px] text-zinc-500">
              Herramientas de lectura activas: {toolManifest.tools.map((tool) => tool.name).join(", ")}.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
