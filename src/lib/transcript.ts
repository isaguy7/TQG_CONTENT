/**
 * Pure transcript types + helpers. Safe to import from client components.
 * No Node-only APIs here — the Node subprocess layer lives in lib/whisper.ts.
 */

export type WhisperWord = {
  word: string;
  start?: number;
  end?: number;
  score?: number;
};

export type WhisperSegment = {
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
};

export type WhisperResult = {
  language: string;
  segments: WhisperSegment[];
  model: string;
  aligned: boolean;
};

export function transcriptToText(result: WhisperResult): string {
  return result.segments.map((s) => s.text.trim()).join("\n");
}

export function transcriptToTimestampedLines(result: WhisperResult): string {
  return result.segments
    .map((s) => `[${formatTimestamp(s.start)}] ${s.text.trim()}`)
    .join("\n");
}

export function formatTimestamp(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
