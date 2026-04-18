import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WhisperResult, WhisperSegment } from "@/lib/transcript";
import { killTree } from "@/lib/kill-tree";

const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

function resolveCommand(args: string[]): { cmd: string; fullArgs: string[] } {
  const usePython =
    process.env.YTDLP_USE_PYTHON === "1" ||
    YTDLP_BIN.trim().toLowerCase() === "python -m yt_dlp";
  if (usePython) {
    return { cmd: PYTHON_BIN, fullArgs: ["-m", "yt_dlp", ...args] };
  }
  return { cmd: YTDLP_BIN, fullArgs: args };
}

export type CaptionResult = WhisperResult & {
  source: "youtube-manual" | "youtube-auto";
};

export class YtDlpMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YtDlpMissingError";
  }
}

/**
 * Attempt to fetch YouTube's auto-captions or manually-uploaded subtitles
 * via yt-dlp. Returns null if no captions are available. Prefers manual
 * captions over auto-generated. Language preference order: en, then first
 * available.
 *
 * Fast path for the drafting workflow: ~2-5s vs ~30-60s for WhisperX.
 */
export async function fetchYoutubeCaptions(
  url: string,
  language: string = "en",
  signal?: AbortSignal
): Promise<CaptionResult | null> {
  const workDir = await mkdtemp(path.join(tmpdir(), "tqg-captions-"));
  // Debug is on by default in dev; opt-in via env in prod.
  const debug =
    process.env.TQG_CAPTIONS_DEBUG === "1" ||
    process.env.NODE_ENV === "development";
  const log = (msg: string) => {
    if (debug) console.log(`[captions] ${msg}`);
  };

  try {
    const args = [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      // Match 'en', 'en-US', 'en-GB', 'en-orig', etc.
      `${language},${language}-*,${language}.*`,
      "--sub-format",
      "vtt/best",
      "--convert-subs",
      "vtt",
      "--no-warnings",
      "-o",
      path.join(workDir, "sub.%(ext)s"),
      url,
    ];

    log(`Running yt-dlp: ${args.join(" ")}`);
    const { code, stderr } = await runYtdlp(args, signal);
    log(`yt-dlp exit ${code}. stderr tail:\n${stderr.split(/\r?\n/).slice(-8).join("\n")}`);

    if (code !== 0) {
      log("yt-dlp failed; skipping captions path");
      return null;
    }

    const files = await readdir(workDir);
    log(`workDir files: ${files.join(", ") || "(none)"}`);

    const vttFiles = files.filter((f) => f.endsWith(".vtt"));
    if (vttFiles.length === 0) {
      log("no .vtt files found — captions unavailable for this video");
      return null;
    }

    const manual = vttFiles.find(
      (f) => !/\.auto\.|-auto\.|\.orig\./i.test(f)
    );
    const picked = manual || vttFiles[0];
    const isAuto = !manual;
    log(`picked ${picked} (${isAuto ? "auto" : "manual"})`);

    const vttPath = path.join(workDir, picked);
    const vttText = await readFile(vttPath, "utf-8");
    const segments = parseVtt(vttText);
    log(`parsed ${segments.length} segments`);

    if (segments.length === 0) return null;

    return {
      language,
      segments,
      model: isAuto ? "youtube-auto-captions" : "youtube-manual-captions",
      aligned: false,
      source: isAuto ? "youtube-auto" : "youtube-manual",
    };
  } catch (err) {
    // Surface fatal config errors (missing yt-dlp binary) so the client can
    // render a real error. Only swallow "no captions available" style issues.
    if (err instanceof YtDlpMissingError) {
      log(`threw: ${err.message}`);
      throw err;
    }
    log(`threw: ${(err as Error).message}`);
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function runYtdlp(
  args: string[],
  signal?: AbortSignal
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const { cmd, fullArgs } = resolveCommand(args);
    const child = spawn(cmd, fullArgs, { shell: false });
    let stderr = "";

    const abortHandler = () => {
      killTree(child);
      reject(new Error("yt-dlp aborted"));
    };
    if (signal) {
      if (signal.aborted) abortHandler();
      else signal.addEventListener("abort", abortHandler, { once: true });
    }

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (err.code === "ENOENT") {
        reject(
          new YtDlpMissingError(
            `yt-dlp not found (tried '${cmd}'). Install with 'pip install yt-dlp' ` +
              `then set YTDLP_USE_PYTHON=1 in .env.local, or point YTDLP_BIN at the binary.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (signal?.aborted) return;
      resolve({ code: code ?? 1, stderr });
    });
  });
}

/**
 * Minimal VTT parser. Handles the common YouTube format:
 *
 *   WEBVTT
 *
 *   00:00:00.000 --> 00:00:03.500
 *   Hello and welcome.
 *
 *   00:00:03.500 --> 00:00:07.200
 *   Today we're talking about...
 *
 * Also strips YouTube auto-sub inline word-timing tags like
 *   <00:00:01.200><c>word</c>
 * since we only want segment-level text here.
 */
export function parseVtt(vtt: string): WhisperSegment[] {
  const lines = vtt.replace(/\r\n/g, "\n").split("\n");
  const segments: WhisperSegment[] = [];

  let i = 0;
  // Skip header block
  while (i < lines.length && !/-->/.test(lines[i])) i++;

  const timeRe = /(\d\d):(\d\d):(\d\d)[.,](\d{3})\s*-->\s*(\d\d):(\d\d):(\d\d)[.,](\d{3})/;

  const seen = new Set<string>();

  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(timeRe);
    if (!m) {
      i++;
      continue;
    }
    const start =
      parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
    const end =
      parseInt(m[5]) * 3600 + parseInt(m[6]) * 60 + parseInt(m[7]) + parseInt(m[8]) / 1000;
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !timeRe.test(lines[i])) {
      textLines.push(lines[i]);
      i++;
    }

    const text = cleanVttText(textLines.join(" ")).trim();
    if (!text) continue;

    // Dedup: YouTube auto-subs emit overlapping repeating cues.
    const key = `${start.toFixed(2)}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);

    segments.push({ start, end, text });
  }

  return mergeAdjacent(segments);
}

function cleanVttText(s: string): string {
  return s
    // Strip inline timing tags: <00:00:01.200>
    .replace(/<\d\d:\d\d:\d\d\.\d{3}>/g, "")
    // Strip colour/class markup: <c>, </c>, <c.colorE5E5E5>
    .replace(/<\/?c[^>]*>/g, "")
    // Strip voice markup: <v Speaker>
    .replace(/<v[^>]*>/g, "")
    // Strip any other angle-bracket tags
    .replace(/<[^>]+>/g, "")
    // Common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

/**
 * YouTube auto-subs emit many small overlapping cues. Merge segments
 * whose text starts with the previous segment's text (rolling captions)
 * by keeping the longest version.
 */
function mergeAdjacent(segments: WhisperSegment[]): WhisperSegment[] {
  const out: WhisperSegment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && s.text.startsWith(prev.text)) {
      // Replace prev with the longer rolling version
      out[out.length - 1] = { start: prev.start, end: s.end, text: s.text };
    } else {
      out.push(s);
    }
  }
  return out;
}
