import { LoaderCircle } from "lucide-react";

const variants = {
  primary: "bg-accent text-zinc-950 hover:bg-lime-300",
  danger: "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
  ghost: "border border-line bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08]",
  subtle: "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
};

export default function Button({
  children,
  variant = "ghost",
  loading = false,
  className = "",
  disabled,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
