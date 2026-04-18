"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type IntegrationsPayload = {
  integrations: {
    supabase?: { connected: boolean; url?: string | null; service_role?: boolean };
    anthropic?: { connected: boolean; model?: string };
    typefully?: { connected: boolean; social_set?: boolean };
    unsplash?: { connected: boolean };
    pexels?: { connected: boolean };
    linkedin?: { connected: boolean; oauth_ready?: boolean };
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

function Row({
  label,
  connected,
  details,
  envVar,
}: {
  label: string;
  connected: boolean;
  details?: Array<[string, string]>;
  envVar?: string;
}) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-white/[0.05] last:border-b-0">
      <span
        className={cn(
          "shrink-0 mt-1.5 w-2 h-2 rounded-full",
          connected ? "bg-emerald-400" : "bg-white/25"
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-white/85">{label}</span>
          <span
            className={cn(
              "text-[11px] shrink-0",
              connected ? "text-emerald-300" : "text-white/45"
            )}
          >
            {connected ? "Connected" : "Not connected"}
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
      </div>
    </div>
  );
}

export function IntegrationsDetail() {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [env, setEnv] = useState<EnvPayload | null>(null);

  useEffect(() => {
    fetch("/api/settings/integrations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
    fetch("/api/environment", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setEnv)
      .catch(() => setEnv(null));
  }, []);

  if (!data) {
    return (
      <div className="text-[12px] text-white/45">Loading integrations…</div>
    );
  }
  const i = data.integrations;

  return (
    <div>
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
      <Row
        label="Typefully (LinkedIn + X)"
        connected={!!i.typefully?.connected}
        envVar="TYPEFULLY_API_KEY · TYPEFULLY_SOCIAL_SET_ID"
        details={
          i.typefully?.connected
            ? [
                [
                  "Social set",
                  i.typefully.social_set ? "configured" : "unset",
                ],
              ]
            : undefined
        }
      />
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
      {!i.typefully?.connected ? (
        <Row
          label="LinkedIn"
          connected={!!i.linkedin?.connected}
          envVar="LINKEDIN_ACCESS_TOKEN"
          details={[
            ["OAuth ready", i.linkedin?.oauth_ready ? "yes" : "no"],
          ]}
        />
      ) : null}
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
              ? [
                  [
                    "Runtime",
                    "hosted — local GPU required, skipped",
                  ],
                ]
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
    </div>
  );
}
