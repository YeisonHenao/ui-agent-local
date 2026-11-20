import { useEffect, useState } from "react";
import Button from "./common/Button.jsx";
import Input from "./common/Input.jsx";
import Modal from "./common/Modal.jsx";
import Select from "./common/Select.jsx";
import Textarea from "./common/Textarea.jsx";

const emptyAgent = {
  name: "",
  description: "",
  system_prompt: "",
  ollama_model: "qwen2.5:3b",
  script_path: "example_agent.py",
  tools_config: {},
  persist_history: true
};

export default function AgentModalForm({ open, onClose, onSave, agent, models, saving }) {
  const [form, setForm] = useState(emptyAgent);
  const [toolsText, setToolsText] = useState("{}");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (open) {
      const next = agent ? { ...agent } : { ...emptyAgent };
      setForm(next);
      setToolsText(JSON.stringify(next.tools_config || {}, null, 2));
      setFormError("");
    }
  }, [open, agent]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    let tools_config;
    try {
      tools_config = JSON.parse(toolsText || "{}");
      if (!tools_config || Array.isArray(tools_config) || typeof tools_config !== "object") {
        throw new Error("Debe ser un objeto JSON.");
      }
    } catch (error) {
      setFormError(`Configuración de herramientas inválida: ${error.message}`);
      return;
    }
    setFormError("");
    await onSave({ ...form, tools_config }, agent?.id);
  };

  return (
    <Modal open={open} onClose={onClose} title={agent ? "Editar agente" : "Nuevo agente"}>
      <form className="space-y-4" onSubmit={submit}>
        <Input label="Nombre" value={form.name} onChange={update("name")} placeholder="Asistente de correo" required maxLength={120} />
        <Input label="Descripción" value={form.description} onChange={update("description")} placeholder="Qué hace este agente" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Modelo Ollama" value={form.ollama_model} onChange={update("ollama_model")}>
            {!models.length && <option value="qwen2.5:3b">qwen2.5:3b (predeterminado)</option>}
            {models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
          </Select>
          <Textarea
            label="Ruta o comando Python"
            value={form.script_path}
            onChange={update("script_path")}
            placeholder={"example_agent.py\n/path/to/.venv/bin/python /path/to/agent.py --json"}
            hint="Ruta dentro de AGENT_SCRIPTS_DIR o comando Python. Los argumentos se pasan sin shell."
            required
            rows={2}
          />
        </div>
        <Textarea label="System prompt" value={form.system_prompt} onChange={update("system_prompt")} rows={4} placeholder="Instrucciones base del agente..." />
        <Textarea label="Tools config (JSON)" value={toolsText} onChange={(event) => setToolsText(event.target.value)} rows={4} spellCheck={false} />
        <label className="flex items-start gap-3 rounded-xl border border-line bg-black/20 p-3.5">
          <input
            type="checkbox"
            className="mt-0.5 accent-lime-400"
            checked={form.persist_history}
            onChange={(event) => setForm((current) => ({ ...current, persist_history: event.target.checked }))}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-200">Guardar conversaciones e historial</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">
              Desactívalo para agentes que procesan correo u otros datos privados. No se guardarán mensajes, resultados ni logs.
            </span>
          </span>
        </label>
        {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={saving}>Guardar agente</Button>
        </div>
      </form>
    </Modal>
  );
}
