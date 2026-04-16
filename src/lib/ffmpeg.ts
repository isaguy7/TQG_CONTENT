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
  outputDir?: string
): Promise<string> {
  const dir = outputDir || path.dirname(videoPath);
  await mkdir(dir, { recursive: true });
  const base = path.basename(videoPath, path.extname(videoPath));
  const audioPath = path.join(dir, `${base}.wav`);

  const args = [
    "-y", // overwrite
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

  await runFfmpeg(args);
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

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, { shell: false });
    let stderr = "";
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}. stderr:\n${tailLines(stderr, 20)}`));
    });
  });
}
