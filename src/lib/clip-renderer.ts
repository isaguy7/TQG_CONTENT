import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { killTree } from "@/lib/kill-tree";
import { buildAssSubtitles, type SubtitleLine } from "@/lib/subtitles";

const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";

export type ClipRenderOptions = {
  backgroundVideo: string;
  recitationAudio: string;
  subtitles: SubtitleLine[];
  subtitleFile?: string; // optional pre-generated .ass path
  watermarkPath?: string | null;
  startTime: number;
  endTime: number;
  outputPath: string;
  useNvenc?: boolean;
};

const MAX_CLIP_SECONDS = 20;

function tailLines(s: string, n: number): string {
  return s.split(/\r?\n/).filter(Boolean).slice(-n).join("\n");
}

export async function renderClip(options: ClipRenderOptions): Promise<void> {
  const duration = options.endTime - options.startTime;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Clip duration must be > 0");
  }
  if (duration > MAX_CLIP_SECONDS) {
    throw new Error(
      `Clip duration ${duration.toFixed(2)}s exceeds ${MAX_CLIP_SECONDS}s limit`
    );
  }

  const outDir = path.dirname(options.outputPath);
  await mkdir(outDir, { recursive: true });

  let subtitlePath = options.subtitleFile;
  if (!subtitlePath) {
    const ass = buildAssSubtitles(options.subtitles, {
      width: 1080,
      height: 1080,
    });
    subtitlePath = path.join(outDir, `${path.basename(options.outputPath, path.extname(options.outputPath))}.ass`);
    await writeFile(subtitlePath, ass, "utf-8");
  }

  const videoEncoder = options.useNvenc !== false ? "h264_nvenc" : "libx264";

  // Build filter graph:
  //   [bg] crop/scale to 1080x1080, pad, trim to duration
  //   apply .ass subtitles
  //   optional watermark overlay bottom-right at 90% margin
  const filters: string[] = [];
  filters.push(
    "[0:v]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,setsar=1[bg]"
  );

  // Escape path for ffmpeg subtitles filter (Windows + Linux).
  const subPathEsc = subtitlePath
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
  filters.push(`[bg]subtitles='${subPathEsc}'[sub]`);

  let videoLabel = "[sub]";
  const args: string[] = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(options.startTime),
    "-t",
    String(duration),
    "-stream_loop",
    "-1",
    "-i",
    options.backgroundVideo,
    "-ss",
    String(options.startTime),
    "-t",
    String(duration),
    "-i",
    options.recitationAudio,
  ];

  if (options.watermarkPath) {
    args.push("-i", options.watermarkPath);
    filters.push(
      `${videoLabel}[2:v]overlay=W-w-32:H-h-32:format=auto[out]`
    );
    videoLabel = "[out]";
  }

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    videoLabel,
    "-map",
    "1:a",
    "-c:v",
    videoEncoder,
    "-preset",
    options.useNvenc !== false ? "p4" : "medium",
    "-b:v",
    "4M",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    String(duration),
    options.outputPath
  );

  await runFfmpeg(args);
}

function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { shell: false });
    let stderr = "";
    const abortHandler = () => {
      killTree(child);
      reject(new Error("ffmpeg aborted"));
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
        reject(new Error(`ffmpeg not found (tried '${FFMPEG_BIN}')`));
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (signal?.aborted) return;
      if (code === 0) resolve();
      else
        reject(
          new Error(`ffmpeg exited ${code}. stderr:\n${tailLines(stderr, 20)}`)
        );
    });
  });
}
