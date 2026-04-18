"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type IntegrationKey =
  | "linkedin"
  | "x"
  | "instagram"
  | "facebook"
  | "anthropic"
  | "unsplash"
  | "supabase";

type IntegrationsPayload = {
  integrations: {
    supabase?: { connected: boolean; url?: string | null };
    anthropic?: { connected: boolean; model?: string };
    typefully?: { connected: boolean; social_set?: boolean };
    unsplash?: { connected: boolean };
    linkedin?: { connected: boolean; oauth_ready?: boolean };
    meta?: { connected: boolean; oauth_ready?: boolean };
    whisperx?: { model: string; device: string; batchSize: number };
  };
};

type PlatformCard = {
  key: IntegrationKey;
  label: string;
  subLabel: string;
  color: string; // tailwind bg class for the brand accent
  connectVia: string; // the integration endpoint that proves connection
  envVar: string;
  oauthFlow: string;
  connected: boolean;
  extra?: string;
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

  if (!data) return null;

  const integrations = data.integrations || {};

  // LinkedIn and X both route through Typefully today. When
  // TYPEFULLY_API_KEY is set the user can push to both, so treat
  // that as "connected" for both cards.
  const viaTypefully = !!integrations.typefully?.connected;
  const cards: PlatformCard[] = [
    {
      key: "linkedin",
      label: "LinkedIn",
      subLabel: viaTypefully
        ? "Connected via Typefully"
        : "Originals + TQG Page",
      color: "bg-sky-500",
      connectVia: viaTypefully
        ? "TYPEFULLY_API_KEY"
        : "LINKEDIN_ACCESS_TOKEN",
      envVar: viaTypefully
        ? "TYPEFULLY_API_KEY"
        : "LINKEDIN_ACCESS_TOKEN",
      oauthFlow: viaTypefully ? "Typefully API" : "LinkedIn OAuth 2.0",
      connected:
        viaTypefully || !!integrations.linkedin?.connected,
    },
    {
      key: "x",
      label: "X",
      subLabel: "Pushes via Typefully",
      color: "bg-white",
      connectVia: "TYPEFULLY_API_KEY",
      envVar: "TYPEFULLY_API_KEY",
      oauthFlow: "Typefully API",
      connected: !!integrations.typefully?.connected,
      extra: integrations.typefully?.social_set
        ? undefined
        : "Set TYPEFULLY_SOCIAL_SET_ID to target the TQG account.",
    },
    {
      key: "instagram",
      label: "Instagram",
      subLabel: "Reels via Meta Graph",
      color: "bg-pink-500",
      connectVia: "META_ACCESS_TOKEN",
      envVar: "META_ACCESS_TOKEN",
      oauthFlow: "Meta OAuth (Instagram)",
      connected: !!integrations.meta?.connected,
    },
    {
      key: "facebook",
      label: "Facebook",
      subLabel: "Shares via Meta Graph",
      color: "bg-indigo-500",
      connectVia: "META_ACCESS_TOKEN",
      envVar: "META_ACCESS_TOKEN",
      oauthFlow: "Meta OAuth (Facebook)",
      connected: !!integrations.meta?.connected,
    },
  ];

  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
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
                <div className="text-[11px] text-white/45">{c.subLabel}</div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              {c.connected ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Connected
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
                {c.connected ? "Manage" : `Connect ${c.label}`}
              </button>
            </div>
            {c.extra ? (
              <div className="mt-3 pt-3 border-t border-white/[0.05] text-[11px] text-white/45 leading-relaxed">
                {c.extra}
              </div>
            ) : null}
          </div>
        ))}
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
  onAfterConnect,
}: {
  platform: PlatformCard;
  onClose: () => void;
  onAfterConnect: () => void;
}) {
  const [step, setStep] = useState<"explain" | "placeholder">("explain");

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
                Connect {platform.label}
              </div>
              <div className="text-[11px] text-white/50">
                {platform.oauthFlow}
              </div>
            </div>
          </div>
        </div>

        {step === "explain" ? (
          <div className="px-6 py-5 space-y-4">
            <p className="text-[13px] text-white/75 leading-relaxed">
              Connecting {platform.label} lets TQG Studio push scheduled posts,
              pull analytics, and surface them in the Dashboard without leaving
              this app.
            </p>
            <ul className="space-y-1.5 text-[12px] text-white/60 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-primary-bright">•</span>
                We only request the scopes needed for publishing + read-only
                analytics.
              </li>
              <li className="flex gap-2">
                <span className="text-primary-bright">•</span>
                You can revoke access any time on the provider&apos;s settings
                page.
              </li>
              <li className="flex gap-2">
                <span className="text-primary-bright">•</span>
                Your token is stored in{" "}
                <code className="font-mono text-[11px] bg-black/40 px-1 rounded">
                  .env.local
                </code>{" "}
                on this machine only.
              </li>
            </ul>
            {platform.connected ? (
              <div className="rounded bg-emerald-500/10 border border-emerald-400/20 text-emerald-200 text-[12px] p-2.5 leading-relaxed">
                <strong>Already connected.</strong> Token detected in{" "}
                <code className="font-mono">{platform.envVar}</code>.
              </div>
            ) : null}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setStep("placeholder")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium text-[13px]",
                  "bg-white text-black hover:bg-white/90 transition-colors"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full", platform.color)} />
                Sign in with {platform.label}
              </button>
            </div>
            <p className="text-[11px] text-white/40 text-center">
              You&apos;ll be redirected to {platform.label.toLowerCase()}.com to
              authorize
            </p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-3">
            <div className="rounded-md bg-amber-500/10 border border-amber-400/30 p-3">
              <div className="text-[12px] font-medium text-amber-200 mb-1">
                OAuth integration coming soon
              </div>
              <p className="text-[12px] text-amber-100/80 leading-relaxed">
                For now, add your API credentials to{" "}
                <code className="font-mono text-[11px] bg-black/30 px-1 rounded">
                  .env.local
                </code>{" "}
                and restart the dev server:
              </p>
              <pre className="mt-2 p-2 rounded bg-black/40 text-[11px] text-white/85 overflow-x-auto font-mono">
                {platform.envVar}=your_token_here
              </pre>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  onAfterConnect();
                  onClose();
                }}
                className="flex-1 px-3 py-2 rounded-md text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover"
              >
                I&apos;ve added the key — refresh
              </button>
              <button
                onClick={onClose}
                className="px-3 py-2 rounded-md text-[12px] border border-white/[0.08] text-white/70 hover:text-white/90"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
