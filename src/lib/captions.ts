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

export class CaptionsHttpError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "invalid_url"
      | "watch_page_blocked"
      | "player_not_parsed"
      | "no_tracks"
      | "language_not_found"
      | "timedtext_blocked"
      | "empty_timedtext"
  ) {
    super(message);
    this.name = "CaptionsHttpError";
  }
}

/**
 * HTTP-only YouTube caption fetcher for environments without yt-dlp
 * (e.g. Vercel). Fetches the watch page, extracts the caption track list
 * from `ytInitialPlayerResponse`, then pulls the timedtext feed and parses
 * it into WhisperSegments. Prefers manual captions, falls back to ASR.
 *
 * Throws CaptionsHttpError for each distinct failure mode so the calling
 * route can surface precise messages — silently returning null made
 * "nothing happened" bugs on Vercel hard to diagnose.
 */
export async function fetchYoutubeCaptionsHttp(
  url: string,
  language: string = "en",
  signal?: AbortSignal
): Promise<CaptionResult & { title: string | null; channel: string | null }> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new CaptionsHttpError(
      `Not a recognised YouTube URL: ${url}`,
      "invalid_url"
    );
  }

  // Emit logs by default — Vercel production hides dev-only ones, but
  // this is exactly where we need them (e.g. YouTube IP-blocking the
  // host, serving consent interstitials). Opt out with TQG_CAPTIONS_DEBUG=0.
  const debug = process.env.TQG_CAPTIONS_DEBUG !== "0";
  const log = (msg: string) => {
    if (debug) console.log(`[captions-http] ${msg}`);
  };
  log(`videoId=${videoId} lang=${language}`);

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  log(`fetching ${watchUrl}`);
  let pageRes: Response;
  try {
    pageRes = await fetch(watchUrl, {
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (err) {
    log(`watch page fetch failed: ${(err as Error).message}`);
    throw new CaptionsHttpError(
      `Network error fetching YouTube page: ${(err as Error).message}`,
      "watch_page_blocked"
    );
  }
  if (!pageRes.ok) {
    log(`watch page HTTP ${pageRes.status}`);
    throw new CaptionsHttpError(
      `YouTube returned HTTP ${pageRes.status} for the video page. ` +
        `YouTube may be blocking requests from this host's IP.`,
      "watch_page_blocked"
    );
  }
  const html = await pageRes.text();

  const player = extractPlayerResponse(html);
  if (!player) {
    log(
      `ytInitialPlayerResponse not found in page (html length=${html.length})`
    );
    throw new CaptionsHttpError(
      "Couldn't parse YouTube's player data. The page format may have " +
        "changed, or YouTube served a consent/bot-check page.",
      "player_not_parsed"
    );
  }

  const tracks: CaptionTrack[] =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    log("no caption tracks on video");
    throw new CaptionsHttpError(
      "This video has no caption tracks at all (no auto-subs, no manual).",
      "no_tracks"
    );
  }

  const picked = pickCaptionTrack(tracks, language);
  if (!picked) {
    const available = tracks.map((t) => t.languageCode).join(", ");
    log(`no track matched language=${language}; available=${available}`);
    throw new CaptionsHttpError(
      `No ${language} captions found. Available languages: ${available || "none"}.`,
      "language_not_found"
    );
  }
  log(
    `picked track lang=${picked.languageCode} kind=${picked.kind ?? "manual"}`
  );

  // Request JSON3 format — avoids XML parsing and gives reliable timings.
  const trackUrl = new URL(picked.baseUrl);
  trackUrl.searchParams.set("fmt", "json3");
  let captionRes: Response;
  try {
    captionRes = await fetch(trackUrl.toString(), { signal });
  } catch (err) {
    log(`timedtext fetch failed: ${(err as Error).message}`);
    throw new CaptionsHttpError(
      `Network error fetching captions: ${(err as Error).message}`,
      "timedtext_blocked"
    );
  }
  if (!captionRes.ok) {
    log(`timedtext HTTP ${captionRes.status}`);
    throw new CaptionsHttpError(
      `YouTube returned HTTP ${captionRes.status} for the caption track.`,
      "timedtext_blocked"
    );
  }
  const json = (await captionRes.json()) as Json3Response;
  const segments = parseJson3(json);
  if (segments.length === 0) {
    log("timedtext parsed to 0 segments");
    throw new CaptionsHttpError(
      "YouTube returned an empty caption track.",
      "empty_timedtext"
    );
  }

  const isAuto = picked.kind === "asr";
  const videoDetails = player?.videoDetails ?? {};
  return {
    language: picked.languageCode || language,
    segments,
    model: isAuto ? "youtube-auto-captions" : "youtube-manual-captions",
    aligned: false,
    source: isAuto ? "youtube-auto" : "youtube-manual",
    title: typeof videoDetails.title === "string" ? videoDetails.title : null,
    channel: typeof videoDetails.author === "string" ? videoDetails.author : null,
  };
}

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (!/youtube\.com$/.test(host) && !/youtube-nocookie\.com$/.test(host))
      return null;
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    const prefixes = ["/embed/", "/shorts/", "/live/", "/v/"];
    for (const p of prefixes) {
      if (u.pathname.startsWith(p)) {
        const id = u.pathname.slice(p.length).split("/")[0];
        return /^[\w-]{11}$/.test(id) ? id : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: "asr" | string;
  name?: { simpleText?: string };
};

type PlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
  videoDetails?: { title?: string; author?: string };
};

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string; tOffsetMs?: number }>;
};
type Json3Response = { events?: Json3Event[] };

function extractPlayerResponse(html: string): PlayerResponse | null {
  // Two common embedding forms: `var ytInitialPlayerResponse = {...};`
  // and `"ytInitialPlayerResponse": "{...}"` (stringified in ytcfg).
  const m = html.match(
    /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:var\s|<\/script>)/
  );
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {
      /* fall through */
    }
  }
  const m2 = html.match(/"playerResponse"\s*:\s*"(\{(?:\\.|[^"\\])*\})"/);
  if (m2) {
    try {
      const unescaped = JSON.parse(`"${m2[1]}"`);
      return JSON.parse(unescaped as string);
    } catch {
      /* fall through */
    }
  }
  return null;
}

function pickCaptionTrack(
  tracks: CaptionTrack[],
  language: string
): CaptionTrack | null {
  const lang = language.toLowerCase();
  const byLang = (t: CaptionTrack) =>
    (t.languageCode || "").toLowerCase().startsWith(lang);
  const manual = tracks.find((t) => byLang(t) && t.kind !== "asr");
  if (manual) return manual;
  const asr = tracks.find((t) => byLang(t) && t.kind === "asr");
  if (asr) return asr;
  // Fallback to any manual track, else any track.
  return (
    tracks.find((t) => t.kind !== "asr") ?? tracks[0] ?? null
  );
}

function parseJson3(json: Json3Response): WhisperSegment[] {
  const events = Array.isArray(json?.events) ? json.events : [];
  const out: WhisperSegment[] = [];
  for (const ev of events) {
    if (typeof ev.tStartMs !== "number") continue;
    if (!Array.isArray(ev.segs)) continue;
    const text = ev.segs
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const start = ev.tStartMs / 1000;
    const end = start + Math.max(0, (ev.dDurationMs ?? 0) / 1000);
    out.push({ start, end, text });
  }
  return out;
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
