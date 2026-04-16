import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-full">
      <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0">
        <div>
          <h1 className="text-sm font-semibold">{title}</h1>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </header>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}

export function StubPlaceholder({ phase }: { phase: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      <p>
        This page is a stub. Built in{" "}
        <span className="text-foreground font-medium">{phase}</span>.
      </p>
    </div>
  );
}
