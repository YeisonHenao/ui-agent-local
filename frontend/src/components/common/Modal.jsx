import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-line bg-[#111114] shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-[#111114] px-6 py-4">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="p-6">{children}</div>
      </section>
    </div>
  );
}
