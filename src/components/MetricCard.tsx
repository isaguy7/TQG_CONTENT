import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  deltaDirection,
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="section-label">{label}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-white/90 tracking-tight tabular-nums">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "text-[11px] font-medium tabular-nums",
              deltaDirection === "up" && "text-primary-bright",
              deltaDirection === "down" && "text-danger",
              (!deltaDirection || deltaDirection === "flat") &&
                "text-white/40"
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-1.5 text-[11px] text-white/40">{hint}</div>
      ) : null}
    </div>
  );
}
