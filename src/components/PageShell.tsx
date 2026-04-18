import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  children,
  actions,
  rightPanel,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
  rightPanel?: ReactNode;
}) {
  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-white/[0.08] bg-white/[0.04] backdrop-blur-md flex items-center justify-between px-6 shrink-0 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <div>
            <h1 className="text-[13px] font-semibold text-white/90 leading-none">
              {title}
            </h1>
            {description ? (
              <p className="text-[11px] text-white/45 mt-1 leading-none">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex gap-2 items-center">{actions}</div> : null}
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
      {rightPanel ? (
        <aside className="w-[232px] shrink-0 border-l border-white/[0.06] bg-sidebar overflow-y-auto">
          {rightPanel}
        </aside>
      ) : null}
    </div>
  );
}

export function StubPlaceholder({ phase }: { phase: string }) {
  return (
    <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[13px] text-white/40">
      <p>
        Stub — built in{" "}
        <span className="text-white/70 font-medium">{phase}</span>.
      </p>
    </div>
  );
}
