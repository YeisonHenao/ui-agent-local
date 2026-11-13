import { useEffect, useRef } from "react";

export default function TerminalStream({ output, className = "" }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);
  return (
    <pre className={`min-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/[0.06] bg-[#080809] p-4 font-mono text-xs leading-6 text-zinc-300 ${className}`}>
      {output || <span className="text-zinc-600">Esperando salida del agente...</span>}
      <span ref={endRef} />
    </pre>
  );
}
