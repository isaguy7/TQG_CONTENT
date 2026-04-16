import { PageShell } from "@/components/PageShell";

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      description="API keys, model selection, cost caps"
    >
      <div className="space-y-4 max-w-2xl">
        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold mb-2">Environment</h2>
          <p className="text-sm text-muted-foreground">
            Configure via <code className="font-mono text-xs">.env.local</code>.
            See <code className="font-mono text-xs">.env.local.example</code>{" "}
            for keys.
          </p>
        </section>
        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold mb-2">
            yt-dlp upgrade (Phase 1+)
          </h2>
          <p className="text-sm text-muted-foreground">
            One-click upgrade button lands when Phase 1 wires up the Python
            subprocess layer.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
