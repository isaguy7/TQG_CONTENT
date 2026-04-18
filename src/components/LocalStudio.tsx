"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getLocalStudioUrl,
  setLocalStudioUrl,
  clearLocalStudioUrl,
} from "@/lib/local-studio";

type PingState = "idle" | "checking" | "ok" | "error";

export function LocalStudio() {
  const [url, setUrl] = useState<string>("http://localhost:3000");
  const [saved, setSaved] = useState<string | null>(null);
  const [ping, setPing] = useState<PingState>("idle");
  const [pingMsg, setPingMsg] = useState<string | null>(null);

  useEffect(() => {
    const existing = getLocalStudioUrl();
    if (existing) {
      setUrl(existing);
      setSaved(existing);
    }
  }, []);

  const doPing = useCallback(async (target: string) => {
    setPing("checking");
    setPingMsg(null);
    try {
      // Same-origin if target === current host (dev), otherwise cross-origin.
      // /api/environment is cheap and exists in both hosted + local.
      const res = await fetch(`${target.replace(/\/$/, "")}/api/environment`, {
        cache: "no-store",
        mode: "cors",
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          hosted?: boolean;
          gpu?: boolean;
          ffmpeg?: boolean;
        };
        if (data.hosted) {
          setPing("error");
          setPingMsg(
            "That URL points at another hosted deploy — Local Studio should be running on your PC."
          );
        } else {
          setPing("ok");
          setPingMsg(
            `Local Studio responded — gpu=${data.gpu ? "yes" : "no"}, ffmpeg=${
              data.ffmpeg ? "yes" : "no"
            }`
          );
        }
      } else {
        setPing("error");
        setPingMsg(`HTTP ${res.status} — is npm run dev running?`);
      }
    } catch (err) {
      setPing("error");
      setPingMsg((err as Error).message);
    }
  }, []);

  const save = () => {
    const trimmed = url.trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(trimmed)) {
      setPingMsg("URL must start with http:// or https://");
      setPing("error");
      return;
    }
    setLocalStudioUrl(trimmed);
    setSaved(trimmed);
    doPing(trimmed);
  };

  const clear = () => {
    clearLocalStudioUrl();
    setSaved(null);
    setPing("idle");
    setPingMsg(null);
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold mb-2">Local Studio</h2>
      <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
        GPU-bound work — WhisperX transcription, ffmpeg clip rendering —
        runs on your local machine. Everything else runs here against the
        hosted app; both talk to the same Supabase database.
      </p>

      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3 space-y-2 mb-4">
        <label className="block section-label">Local Studio URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            className="flex-1 bg-black/40 border border-white/[0.1] rounded px-3 py-1.5 text-[12px] text-white/90 font-mono focus:outline-none focus:border-white/30"
          />
          <button
            onClick={save}
            className="px-3 py-1.5 rounded text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            Save
          </button>
          {saved ? (
            <button
              onClick={clear}
              className="px-3 py-1.5 rounded text-[12px] border border-white/[0.08] text-white/60 hover:text-white"
            >
              Clear
            </button>
          ) : null}
        </div>
        {saved ? (
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span
              className={cn(
                "flex items-center gap-2",
                ping === "ok" ? "text-emerald-300" : "text-white/55"
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  ping === "ok"
                    ? "bg-emerald-400"
                    : ping === "error"
                      ? "bg-danger"
                      : "bg-white/30"
                )}
              />
              {saved}
            </span>
            <button
              onClick={() => doPing(saved)}
              disabled={ping === "checking"}
              className="text-[11px] text-white/45 hover:text-white/80 underline underline-offset-2 disabled:opacity-40"
            >
              {ping === "checking" ? "Checking…" : "Ping"}
            </button>
          </div>
        ) : null}
        {pingMsg ? (
          <div
            className={cn(
              "text-[11px]",
              ping === "ok" ? "text-emerald-200/90" : "text-amber-200/90"
            )}
          >
            {pingMsg}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 text-[12px] text-white/70 leading-relaxed">
        <div>
          Once saved, the hosted app adds a &quot;Open in Local Studio&quot;
          button on pages that need GPU access (transcription, clip render).
          The button opens the same page on your local Studio so you can
          pick up where you left off.
        </div>
        <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-3 text-[11px] text-white/55">
          <div className="font-medium text-white/75 mb-1">
            Run the local Studio
          </div>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>
              <code className="font-mono">git pull</code> your fork of this
              repo.
            </li>
            <li>
              <code className="font-mono">npm install</code> then{" "}
              <code className="font-mono">npm run dev</code>.
            </li>
            <li>
              Open{" "}
              <code className="font-mono">http://localhost:3000</code> once
              the server starts.
            </li>
            <li>Paste the URL above and hit Save.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
