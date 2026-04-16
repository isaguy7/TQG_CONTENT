import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";

function tailLines(s: string, n: number): string {
  return s.split(/\r?\n/).filter(Boolean).slice(-n).join("\n");
}

/**
 * Extract mono 16kHz WAV suitable for WhisperX.
 * Returns the path to the extracted audio file.
 */
export async function extractAudioForWhisper(
  videoPath: string,
  outputDir?: string,
  signal?: AbortSignal
): Promise<string> {
  const dir = outputDir || path.dirname(videoPath);
  await mkdir(dir, { recursive: true });
  const base = path.basename(videoPath, path.extname(videoPath));
  const audioPath = path.join(dir, `${base}.wav`);

  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-vn",
    "-c:a",
    "pcm_s16le",
    audioPath,
  ];

  await runFfmpeg(args, signal);
  return audioPath;
}

export async function getFfmpegVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, ["-version"], { shell: false });
    let out = "";
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (c: string) => (out += c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        const firstLine = out.split(/\r?\n/)[0] || "";
        resolve(firstLine);
      } else {
        reject(new Error(`ffmpeg -version exited ${code}`));
      }
    });
  });
}

function runFfmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { shell: false });
    let stderr = "";
    const abortHandler = () => {
      try {
        child.kill("SIGKILL");
      } catch {}
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
        reject(
          new Error(
            `ffmpeg not found on PATH (tried '${FFMPEG_BIN}').\n\n` +
              `Install on Windows:\n` +
              `  winget install Gyan.FFmpeg\n` +
              `  # or: choco install ffmpeg-full  (needed for Arabic font rendering)\n\n` +
              `If installed in a non-PATH location, set FFMPEG_BIN in .env.local.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (signal?.aborted) return;
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}. stderr:\n${tailLines(stderr, 20)}`));
    });
  });
}
