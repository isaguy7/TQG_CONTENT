const STYLES: Record<string, string> = {
  sahabi: "bg-emerald-500/15 text-emerald-400",
  prophet: "bg-amber-500/15 text-amber-400",
  scholar: "bg-indigo-500/15 text-indigo-400",
  tabii: "bg-white/10 text-white/70",
};

const LABELS: Record<string, string> = {
  sahabi: "Sahabi",
  prophet: "Prophet",
  scholar: "Scholar",
  tabii: "Tabi'i",
};

export function FigureTypeBadge({ type }: { type: string }) {
  const cls = STYLES[type] || "bg-white/10 text-white/70";
  const label = LABELS[type] || type;
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}
