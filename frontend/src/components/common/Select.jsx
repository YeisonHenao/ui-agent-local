export default function Select({ label, children, className = "", ...props }) {
  return (
    <label className="block space-y-2">
      {label && <span className="block text-xs font-medium text-zinc-300">{label}</span>}
      <select
        className={`w-full rounded-lg border border-line bg-[#17171b] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/10 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
