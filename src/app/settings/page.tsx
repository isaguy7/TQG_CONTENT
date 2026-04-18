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
            These connections are separate from your app login.
          </p>
          <IntegrationsDetail mode="accounts" />
        </section>

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold mb-3">Integrations</h2>
          <p className="text-[12px] text-muted-foreground mb-4">
            Source of truth for connection status — shared with the Dashboard.
            Configure each via <code className="font-mono text-xs">.env.local</code>{" "}
            (see <code className="font-mono text-xs">.env.local.example</code>)
            and restart the dev server.
          </p>
          <IntegrationsDetail mode="services" />
        </section>

        <section className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold mb-3">Claude API usage</h2>
          <ClaudeUsage />
        </section>

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
