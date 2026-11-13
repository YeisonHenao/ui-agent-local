export default function Input({ label, hint, className = "", ...props }) {
  return (
    <label className="block space-y-2">
      {label && <span className="block text-xs font-medium text-zinc-300">{label}</span>}
      <input
        className={`w-full rounded-lg border border-line bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-accent/60 focus:ring-2 focus:ring-accent/10 ${className}`}
        {...props}
      />
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
