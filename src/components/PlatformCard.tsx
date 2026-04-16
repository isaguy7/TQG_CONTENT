import { cn } from "@/lib/utils";

export type PlatformMetric = {
  label: string;
  value: string;
};

export function PlatformCard({
  platform,
  handle,
  followers,
  metrics,
  footnote,
  footnoteTone = "muted",
}: {
  platform: string;
  handle?: string;
  followers?: string;
  metrics: PlatformMetric[];
  footnote?: string;
  footnoteTone?: "muted" | "warning" | "primary";
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold text-white/90">
            {platform}
          </div>
          {handle ? (
            <div className="text-[11px] text-white/35 mt-0.5">{handle}</div>
          ) : null}
        </div>
        {followers ? (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/30">
              followers
            </div>
            <div className="text-[13px] font-medium text-white/80 tabular-nums">
              {followers}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="text-[10px] uppercase tracking-wider text-white/30">
              {m.label}
            </div>
            <div className="text-[13px] text-white/80 tabular-nums mt-0.5">
              {m.value}
            </div>
          </div>
        ))}
      </div>
      {footnote ? (
        <div
          className={cn(
            "mt-4 pt-3 border-t border-white/[0.05] text-[11px]",
            footnoteTone === "warning" && "text-warning",
            footnoteTone === "primary" && "text-primary-bright",
            footnoteTone === "muted" && "text-white/40"
          )}
        >
          {footnote}
        </div>
      ) : null}
    </div>
  );
}
