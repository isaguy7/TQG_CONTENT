"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

export type IntegrationKey =
  | "linkedin"
  | "x"
  | "instagram"
  | "facebook"
  | "anthropic"
  | "unsplash"
  | "supabase";

type OAuthState = {
  account_name: string | null;
  status: "active" | "expired" | "revoked";
  token_expires_at: string | null;
};

type IntegrationsPayload = {
  integrations: {
    supabase?: { connected: boolean; url?: string | null };
    anthropic?: { connected: boolean; model?: string };
    typefully?: { connected: boolean; social_set?: boolean };
    unsplash?: { connected: boolean };
    linkedin?: { connected: boolean; oauth?: OAuthState | null };
    x?: { connected: boolean; oauth?: OAuthState | null };
    meta?: { connected: boolean; oauth_ready?: boolean };
    whisperx?: { model: string; device: string; batchSize: number };
  };
};

type PlatformCard = {
  key: IntegrationKey;
  label: string;
  subLabel: string;
  color: string;
  connected: boolean;
  status?: OAuthState["status"];
  oauthProvider?: "linkedin_oidc" | "x";
  scopes?: string;
  helper?: string;
};

export function IntegrationsBar() {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [openModal, setOpenModal] = useState<PlatformCard | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/integrations", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as IntegrationsPayload;
      setData(json);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener("oauth-connection-saved", handler);
    return () => window.removeEventListener("oauth-connection-saved", handler);
  }, [load]);

  if (!data) return null;

  const integrations = data.integrations || {};
  const linkedin = integrations.linkedin;
  const x = integrations.x;

  const cards: PlatformCard[] = [
    {
      key: "linkedin",
      label: "LinkedIn",
      subLabel: linkedin?.oauth?.account_name
        ? `Signed in as ${linkedin.oauth.account_name}`
        : "Direct posting via OAuth",
      color: "bg-[#0A66C2]",
      connected: !!linkedin?.connected,
      status: linkedin?.oauth?.status,
      oauthProvider: "linkedin_oidc",
      scopes: "openid profile email w_member_social",
    },
    {
      key: "x",
      label: "X",
      subLabel: x?.oauth?.account_name
        ? `Signed in as ${x.oauth.account_name}`
        : "Direct posting via OAuth",
      color: "bg-white",
      connected: !!x?.connected,
      status: x?.oauth?.status,
      oauthProvider: "x",
      scopes: "tweet.read tweet.write users.read offline.access",
    },
    {
      key: "instagram",
      label: "Instagram",
      subLabel: "Reels via Meta Graph",
      color: "bg-pink-500",
      connected: !!integrations.meta?.connected,
      helper: "META_ACCESS_TOKEN",
    },
    {
      key: "facebook",
      label: "Facebook",
      subLabel: "Shares via Meta Graph",
      color: "bg-indigo-500",
      connected: !!integrations.meta?.connected,
      helper: "META_ACCESS_TOKEN",
    },
  ];

  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const isExpired = c.status === "expired";
          return (
            <div
              key={c.key}
              className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col"
            >
              <div className="flex items-center gap-2">
                <span className={cn("w-2.5 h-2.5 rounded-full", c.color)} />
                <div>
                  <div className="text-[13px] font-semibold text-white/90">
                    {c.label}
                  </div>
                  <div className="text-[11px] text-white/45">
                    {c.subLabel}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                {c.connected ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Connected
                  </span>
                ) : isExpired ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200 text-[11px]">
                    Reconnect needed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/50 text-[11px]">
                    Not connected
                  </span>
                )}
                <button
                  onClick={() => setOpenModal(c)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] border transition-colors",
                    c.connected
                      ? "border-white/[0.08] text-white/60 hover:text-white/85"
                      : "border-primary/50 text-primary-bright hover:bg-primary/15"
                  )}
                >
                  {c.connected
                    ? "Manage"
                    : isExpired
                      ? "Reconnect"
                      : `Connect ${c.label}`}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {openModal ? (
        <ConnectModal
          platform={openModal}
          onClose={() => setOpenModal(null)}
          onAfterConnect={load}
        />
      ) : null}
    </>
  );
}

function ConnectModal({
  platform,
  onClose,
}: {
  platform: PlatformCard;
  onClose: () => void;
  onAfterConnect: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startOAuth = async () => {
    if (!platform.oauthProvider) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings")}`;
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Prefer linkIdentity when already signed in — avoids the PKCE
      // state-cookie issues hit on X by not starting a fresh sign-in.
      const { error } = user
        ? await supabase.auth.linkIdentity({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            provider: platform.oauthProvider as any,
            options: { redirectTo, scopes: platform.scopes },
          })
        : await supabase.auth.signInWithOAuth({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            provider: platform.oauthProvider as any,
            options: { redirectTo, scopes: platform.scopes },
          });
      if (error) {
        const raw = error.message || "";
        const msg = /not enabled|provider/i.test(raw)
          ? `${platform.label} sign-in isn't available yet. Ask the admin to enable the provider in Supabase.`
          : /manual linking/i.test(raw)
            ? `${platform.label} linking requires "Manual linking" to be enabled in Supabase → Auth → Settings.`
            : raw;
        setErr(msg);
        setBusy(false);
      }
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const oauthSupported = !!platform.oauthProvider;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-white/[0.1] bg-[#111] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-white/45 hover:text-white/85 text-[16px] leading-none px-2 py-0.5"
        >
          ×
        </button>
        <div className="px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className={cn("w-3 h-3 rounded-full", platform.color)} />
            <div>
              <div className="text-[15px] font-semibold text-white/90">
                {platform.connected ? "Manage" : "Connect"} {platform.label}
              </div>
              <div className="text-[11px] text-white/50">
                {oauthSupported ? "Supabase OAuth" : "Manual API key"}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {oauthSupported ? (
            <>
              <p className="text-[13px] text-white/75 leading-relaxed">
                Sign in with {platform.label} to let TQG Studio post on your
                behalf. We only request the scopes needed for publishing —
                you can revoke access from {platform.label}&apos;s settings at
                any time.
              </p>
              <div className="rounded bg-black/40 border border-white/[0.05] p-2 text-[11px] text-white/55 font-mono">
                Scopes: {platform.scopes}
              </div>
              {err ? (
                <div className="text-[12px] text-danger">{err}</div>
              ) : null}
              <button
                onClick={startOAuth}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium text-[13px] bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50"
              >
                <span className={cn("w-2 h-2 rounded-full", platform.color)} />
                {busy ? "Redirecting…" : `Sign in with ${platform.label}`}
              </button>
            </>
          ) : (
            <div className="rounded-md bg-amber-500/10 border border-amber-400/30 p-3">
              <div className="text-[12px] font-medium text-amber-200 mb-1">
                Manual setup
              </div>
              <p className="text-[12px] text-amber-100/80 leading-relaxed">
                {platform.label} doesn&apos;t support direct OAuth in TQG
                Studio yet. Set the relevant env var in{" "}
                <code className="font-mono text-[11px] bg-black/30 px-1 rounded">
                  .env.local
                </code>{" "}
                and restart the dev server:
              </p>
              <pre className="mt-2 p-2 rounded bg-black/40 text-[11px] text-white/85 overflow-x-auto font-mono">
                {platform.helper || "PROVIDER_ACCESS_TOKEN"}=your_token_here
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
