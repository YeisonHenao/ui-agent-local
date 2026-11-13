export default function Card({ title, eyebrow, action, children, className = "", bodyClassName = "" }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-line bg-panel ${className}`}>
      {(title || eyebrow || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-zinc-500">{eyebrow}</p>}
            {title && <h2 className="font-semibold text-zinc-100">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
