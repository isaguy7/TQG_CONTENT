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
        <header className="h-14 border-b border-white/[0.06] flex items-center justify-between px-6 shrink-0">
          <div>
            <h1 className="text-[14px] font-semibold text-white/95 leading-tight">
              {title}
            </h1>
            {description ? (
              <p className="text-[11px] text-white/50 mt-0.5 leading-tight">
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

