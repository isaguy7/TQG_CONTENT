"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TranscriptViewer } from "@/components/TranscriptViewer";
import type { WhisperResult, WhisperSegment } from "@/lib/transcript";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { cn } from "@/lib/utils";

type Source = "youtube-auto" | "youtube-manual" | "whisperx";

type Phase =
  | { kind: "idle" }
  | { kind: "start" }
  | { kind: "captions" }
  | { kind: "captions-not-found"; reason?: string }
  | {
      kind: "download";
      percent: number | null;
      speed: string | null;
      eta: string | null;
      stage: string;
    }
  | { kind: "extract" }
  | {
      kind: "transcribe";
      duration: number;
      language: string | null;
      model: string | null;
      segments: WhisperSegment[];
      progress: number;
      aligning: boolean;
      note?: string;
    }
  | {
      kind: "done";
      source: Source;
      transcript: WhisperResult;
      title: string;
      duration: number | null;
      channel: string | null;
    }
  | { kind: "error"; message: string; stderrTail?: string; traceback?: string };

type ServerEvent =
  | { phase: "start"; url: string }
  | { phase: "captions-try" }
  | { phase: "captions-not-found"; reason?: string }
  | {
      phase: "download";
      percent: number | null;
      speed: string | null;
      eta: string | null;
      stage: string;
    }
  | { phase: "extract" }
  | {
      phase: "transcribe-meta";
      duration: number;
      language: string;
      model: string;
    }
  | { phase: "segment"; segment: WhisperSegment; progress: number }
  | { phase: "align" }
  | { phase: "transcribe"; line?: string }
  | {
      phase: "done";
      source: Source;
      transcript: WhisperResult;
      metadata: { title: string; duration: number | null; channel: string | null };
    }
  | { phase: "error"; message: string; stderrTail?: string; traceback?: string };

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current) setElapsed((Date.now() - startRef.current) / 1000);
    }, 500);
    return () => clearInterval(id);
  }, [active]);
  return elapsed;
}

export function TranscribeWorkflow() {
  const [url, setUrl] = useState("");
  const [forceWhisper, setForceWhisper] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [hosted, setHosted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/environment", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setHosted(!!j?.hosted))
      .catch(() => setHosted(false));
  }, []);

  const runTranscribe = useCallback(
    async (targetUrl: string, force: boolean) => {
      // Abort any in-flight request from a previous click before starting.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Gate every state update through this closure. Once the user
      // cancels, controller.signal.aborted is true forever for this run,
      // so any buffered setPhase becomes a no-op. This is the fix for
      // 'cancel flips back to transcribing' — the React update queue
      // could reorder a late setPhase(transcribe-meta) after handleAbort's
      // setPhase(idle) without this guard.
      const safeSetPhase = (updater: Phase | ((prev: Phase) => Phase)) => {
        if (controller.signal.aborted) return;
        if (typeof updater === "function") {
          setPhase((prev) => {
            if (controller.signal.aborted) return prev;
            return (updater as (p: Phase) => Phase)(prev);
          });
        } else {
          setPhase(updater);
        }
      };

      safeSetPhase({ kind: "start" });

      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl, forceWhisper: force }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;
        if (!res.body) throw new Error("No response stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (controller.signal.aborted) break;
          const { done, value } = await reader.read();
          if (controller.signal.aborted) break;
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            if (controller.signal.aborted) break;
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line) as ServerEvent;
              safeSetPhase((prev) => reducePhase(prev, ev));
            } catch (parseErr) {
              console.warn("Bad line:", line, parseErr);
            }
          }
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError" || controller.signal.aborted) {
          return;
        }
        safeSetPhase({ kind: "error", message: e.message });
      }
    },
    []
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) return;
      runTranscribe(url.trim(), forceWhisper);
    },
    [url, forceWhisper, runTranscribe]
  );

  const handleRetryWithWhisper = useCallback(() => {
    if (!url.trim()) return;
    runTranscribe(url.trim(), true);
  }, [url, runTranscribe]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    // Immediately reset UI — don't wait for the catch block, don't let any
    // buffered server event bring us back into transcribe/segment state.
    setPhase({ kind: "idle" });
  }, []);

  // Note: captions-not-found is treated as busy so the main button stays
  // 'Cancel'. Only the amber panel's Yes/No buttons can advance or abort
  // from that state — otherwise clicking the main button (thinking it's
  // Cancel) would fire a fresh Transcribe.
  const busy =
    phase.kind !== "idle" &&
    phase.kind !== "done" &&
    phase.kind !== "error";

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Form submit from Enter key in the URL input. If we're already
          // busy, do nothing — only the button click cancels.
          if (!busy && url.trim()) runTranscribe(url.trim(), forceWhisper);
        }}
        className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4"
      >
        <label className="section-label block mb-2">
          {hosted
            ? "YouTube URL (pulls existing captions — no GPU needed)"
            : "Video URL (YouTube, X, Instagram, most platforms)"}
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
          {/*
            Single stable button element. Using one element instead of
            swapping between two prevents a React re-render during the
            mousedown→mouseup window from routing the click to the wrong
            replacement button (which would fire Transcribe when the user
            intended Cancel).
          */}
          <button
            key="transcribe-action"
            type="button"
            onClick={() => {
              if (busy) {
                handleAbort();
              } else if (url.trim()) {
                runTranscribe(url.trim(), forceWhisper);
              }
            }}
            disabled={!busy && !url.trim()}
            aria-label={busy ? "Cancel transcription" : "Start transcription"}
            className={cn(
              "px-4 py-2 rounded-md text-[13px] transition-colors",
              busy
                ? "border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
                : "font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {busy ? "Cancel" : "Transcribe"}
          </button>
        </div>
        {hosted ? (
          <p className="mt-3 text-[11px] text-white/45 leading-relaxed">
            Hosted mode fetches YouTube&apos;s existing captions (auto or
            manual) directly — no GPU required. WhisperX transcription is
            available when you run the Studio locally.
          </p>
        ) : (
          <label className="mt-3 flex items-center gap-2 text-[12px] text-white/55 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceWhisper}
              onChange={(e) => setForceWhisper(e.target.checked)}
              disabled={busy}
              className="accent-primary-hover"
            />
            Force WhisperX (skip YouTube captions, get word-level timestamps)
          </label>
        )}
      </form>

      <PhaseStatus phase={phase} />

      {phase.kind === "captions-not-found" ? (
        <CaptionsNotFoundPanel
          reason={phase.reason}
          onUseWhisper={handleRetryWithWhisper}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      ) : null}

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

function reducePhase(prev: Phase, ev: ServerEvent): Phase {
  switch (ev.phase) {
    case "start":
      return { kind: "start" };
    case "captions-not-found":
      return { kind: "captions-not-found", reason: ev.reason };
    case "captions-try":
      return { kind: "captions" };
    case "download":
      return {
        kind: "download",
        percent: ev.percent,
        speed: ev.speed,
        eta: ev.eta,
        stage: ev.stage,
      };
    case "extract":
      return { kind: "extract" };
    case "transcribe-meta":
      if (prev.kind === "transcribe") {
        return {
          ...prev,
          duration: ev.duration,
          language: ev.language,
          model: ev.model,
        };
      }
      return {
        kind: "transcribe",
        duration: ev.duration,
        language: ev.language,
        model: ev.model,
        segments: [],
        progress: 0,
        aligning: false,
      };
    case "segment":
      if (prev.kind === "transcribe") {
        return {
          ...prev,
          segments: [...prev.segments, ev.segment],
          progress: Math.max(prev.progress, ev.progress),
        };
      }
      return {
        kind: "transcribe",
        duration: 0,
        language: null,
        model: null,
        segments: [ev.segment],
        progress: ev.progress,
        aligning: false,
      };
    case "align":
      if (prev.kind === "transcribe") {
        return { ...prev, aligning: true };
      }
      return prev;
    case "transcribe":
      if (prev.kind === "transcribe") {
        return { ...prev, note: ev.line };
      }
      return {
        kind: "transcribe",
        duration: 0,
        language: null,
        model: null,
        segments: [],
        progress: 0,
        aligning: false,
        note: ev.line,
      };
    case "done":
      return {
        kind: "done",
        source: ev.source,
        transcript: ev.transcript,
        title: ev.metadata.title,
        duration: ev.metadata.duration,
        channel: ev.metadata.channel,
      };
    case "error":
      return {
        kind: "error",
        message: ev.message,
        stderrTail: ev.stderrTail,
        traceback: ev.traceback,
      };
  }
}

function CaptionsNotFoundPanel({
  reason,
  onUseWhisper,
  onCancel,
}: {
  reason?: string;
  onUseWhisper: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg bg-warning/[0.06] border border-warning/40 p-4">
      <div className="text-[13px] text-white/90 font-medium mb-1">
        No YouTube captions found
      </div>
      <div className="text-[12px] text-white/60 mb-3">
        {reason || "yt-dlp couldn't fetch subtitles for this video."} Transcribe
        with WhisperX on your GPU instead? That'll download the video and run
        through large-v3-turbo on your 4060 Ti.
      </div>
      <div className="flex gap-2">
        <button
          onClick={onUseWhisper}
          className="px-3 py-1.5 rounded text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover"
        >
          Yes, use WhisperX (GPU)
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-[12px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
        >
          No, cancel
        </button>
      </div>
    </div>
  );
}

function PhaseStatus({ phase }: { phase: Phase }) {
  const activeForTimer =
    phase.kind !== "idle" &&
    phase.kind !== "done" &&
    phase.kind !== "error" &&
    phase.kind !== "captions-not-found";
  const elapsed = useElapsed(activeForTimer);

  // captions-not-found has its own panel (the amber prompt); don't render
  // a stale progress row on top of it.
  if (!activeForTimer) return null;

  let label = "Starting…";
  let sub: string | null = null;
  let pct: number | null = null;
  let indeterminate = true;

  if (phase.kind === "captions") {
    label = "Looking up YouTube captions";
    sub = "Skipping WhisperX if captions are available (instant)";
  } else if (phase.kind === "download") {
    label =
      phase.stage === "download"
        ? "Downloading video"
        : phase.stage === "merge"
          ? "Merging video + audio"
          : "Post-processing";
    pct = phase.percent;
    indeterminate = pct === null;
    const bits: string[] = [];
    if (phase.speed) bits.push(phase.speed);
    if (phase.eta) bits.push(`ETA ${phase.eta}`);
    sub = bits.join(" · ") || null;
  } else if (phase.kind === "extract") {
    label = "Extracting audio (ffmpeg)";
  } else if (phase.kind === "transcribe") {
    if (phase.aligning) {
      label = "Word-level alignment (wav2vec2)";
      sub = `${phase.segments.length} segments · finalising`;
    } else if (phase.duration > 0) {
      label = `Transcribing on GPU${phase.language ? ` · ${phase.language}` : ""}${phase.model ? ` · ${phase.model}` : ""}`;
      pct = phase.progress * 100;
      indeterminate = false;
      sub = `${phase.segments.length} segments · audio ${formatDuration(phase.duration * phase.progress)} / ${formatDuration(phase.duration)}`;
    } else {
      label = "Transcribing on GPU (WhisperX)";
      sub = phase.note || "Loading model…";
    }
  }

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-white/80">{label}</span>
        <span className="text-[11px] text-white/50 tabular-nums">
          {pct !== null ? `${pct.toFixed(1)}%` : formatDuration(elapsed)}
        </span>
      </div>
      {pct !== null ? (
        <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className="h-full bg-primary-hover transition-all duration-300"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      ) : (
        <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden relative">
          <div className="absolute inset-y-0 w-1/4 bg-primary-hover/70 animate-[shimmer_1.4s_ease-in-out_infinite]" />
        </div>
      )}
      {sub ? (
        <div className="mt-2 text-[11px] text-white/40 font-mono truncate">{sub}</div>
      ) : null}

      {phase.kind === "transcribe" && phase.segments.length > 0 ? (
        <StreamingSegments segments={phase.segments} />
      ) : null}
    </div>
  );
}

function StreamingSegments({ segments }: { segments: WhisperSegment[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments.length]);

  const last = segments.slice(-20); // keep DOM small
  return (
    <div
      ref={scrollRef}
      className="mt-3 max-h-56 overflow-y-auto font-mono text-[12px] leading-relaxed text-white/70 space-y-1 border-t border-white/[0.05] pt-3"
    >
      {last.map((s, i) => (
        <div key={`${s.start}-${i}`} className="flex gap-3">
          <span className="text-white/30 shrink-0 w-12 text-right tabular-nums">
            {formatDuration(s.start)}
          </span>
          <span className="flex-1">{s.text.trim()}</span>
        </div>
      ))}
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
    const text = phase.transcript.segments.map((s) => s.text.trim()).join("\n");
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

  const sourceLabel = useMemo(() => {
    switch (phase.source) {
      case "youtube-manual":
        return { text: "YouTube captions (manual)", tone: "primary" as const };
      case "youtube-auto":
        return { text: "YouTube captions (auto-generated)", tone: "primary" as const };
      case "whisperx":
        return {
          text: `WhisperX · ${phase.transcript.model}${phase.transcript.aligned ? " · word-aligned" : ""}`,
          tone: "muted" as const,
        };
    }
  }, [phase]);

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[13px] text-white/90 truncate">{phase.title}</div>
          <div className="text-[11px] mt-0.5 flex gap-2 items-center">
            <span className="text-white/40">
              {phase.channel ?? "unknown channel"}
              {phase.duration ? ` · ${Math.round(phase.duration / 60)}m` : ""}
            </span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px]",
                sourceLabel.tone === "primary"
                  ? "bg-primary/[0.15] text-primary-bright"
                  : "bg-white/[0.05] text-white/50"
              )}
            >
              {sourceLabel.text}
            </span>
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
  const [showStderr, setShowStderr] = useState(false);
  const [showTraceback, setShowTraceback] = useState(true);

  const copyAll = async () => {
    const parts = [phase.message];
    if (phase.traceback) parts.push("\n--- Python traceback ---\n" + phase.traceback);
    if (phase.stderrTail) parts.push("\n--- stderr (last 20 lines) ---\n" + phase.stderrTail);
    await navigator.clipboard.writeText(parts.join("\n"));
  };

  return (
    <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[13px] text-white/90 font-medium mb-1">
            Transcription failed
          </div>
          <div className="text-[12px] text-white/70 font-mono whitespace-pre-wrap">
            {phase.message}
          </div>
        </div>
        <button
          onClick={copyAll}
          className="shrink-0 px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.04]"
        >
          Copy all
        </button>
      </div>
      {phase.traceback ? (
        <div className="mt-3">
          <button
            onClick={() => setShowTraceback((e) => !e)}
            className="text-[11px] text-white/60 hover:text-white/90 underline underline-offset-2"
          >
            {showTraceback ? "Hide" : "Show"} Python traceback
          </button>
          {showTraceback ? (
            <pre className="mt-2 p-3 rounded bg-black/40 text-[11px] text-white/75 font-mono whitespace-pre-wrap overflow-x-auto max-h-80">
              {phase.traceback}
            </pre>
          ) : null}
        </div>
      ) : null}
      {phase.stderrTail ? (
        <div className="mt-3">
          <button
            onClick={() => setShowStderr((e) => !e)}
            className="text-[11px] text-white/50 hover:text-white/80 underline underline-offset-2"
          >
            {showStderr ? "Hide" : "Show"} last 20 stderr lines
          </button>
          {showStderr ? (
            <pre className="mt-2 p-3 rounded bg-black/40 text-[11px] text-white/70 font-mono whitespace-pre-wrap overflow-x-auto max-h-64">
              {phase.stderrTail}
            </pre>
          ) : null}
        </div>
      ) : null}
      {!phase.traceback && !phase.stderrTail ? (
        <div className="mt-2 text-[11px] text-white/40">
          No extra diagnostics captured. Check the terminal running{" "}
          <code className="font-mono text-white/60">npm run dev</code>.
        </div>
      ) : null}
    </div>
  );
}
