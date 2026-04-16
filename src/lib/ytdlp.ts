import { spawn } from "node:child_process";
import { mkdir, access, readdir } from "node:fs/promises";
import path from "node:path";
import { killTree } from "@/lib/kill-tree";

export type YtDlpProgress = {
  type: "progress";
  percent: number | null;
  speed: string | null;
  eta: string | null;
  stage: "download" | "merge" | "postprocess";
};

export type YtDlpMetadata = {
  title: string;
  duration: number | null;
  channel: string | null;
  uploadDate: string | null;
};

export type YtDlpResult = {
  videoPath: string;
  metadata: YtDlpMetadata;
};

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || "downloads";
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

/**
 * Resolve the yt-dlp spawn command. If YTDLP_BIN is 'python -m yt_dlp' OR
 * the user has set YTDLP_USE_PYTHON=1, we call Python's module form. This
 * avoids Windows PATH issues — particularly with Microsoft Store Python,
 * which sandboxes .exe scripts outside PATH.
 */
function resolveCommand(args: string[]): { cmd: string; fullArgs: string[] } {
  const usePython =
    process.env.YTDLP_USE_PYTHON === "1" ||
    YTDLP_BIN.trim().toLowerCase() === "python -m yt_dlp";
  if (usePython) {
    return { cmd: PYTHON_BIN, fullArgs: ["-m", "yt_dlp", ...args] };
  }
  return { cmd: YTDLP_BIN, fullArgs: args };
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

function parseProgressLine(line: string): YtDlpProgress | null {
  // yt-dlp --newline emits lines like:
  //   [download]  12.3% of 45.67MiB at 2.34MiB/s ETA 00:15
  //   [download] 100% of 45.67MiB in 00:20
  //   [Merger]   Merging formats into "file.mp4"
  //   [ExtractAudio] Destination: file.wav
  const download = line.match(
    /^\[download\]\s+(\d+\.?\d*)%(?:.*?at\s+([\S]+))?(?:.*?ETA\s+([\d:]+))?/
  );
  if (download) {
    return {
      type: "progress",
      percent: parseFloat(download[1]),
      speed: download[2] || null,
      eta: download[3] || null,
      stage: "download",
    };
  }
  if (/^\[Merger\]/.test(line)) {
    return { type: "progress", percent: null, speed: null, eta: null, stage: "merge" };
  }
  if (/^\[ExtractAudio\]|\[ffmpeg\]/.test(line)) {
    return { type: "progress", percent: null, speed: null, eta: null, stage: "postprocess" };
  }
  return null;
}

export type DownloadOptions = {
  url: string;
  maxHeight?: number;
  signal?: AbortSignal;
  onProgress?: (p: YtDlpProgress) => void;
  onStderr?: (line: string) => void;
};

export async function downloadVideo(opts: DownloadOptions): Promise<YtDlpResult> {
  const { url, maxHeight = 2160, signal, onProgress, onStderr } = opts;
  await mkdir(DOWNLOADS_DIR, { recursive: true });

  const metadata = await getMetadata(url, signal);
  const safeTitle = sanitize(metadata.title || "video");
  const outputTemplate = path.join(DOWNLOADS_DIR, `${safeTitle}.%(ext)s`);

  const args = [
    "--no-playlist",
    "--newline",
    "--no-colors",
    "--no-warnings",
    "-f",
    `bestvideo[height<=${maxHeight}]+bestaudio/best`,
    "--merge-output-format",
    "mp4",
    "-o",
    outputTemplate,
    url,
  ];

  await new Promise<void>((resolve, reject) => {
    const { cmd, fullArgs } = resolveCommand(args);
    const child = spawn(cmd, fullArgs, { shell: false });

    let stderrBuf = "";

    const abortHandler = () => {
      killTree(child);
      reject(new Error("Download aborted"));
    };
    if (signal) {
      if (signal.aborted) abortHandler();
      else signal.addEventListener("abort", abortHandler, { once: true });
    }

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");

    child.stdout.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line) continue;
        const p = parseProgressLine(line);
        if (p && onProgress) onProgress(p);
      }
    });

    child.stderr.on("data", (chunk: string) => {
      stderrBuf += chunk;
      for (const line of chunk.split(/\r?\n/)) {
        if (line && onStderr) onStderr(line);
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `yt-dlp not found (tried '${cmd}').\n\n` +
              `Fastest fix on Windows — use Python's module form (you already ` +
              `need Python for WhisperX):\n` +
              `  1. pip install yt-dlp\n` +
              `  2. Verify: python -m yt_dlp --version\n` +
              `  3. In .env.local, set:\n` +
              `     YTDLP_USE_PYTHON=1\n` +
              `  4. Restart 'npm run dev'.\n\n` +
              `Or set YTDLP_BIN to the absolute path of yt-dlp.exe.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (signal?.aborted) return; // already rejected
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited ${code}. stderr:\n${tailLines(stderrBuf, 20)}`));
    });
  });

  // Find the downloaded file.
  const dir = DOWNLOADS_DIR;
  const entries = await readdir(dir);
  const videoFile = entries.find((f) => f.startsWith(safeTitle) && /\.(mp4|mkv|webm)$/i.test(f));
  if (!videoFile) {
    throw new Error(`Download completed but no video file found matching ${safeTitle}.*`);
  }
  const videoPath = path.join(dir, videoFile);
  await access(videoPath);

  return { videoPath, metadata };
}

export async function getMetadata(url: string, signal?: AbortSignal): Promise<YtDlpMetadata> {
  return new Promise((resolve, reject) => {
    const { cmd, fullArgs } = resolveCommand([
      "--no-playlist",
      "--dump-single-json",
      "--no-warnings",
      url,
    ]);
    const child = spawn(cmd, fullArgs, { shell: false });

    const abortHandler = () => {
      killTree(child);
      reject(new Error("Metadata lookup aborted"));
    };
    if (signal) {
      if (signal.aborted) abortHandler();
      else signal.addEventListener("abort", abortHandler, { once: true });
    }

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `yt-dlp not found (tried '${cmd}'). Try: YTDLP_USE_PYTHON=1 in .env.local`
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (signal?.aborted) return;
      if (code !== 0) {
        return reject(
          new Error(`yt-dlp metadata exited ${code}. stderr:\n${tailLines(stderr, 20)}`)
        );
      }
      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title ?? "video",
          duration: typeof info.duration === "number" ? Math.round(info.duration) : null,
          channel: info.channel ?? info.uploader ?? null,
          uploadDate: info.upload_date ?? null,
        });
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp JSON: ${(err as Error).message}`));
      }
    });
  });
}

export async function getYtDlpVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const { cmd, fullArgs } = resolveCommand(["--version"]);
    const child = spawn(cmd, fullArgs, { shell: false });
    let out = "";
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (c: string) => (out += c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`yt-dlp --version exited ${code}`));
    });
  });
}

function tailLines(s: string, n: number): string {
  return s.split(/\r?\n/).filter(Boolean).slice(-n).join("\n");
}
