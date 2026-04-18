import { PageShell } from "@/components/PageShell";
import { ClaudeUsage } from "@/components/ClaudeUsage";
import { IntegrationsDetail } from "@/components/IntegrationsDetail";
import { ProviderTokenCapture } from "@/components/ProviderTokenCapture";
import { SignOutButton } from "@/components/SignOutButton";

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      description="Integrations, API keys, model selection"
    >
      <ProviderTokenCapture />
      <div className="space-y-4 max-w-2xl">
        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold mb-3">Connect your accounts</h2>
          <p className="text-[12px] text-muted-foreground mb-4">
            Sign in with LinkedIn and X so TQG Studio can post on your behalf.
            These connections are separate from your app login. Pick a LinkedIn
            Page below if you want posts to go out as The Quran Group.
          </p>
          <IntegrationsDetail mode="accounts" />
        </section>

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold mb-2">Local Studio</h2>
          <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
            GPU-bound features — WhisperX transcription and clip rendering —
            run on your local machine. Everything else (drafting, publishing,
            calendar, references) runs in the browser against the hosted app.
          </p>
          <ul className="space-y-2 text-[12px] text-white/70">
            <li className="flex gap-3">
              <span className="shrink-0 w-2 h-2 rounded-full bg-emerald-400 mt-1.5" />
              <span>
                <span className="text-white/90 font-medium">
                  Hosted (tqg-content.vercel.app):
                </span>{" "}
                drafts, publishing, LinkedIn / X, calendar, references,
                YouTube caption pulling.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-2 h-2 rounded-full bg-sky-400 mt-1.5" />
              <span>
                <span className="text-white/90 font-medium">
                  Local Studio (localhost:3000):
                </span>{" "}
                WhisperX transcription and clip rendering. Run{" "}
                <code className="font-mono text-[11px] bg-white/[0.05] px-1 py-[1px] rounded text-white/85">
                  npm run dev
                </code>{" "}
                on your PC to enable GPU features.
              </span>
            </li>
          </ul>
          <div className="mt-4 rounded-md border border-dashed border-white/10 bg-white/[0.02] p-3 text-[11px] text-white/55 leading-relaxed">
            Both environments share the same Supabase database, so a draft
            created in one environment is visible in the other. No
            bridging between them — keep them as two front-ends over the
            same data.
          </div>
        </section>

        <details className="rounded-lg border border-border bg-surface group">
          <summary className="flex items-center justify-between cursor-pointer list-none px-6 py-4 select-none">
            <div>
              <h2 className="text-sm font-semibold">Integrations</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Supabase, Anthropic, Typefully, Pexels, WhisperX — diagnostic
                status, click to expand.
              </p>
            </div>
            <span className="text-white/40 text-[12px] tabular-nums transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="px-6 pb-6 pt-1 border-t border-border/50">
            <p className="text-[12px] text-muted-foreground mb-4 mt-3">
              Source of truth for connection status — shared with the
              Dashboard. Configure each via{" "}
              <code className="font-mono text-xs">.env.local</code> (see{" "}
              <code className="font-mono text-xs">.env.local.example</code>)
              and restart the dev server.
            </p>
            <IntegrationsDetail mode="services" />
          </div>
        </details>

        <details className="rounded-lg border border-border bg-surface group">
          <summary className="flex items-center justify-between cursor-pointer list-none px-6 py-4 select-none">
            <div>
              <h2 className="text-sm font-semibold">Claude API usage</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Token and cost diagnostics.
              </p>
            </div>
            <span className="text-white/40 text-[12px] tabular-nums transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="px-6 pb-6 pt-1 border-t border-border/50">
            <ClaudeUsage />
          </div>
        </details>

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold mb-2">Trash</h2>
          <p className="text-[12px] text-muted-foreground">
            Deleted posts are kept in the trash and purged automatically after 7
            days. Restore or delete permanently from the bottom of the{" "}
            <a
              href="/content"
              className="underline underline-offset-2 text-white/70 hover:text-white"
            >
              Content
            </a>{" "}
            page.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold mb-3">Account</h2>
          <p className="text-[12px] text-muted-foreground mb-3">
            Sign out ends the session on this device. Accounts are managed from
            the Supabase dashboard; sign-up is disabled.
          </p>
          <SignOutButton />
        </section>
      </div>
    </PageShell>
  );
}
