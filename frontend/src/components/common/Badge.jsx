const styles = {
  idle: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
  running: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  success: "border-lime-400/20 bg-lime-400/10 text-lime-300",
  failed: "border-red-400/20 bg-red-400/10 text-red-300"
};

const labels = { idle: "Idle", running: "Running", success: "Success", failed: "Failed" };

export default function Badge({ status = "idle", children }) {
  const normalized = String(status).toLowerCase();
  const style = styles[normalized] || styles.idle;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${normalized === "running" ? "animate-pulse" : ""}`} />
      {children || labels[normalized] || status}
    </span>
  );
}
