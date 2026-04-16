import { spawn } from "node:child_process";
import { mkdir, access, readdir } from "node:fs/promises";
import path from "node:path";

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
  onProgress?: (p: YtDlpProgress) => void;
  onStderr?: (line: string) => void;
};

export async function downloadVideo(opts: DownloadOptions): Promise<YtDlpResult> {
  const { url, maxHeight = 2160, onProgress, onStderr } = opts;
  await mkdir(DOWNLOADS_DIR, { recursive: true });

  const metadata = await getMetadata(url);
  const safeTitle = sanitize(metadata.title || "video");
  const outputTemplate = path.join(DOWNLOADS_DIR, `${safeTitle}.%(ext)s`);

  const args = [
    "--no-playlist",
    "--newline", // one progress line per update, easier to parse
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
    const child = spawn(YTDLP_BIN, args, { shell: false });

    let stderrBuf = "";

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
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `yt-dlp not found on PATH (tried '${YTDLP_BIN}').\n\n` +
              `Install on Windows:\n` +
              `  pip install yt-dlp\n` +
              `  # or: winget install yt-dlp.yt-dlp\n` +
              `  # or: choco install yt-dlp\n\n` +
              `If installed in a non-PATH location, set YTDLP_BIN in .env.local ` +
              `to the absolute path to yt-dlp.exe.`
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
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

export async function getMetadata(url: string): Promise<YtDlpMetadata> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      YTDLP_BIN,
      ["--no-playlist", "--dump-single-json", "--no-warnings", url],
      { shell: false }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `yt-dlp not found on PATH (tried '${YTDLP_BIN}'). Install: pip install yt-dlp`
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
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
    const child = spawn(YTDLP_BIN, ["--version"], { shell: false });
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
