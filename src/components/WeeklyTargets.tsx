import { cn } from "@/lib/utils";

export type Target = {
  label: string;
  actual: number;
  target: number;
};

export function WeeklyTargets({ targets }: { targets: Target[] }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="section-label mb-3">This week</div>
      <ul className="space-y-3">
        {targets.map((t) => {
          const pct = Math.min(100, (t.actual / t.target) * 100);
          const done = t.actual >= t.target;
          return (
            <li key={t.label}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[12px] text-white/70">{t.label}</span>
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    done ? "text-primary-bright" : "text-white/50"
                  )}
                >
                  {t.actual}/{t.target}
                </span>
              </div>
              <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    done ? "bg-primary-hover" : "bg-white/20"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HookPerformance({
  tier1Avg,
  tier2Avg,
}: {
  tier1Avg: number;
  tier2Avg: number;
}) {
  const multiplier = tier2Avg > 0 ? tier1Avg / tier2Avg : 0;
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="section-label mb-3">Hook performance</div>
      <div className="flex items-center gap-6">
        <div>
          <div className="text-[11px] text-white/40">Tier 1 avg</div>
          <div className="text-[15px] text-white/85 tabular-nums font-medium">
            {tier1Avg.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-white/40">Tier 2 avg</div>
          <div className="text-[15px] text-white/50 tabular-nums font-medium">
            {tier2Avg.toLocaleString()}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[11px] text-white/40">Multiplier</div>
          <div className="text-[15px] text-primary-bright tabular-nums font-medium">
            {multiplier.toFixed(1)}×
          </div>
        </div>
      </div>
    </div>
  );
}
