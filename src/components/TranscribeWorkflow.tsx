"use client";

import { useCallback, useRef, useState } from "react";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import type { WhisperResult } from "@/lib/transcript";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { cn } from "@/lib/utils";

type Phase =
  | { kind: "idle" }
  | { kind: "start" }
  | { kind: "download"; percent: number | null; speed: string | null; eta: string | null; stage: string }
  | { kind: "extract" }
  | { kind: "transcribe"; note?: string }
  | { kind: "done"; transcript: WhisperResult; title: string; duration: number | null; channel: string | null }
  | { kind: "error"; message: string; stderrTail?: string };

type ServerEvent =
  | { phase: "start"; url: string }
  | { phase: "download"; percent: number | null; speed: string | null; eta: string | null; stage: string }
  | { phase: "extract" }
  | { phase: "transcribe"; line?: string }
  | {
      phase: "done";
      transcript: WhisperResult;
      metadata: { title: string; duration: number | null; channel: string | null };
      videoPath: string;
      audioPath: string;
    }
  | { phase: "error"; message: string; stderrTail?: string };

export function TranscribeWorkflow() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) return;

      abortRef.current = new AbortController();
      setPhase({ kind: "start" });

      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
          signal: abortRef.current.signal,
        });

        if (!res.body) throw new Error("No response stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line) as ServerEvent;
              applyEvent(ev, setPhase);
            } catch (parseErr) {
              console.warn("Bad line:", line, parseErr);
            }
          }
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError") {
          setPhase({ kind: "idle" });
          return;
        }
        setPhase({ kind: "error", message: e.message });
      }
    },
    [url]
  );

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const busy = phase.kind !== "idle" && phase.kind !== "done" && phase.kind !== "error";

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4"
      >
        <label className="section-label block mb-2">
          Video URL (YouTube, Twitter/X, Instagram, most platforms)
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            disabled={busy}
            className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white/90 placeholder-white/25 focus:outline-none focus:border-primary-hover/50 font-mono"
          />
          {busy ? (
            <button
              type="button"
              onClick={handleAbort}
              className="px-4 py-2 rounded-md text-[13px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
            >
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!url.trim()}
              className="px-4 py-2 rounded-md text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Transcribe
            </button>
          )}
        </div>
      </form>

      <PhaseStatus phase={phase} />

      {phase.kind === "done" ? (
        <>
          <TranscriptResultPanel phase={phase} />
          <TranscriptViewer transcript={phase.transcript} />
        </>
      ) : null}

      {phase.kind === "error" ? <ErrorPanel phase={phase} /> : null}
    </div>
  );
}

function applyEvent(ev: ServerEvent, set: (p: Phase) => void) {
  switch (ev.phase) {
    case "start":
      set({ kind: "start" });
      break;
    case "download":
      set({
        kind: "download",
        percent: ev.percent,
        speed: ev.speed,
        eta: ev.eta,
        stage: ev.stage,
      });
      break;
    case "extract":
      set({ kind: "extract" });
      break;
    case "transcribe":
      set({ kind: "transcribe", note: ev.line });
      break;
    case "done":
      set({
        kind: "done",
        transcript: ev.transcript,
        title: ev.metadata.title,
        duration: ev.metadata.duration,
        channel: ev.metadata.channel,
      });
      break;
    case "error":
      set({ kind: "error", message: ev.message, stderrTail: ev.stderrTail });
      break;
  }
}

function PhaseStatus({ phase }: { phase: Phase }) {
  if (phase.kind === "idle" || phase.kind === "done" || phase.kind === "error") {
    return null;
  }

  let label = "Starting…";
  let detail: string | null = null;
  let pct: number | null = null;

  if (phase.kind === "download") {
    label = phase.stage === "download" ? "Downloading video" : phase.stage === "merge" ? "Merging video + audio" : "Post-processing";
    pct = phase.percent;
    const bits: string[] = [];
    if (phase.speed) bits.push(phase.speed);
    if (phase.eta) bits.push(`ETA ${phase.eta}`);
    detail = bits.join(" · ");
  } else if (phase.kind === "extract") {
    label = "Extracting audio (ffmpeg)";
  } else if (phase.kind === "transcribe") {
    label = "Transcribing on GPU (WhisperX)";
    detail = phase.note ?? null;
  }

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-white/80">{label}</span>
        {pct !== null ? (
          <span className="text-[11px] text-white/50 tabular-nums">
            {pct.toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
        <div
          className={cn(
            "h-full bg-primary-hover transition-all",
            pct === null && "animate-pulse w-1/3"
          )}
          style={pct !== null ? { width: `${Math.max(2, pct)}%` } : undefined}
        />
      </div>
      {detail ? (
        <div className="mt-2 text-[11px] text-white/40 font-mono truncate">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function TranscriptResultPanel({
  phase,
}: {
  phase: Extract<Phase, { kind: "done" }>;
}) {
  const [copied, setCopied] = useState<"plain" | "claude" | null>(null);

  const copyPlain = async () => {
    const text = phase.transcript.segments
      .map((s) => s.text.trim())
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied("plain");
    setTimeout(() => setCopied(null), 1500);
  };

  const copyForClaude = async () => {
    const payload = buildSystemPrompt({ transcript: phase.transcript });
    await navigator.clipboard.writeText(payload);
    setCopied("claude");
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[13px] text-white/90 truncate">
            {phase.title}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {phase.channel ?? "unknown channel"}
            {phase.duration ? ` · ${Math.round(phase.duration / 60)}m` : ""}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={copyPlain}
            className="px-3 py-1.5 rounded text-[12px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
          >
            {copied === "plain" ? "Copied" : "Copy text"}
          </button>
          <button
            onClick={copyForClaude}
            className="px-3 py-1.5 rounded text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            {copied === "claude" ? "Copied" : "Copy for Claude.ai"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorPanel({
  phase,
}: {
  phase: Extract<Phase, { kind: "error" }>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4">
      <div className="text-[13px] text-white/90 font-medium mb-1">
        Transcription failed
      </div>
      <div className="text-[12px] text-white/70 mb-2">{phase.message}</div>
      {phase.stderrTail ? (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-[11px] text-white/50 hover:text-white/80 underline underline-offset-2"
          >
            {expanded ? "Hide" : "Show"} last 20 stderr lines
          </button>
          {expanded ? (
            <pre className="mt-2 p-3 rounded bg-black/40 text-[11px] text-white/70 font-mono whitespace-pre-wrap overflow-x-auto max-h-64">
              {phase.stderrTail}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
