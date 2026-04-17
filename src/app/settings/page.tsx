"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { ClaudeUsage } from "@/components/ClaudeUsage";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Cpu, Zap } from "lucide-react";

type Integrations = {
  supabase: { connected: boolean; url: string | null };
  anthropic: { connected: boolean; model: string | null; cap_usd: number };
  typefully: { connected: boolean };
  unsplash: { connected: boolean };
  whisper: { model: string; device: string; batch_size: number };
  ytdlp: { available: boolean; version: string | null };
  ffmpeg: { available: boolean; version: string | null };
};

export default function SettingsPage() {
  const [data, setData] = useState<Integrations | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/integrations")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <PageShell
      title="Settings"
      description="Integrations, API keys, and system tooling"
    >
      <div className="space-y-5 max-w-3xl">
        <div className="section-label">Integrations</div>

        {error ? (
          <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
            Load failed: {error}
          </div>
        ) : !data ? (
          <div className="text-[13px] text-white/40">Loading…</div>
        ) : (
          <div className="space-y-2.5">
            <IntegrationRow
              name="Supabase"
              connected={data.supabase.connected}
              primary={data.supabase.url || undefined}
              secondary={
                data.supabase.connected
                  ? "Service role + anon keys loaded"
                  : undefined
              }
              envVars={["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]}
            />
            <IntegrationRow
              name="Anthropic API"
              connected={data.anthropic.connected}
              primary={data.anthropic.model || undefined}
              secondary={
                data.anthropic.connected
                  ? `Monthly cap $${data.anthropic.cap_usd.toFixed(2)}`
                  : undefined
              }
              envVars={["ANTHROPIC_API_KEY"]}
              expanded={
                data.anthropic.connected ? (
                  <div className="mt-3 pt-3 border-t border-white/[0.05]">
                    <ClaudeUsage />
                  </div>
                ) : null
              }
            />
            <IntegrationRow
              name="Typefully"
              connected={data.typefully.connected}
              secondary={
                data.typefully.connected
                  ? "Draft scheduling ready"
                  : "Post drafts directly to Typefully"
              }
              envVars={["TYPEFULLY_API_KEY"]}
            />
            <IntegrationRow
              name="Unsplash"
              connected={data.unsplash.connected}
              secondary={
                data.unsplash.connected
                  ? "Image search enabled in editor"
                  : "Enable image search from the post editor"
              }
              envVars={["UNSPLASH_ACCESS_KEY"]}
            />
          </div>
        )}

        {data ? (
          <>
            <div className="section-label pt-2">Media pipeline</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ToolTile
                icon={Cpu}
                name="WhisperX"
                primary={data.whisper.model}
                secondary={`${data.whisper.device} · batch ${data.whisper.batch_size}`}
                tone="accent"
              />
              <ToolTile
                icon={Zap}
                name="yt-dlp"
                primary={data.ytdlp.version || "not found"}
                secondary={data.ytdlp.available ? "on $PATH" : "install via pip"}
                tone={data.ytdlp.available ? "accent" : "muted"}
              />
              <ToolTile
                icon={Zap}
                name="ffmpeg"
                primary={
                  data.ffmpeg.version
                    ? data.ffmpeg.version.slice(0, 48)
                    : "not found"
                }
                secondary={data.ffmpeg.available ? "on $PATH" : "install system package"}
                tone={data.ffmpeg.available ? "accent" : "muted"}
              />
            </div>
          </>
        ) : null}

        <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 text-[11px] text-white/50 leading-relaxed">
          Keys live in{" "}
          <code className="font-mono text-[11px] text-white/75">.env.local</code>.
          See{" "}
          <code className="font-mono text-[11px] text-white/75">.env.local.example</code>{" "}
          for the full list.
        </div>
      </div>
    </PageShell>
  );
}

function IntegrationRow({
  name,
  connected,
  primary,
  secondary,
  envVars,
  expanded,
}: {
  name: string;
  connected: boolean;
  primary?: string;
  secondary?: string;
  envVars: string[];
  expanded?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-4 border transition-colors",
        connected
          ? "bg-primary/[0.06] border-primary/25"
          : "bg-white/[0.03] border-white/[0.08]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {connected ? (
            <CheckCircle2 className="w-4 h-4 text-primary-bright" />
          ) : (
            <XCircle className="w-4 h-4 text-white/30" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[13px] font-semibold text-white/95">
              {name}
            </div>
            <div
              className={cn(
                "text-[11px] uppercase tracking-wider font-medium",
                connected ? "text-primary-bright" : "text-white/40"
              )}
            >
              {connected ? "Connected" : "Not set"}
            </div>
          </div>
          {primary ? (
            <div className="text-[12px] text-white/70 mt-1 font-mono truncate">
              {primary}
            </div>
          ) : null}
          {secondary ? (
            <div className="text-[11px] text-white/50 mt-1">{secondary}</div>
          ) : null}
          {!connected ? (
            <div className="text-[11px] text-white/45 mt-2">
              Set{" "}
              {envVars.map((v, i) => (
                <span key={v}>
                  <code className="font-mono text-[11px] text-white/75">{v}</code>
                  {i < envVars.length - 1 ? ", " : ""}
                </span>
              ))}{" "}
              in .env.local.
            </div>
          ) : null}
          {expanded}
        </div>
      </div>
    </div>
  );
}

function ToolTile({
  icon: Icon,
  name,
  primary,
  secondary,
  tone,
}: {
  icon: typeof Cpu;
  name: string;
  primary?: string;
  secondary?: string;
  tone: "accent" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        tone === "accent"
          ? "bg-primary/[0.06] border-primary/25"
          : "bg-white/[0.03] border-dashed border-white/[0.12]"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            "w-4 h-4",
            tone === "accent" ? "text-primary-bright" : "text-white/40"
          )}
        />
        <div className="text-[13px] font-semibold text-white/90">{name}</div>
      </div>
      {primary ? (
        <div className="text-[12px] text-white/75 font-mono truncate">
          {primary}
        </div>
      ) : null}
      {secondary ? (
        <div className="text-[11px] text-white/45 mt-1">{secondary}</div>
      ) : null}
    </div>
  );
}
