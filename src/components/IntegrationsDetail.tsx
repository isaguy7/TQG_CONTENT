"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

type OAuthState = {
  account_name: string | null;
  status: "active" | "expired" | "revoked";
  token_expires_at: string | null;
};

type IntegrationsPayload = {
  integrations: {
    supabase?: { connected: boolean; url?: string | null; service_role?: boolean };
    anthropic?: { connected: boolean; model?: string };
    typefully?: { connected: boolean; social_set?: boolean };
    unsplash?: { connected: boolean };
    pexels?: { connected: boolean };
    linkedin?: { connected: boolean; oauth?: OAuthState | null };
    x?: { connected: boolean; oauth?: OAuthState | null };
    meta?: { connected: boolean; oauth_ready?: boolean };
    whisperx?: { model: string; device: string; batchSize: number };
  };
};

type EnvPayload = {
  hosted: boolean;
  gpu: boolean;
  ffmpeg: boolean;
  ytdlp: boolean;
  mode: "cloud" | "local";
};

function formatExpiry(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (days >= 1) return `${days}d`;
  const hours = Math.round(ms / (3600 * 1000));
  return `${hours}h`;
}

function Row({
  label,
  connected,
  status,
  details,
  envVar,
  action,
}: {
  label: string;
  connected: boolean;
  status?: OAuthState["status"];
  details?: Array<[string, string]>;
  envVar?: string;
  action?: React.ReactNode;
}) {
  const expired = status === "expired";
  return (
    <div className="flex items-start gap-4 py-3 border-b border-white/[0.05] last:border-b-0">
      <span
        className={cn(
          "shrink-0 mt-1.5 w-2 h-2 rounded-full",
          expired
            ? "bg-amber-400"
            : connected
              ? "bg-emerald-400"
              : "bg-white/25"
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-white/85">{label}</span>
          <span
            className={cn(
              "text-[11px] shrink-0",
              expired
                ? "text-amber-300"
                : connected
                  ? "text-emerald-300"
                  : "text-white/45"
            )}
          >
            {expired
              ? "Reconnect needed"
              : connected
                ? "Connected"
                : "Not connected"}
          </span>
        </div>
        {details && details.length > 0 ? (
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-white/40 uppercase tracking-wider">{k}</dt>
                <dd className="text-white/75 font-mono truncate">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {envVar ? (
          <div className="mt-1.5 text-[10px] text-white/35 font-mono">
            {envVar}
          </div>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function IntegrationsDetail({
  mode = "all",
}: {
  mode?: "all" | "accounts" | "services";
} = {}) {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [env, setEnv] = useState<EnvPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/settings/integrations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
    fetch("/api/environment", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setEnv)
      .catch(() => setEnv(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch whenever the client-side token capture hook persists a new
  // connection so the UI flips to "Connected" without a manual reload.
  useEffect(() => {
    const handler = () => load();
    window.addEventListener("oauth-connection-saved", handler);
    return () => window.removeEventListener("oauth-connection-saved", handler);
  }, [load]);

  const [providerError, setProviderError] = useState<string | null>(null);

  const reconnect = async (provider: "linkedin_oidc" | "x") => {
    setBusy(provider);
    setProviderError(null);
    const supabase = createClient();
    const scopes =
      provider === "linkedin_oidc"
        ? "openid profile email w_member_social"
        : "tweet.read tweet.write users.read offline.access";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings")}`;

    // IMPORTANT: always use signInWithOAuth here, not linkIdentity. The
    // reason: linkIdentity is a pure linking op — Supabase never surfaces a
    // provider_token to the resulting session, so ProviderTokenCapture has
    // nothing to save into oauth_connections. signInWithOAuth kicks off a
    // real sign-in, which DOES surface provider_token on the SIGNED_IN
    // event. If the identity is already linked to the current user, the
    // OAuth callback simply refreshes the session on the same user rather
    // than creating a second one.
    const { error } = await supabase.auth.signInWithOAuth({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: provider as any,
      options: { redirectTo, scopes },
    });

    if (error) {
      const label = provider === "linkedin_oidc" ? "LinkedIn" : "X";
      const raw = error.message || "";
      const msg = /not enabled|provider/i.test(raw)
        ? `${label} sign-in isn't available yet. Ask the admin to enable the provider in Supabase.`
        : raw;
      setProviderError(msg);
    }
    setBusy(null);
  };

  const disconnect = async (platform: "linkedin" | "x") => {
    setBusy(platform);
    await fetch(`/api/auth/connections?platform=${platform}`, {
      method: "DELETE",
    });
    setBusy(null);
    load();
  };

  if (!data) {
    return (
      <div className="text-[12px] text-white/45">Loading integrations…</div>
    );
  }
  const i = data.integrations;

  const linkedinAction = i.linkedin?.connected ? (
    <button
      onClick={() => disconnect("linkedin")}
      disabled={busy !== null}
      className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
    >
      Disconnect
    </button>
  ) : (
    <button
      onClick={() => reconnect("linkedin_oidc")}
      disabled={busy !== null}
      className="px-2.5 py-1 rounded text-[11px] bg-[#0A66C2] text-white hover:bg-[#004182] disabled:opacity-40"
    >
      {i.linkedin?.oauth?.status === "expired"
        ? "Reconnect LinkedIn"
        : "Sign in with LinkedIn"}
    </button>
  );

  const xAction = i.x?.connected ? (
    <button
      onClick={() => disconnect("x")}
      disabled={busy !== null}
      className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
    >
      Disconnect
    </button>
  ) : (
    <button
      onClick={() => reconnect("x")}
      disabled={busy !== null}
      className="px-2.5 py-1 rounded text-[11px] bg-black border border-white/[0.15] text-white hover:bg-white/[0.05] disabled:opacity-40"
    >
      {i.x?.oauth?.status === "expired"
        ? "Reconnect X"
        : "Sign in with X"}
    </button>
  );

  const showAccounts = mode === "all" || mode === "accounts";
  const showServices = mode === "all" || mode === "services";

  return (
    <div>
      {providerError && showAccounts ? (
        <div className="mb-3 rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-[12px] text-amber-100/90">
          {providerError}
        </div>
      ) : null}
      {showServices ? (
        <>
          <Row
            label="Supabase"
            connected={!!i.supabase?.connected}
            envVar="NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY"
            details={
              i.supabase?.connected
                ? [
                    ["URL", i.supabase.url || "—"],
                    ["Service role", i.supabase.service_role ? "yes" : "no"],
                  ]
                : undefined
            }
          />
          <Row
            label="Anthropic (Claude)"
            connected={!!i.anthropic?.connected}
            envVar="ANTHROPIC_API_KEY"
            details={
              i.anthropic?.connected
                ? [["Model", i.anthropic.model || "—"]]
                : undefined
            }
          />
        </>
      ) : null}
      {showAccounts ? (
        <>
          <Row
            label="LinkedIn (direct posting)"
            connected={!!i.linkedin?.connected}
            status={i.linkedin?.oauth?.status}
            details={
              i.linkedin?.oauth
                ? [
                    ["Account", i.linkedin.oauth.account_name || "—"],
                    ["Token", formatExpiry(i.linkedin.oauth.token_expires_at)],
                  ]
                : undefined
            }
            action={linkedinAction}
          />
          <Row
            label="X (direct posting)"
            connected={!!i.x?.connected}
            status={i.x?.oauth?.status}
            details={
              i.x?.oauth
                ? [
                    ["Account", i.x.oauth.account_name || "—"],
                    ["Token", formatExpiry(i.x.oauth.token_expires_at)],
                  ]
                : undefined
            }
            action={xAction}
          />
        </>
      ) : null}
      {showServices ? (
        <>
      {i.typefully?.connected ? (
        <Row
          label="Typefully (legacy)"
          connected={!!i.typefully?.connected}
          envVar="TYPEFULLY_API_KEY · TYPEFULLY_SOCIAL_SET_ID"
          details={[
            [
              "Social set",
              i.typefully.social_set ? "configured" : "unset",
            ],
            ["Note", "Legacy — prefer direct OAuth posting"],
          ]}
        />
      ) : null}
      <Row
        label="Unsplash"
        connected={!!i.unsplash?.connected}
        envVar="UNSPLASH_ACCESS_KEY"
      />
      <Row
        label="Pexels (stock video)"
        connected={!!i.pexels?.connected}
        envVar="PEXELS_API_KEY"
      />
      <Row
        label="Meta (Instagram / Facebook)"
        connected={!!i.meta?.connected}
        envVar="META_ACCESS_TOKEN"
        details={[["OAuth ready", i.meta?.oauth_ready ? "yes" : "no"]]}
      />
      {i.whisperx ? (
        <Row
          label="WhisperX (transcription)"
          connected={env ? !env.hosted : true}
          details={
            env?.hosted
              ? [["Runtime", "hosted — local GPU required, skipped"]]
              : [
                  ["Model", i.whisperx.model],
                  ["Device", i.whisperx.device],
                  ["Batch size", String(i.whisperx.batchSize)],
                ]
          }
        />
      ) : null}
      {env ? (
        <>
          <Row
            label="yt-dlp (video download)"
            connected={env.ytdlp}
            envVar={
              env.hosted
                ? "Not available on Vercel — local Studio only"
                : "YTDLP_BIN · YTDLP_USE_PYTHON"
            }
          />
          <Row
            label="ffmpeg (audio / clip render)"
            connected={env.ffmpeg}
            envVar={
              env.hosted
                ? "Not available on Vercel — local Studio only"
                : "FFMPEG_BIN"
            }
          />
          <Row
            label="GPU (NVENC / CUDA)"
            connected={env.gpu}
            details={[["Mode", env.mode]]}
          />
        </>
      ) : null}
        </>
      ) : null}
    </div>
  );
}
