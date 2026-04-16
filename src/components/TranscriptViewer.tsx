"use client";

import { useMemo, useState } from "react";
import type { WhisperResult, WhisperSegment } from "@/lib/transcript";

function formatTs(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TranscriptViewer({
  transcript,
  showWordTimestamps = true,
}: {
  transcript: WhisperResult;
  showWordTimestamps?: boolean;
}) {
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const hasWords = useMemo(
    () => transcript.segments.some((s) => s.words && s.words.length > 0),
    [transcript]
  );

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">
          Transcript · {transcript.language}
          {transcript.aligned ? " · word-aligned" : ""}
        </span>
        <span className="text-[11px] text-white/40">
          {transcript.segments.length} segments
        </span>
      </div>
      <div className="font-mono text-[13px] leading-relaxed text-white/80 space-y-2 max-h-[60vh] overflow-y-auto">
        {transcript.segments.map((seg, idx) => (
          <SegmentRow
            key={idx}
            seg={seg}
            showWordTimestamps={showWordTimestamps && hasWords}
            onHoverWord={setHoveredWord}
          />
        ))}
      </div>
      {hoveredWord ? (
        <div className="mt-3 pt-3 border-t border-white/[0.05] text-[11px] text-white/50 font-mono">
          {hoveredWord}
        </div>
      ) : null}
    </div>
  );
}

function SegmentRow({
  seg,
  showWordTimestamps,
  onHoverWord,
}: {
  seg: WhisperSegment;
  showWordTimestamps: boolean;
  onHoverWord: (s: string | null) => void;
}) {
  return (
    <div className="flex gap-3">
      <span className="text-white/30 shrink-0 w-12 text-right tabular-nums">
        {formatTs(seg.start)}
      </span>
      <div className="flex-1 flex flex-wrap gap-x-1 gap-y-0.5">
        {showWordTimestamps && seg.words && seg.words.length > 0
          ? seg.words.map((w, i) => (
              <span
                key={i}
                className="hover:bg-white/10 rounded px-0.5 cursor-default transition-colors"
                onMouseEnter={() =>
                  onHoverWord(
                    `${w.word.trim()} @ ${formatTs(w.start ?? 0)}–${formatTs(w.end ?? 0)}${
                      w.score !== undefined ? ` · ${w.score.toFixed(2)}` : ""
                    }`
                  )
                }
                onMouseLeave={() => onHoverWord(null)}
              >
                {w.word.trim()}
              </span>
            ))
          : seg.text.trim()}
      </div>
    </div>
  );
}
