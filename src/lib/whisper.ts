import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WhisperResult } from "@/lib/transcript";

export type { WhisperResult, WhisperSegment, WhisperWord } from "@/lib/transcript";

const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const WHISPERX_MODEL = process.env.WHISPERX_MODEL || "large-v3-turbo";
const WHISPERX_DEVICE = process.env.WHISPERX_DEVICE || "cuda";
// int8_float16 fits large-v3 comfortably on 8GB VRAM. Bump to float16 for
// 16GB+ cards for ~5% accuracy improvement. On a 24GB card you can use
// float16 + batch 16 without thinking about it.
const WHISPERX_COMPUTE_TYPE = process.env.WHISPERX_COMPUTE_TYPE || "int8_float16";
const WHISPERX_BATCH_SIZE = process.env.WHISPERX_BATCH_SIZE || "2";
// 0 = no timeout. Default 6h — plenty of headroom for multi-hour lectures
// on the 4090. Override via WHISPERX_TIMEOUT_MS (milliseconds, 0 to disable).
const TRANSCRIBE_TIMEOUT_MS = parseInt(
  process.env.WHISPERX_TIMEOUT_MS || String(6 * 60 * 60 * 1000),
  10
);

export type WhisperError = {
  message: string;
  stderrTail: string;
  traceback?: string;
};

export type TranscribeOptions = {
  audioPath: string;
  language?: string;
  onStderrLine?: (line: string) => void;
};

/**
 * Run scripts/transcribe.py as a subprocess. Writes output to a temp JSON
 * file (never stdout) so we only parse after process exit. Captures the
 * last 20 lines of stderr for error surfaces.
 */
export async function transcribe(opts: TranscribeOptions): Promise<WhisperResult> {
  const { audioPath, language = "auto", onStderrLine } = opts;

  const workDir = await mkdtemp(path.join(tmpdir(), "tqg-whisper-"));
  const outputPath = path.join(workDir, "result.json");

  const scriptPath = path.join(process.cwd(), "scripts", "transcribe.py");

  const args = [
    scriptPath,
    "--audio",
    audioPath,
    "--output",
    outputPath,
    "--model",
    WHISPERX_MODEL,
    "--device",
    WHISPERX_DEVICE,
    "--compute-type",
    WHISPERX_COMPUTE_TYPE,
    "--batch-size",
    WHISPERX_BATCH_SIZE,
    "--language",
    language,
  ];

  let stderrBuf = "";

  try {
    const { code } = await new Promise<{ code: number }>((resolve, reject) => {
      const child = spawn(PYTHON_BIN, args, {
        shell: false,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUNBUFFERED: "1",
        },
      });

      const timeout =
        TRANSCRIBE_TIMEOUT_MS > 0
          ? setTimeout(() => {
              child.kill("SIGKILL");
              reject(
                new Error(
                  `WhisperX timed out after ${Math.round(
                    TRANSCRIBE_TIMEOUT_MS / 1000
                  )}s. Bump WHISPERX_TIMEOUT_MS in .env.local (0 to disable).`
                )
              );
            }, TRANSCRIBE_TIMEOUT_MS)
          : null;

      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (chunk: string) => {
        stderrBuf += chunk;
        for (const line of chunk.split(/\r?\n/)) {
          if (line && onStderrLine) onStderrLine(line);
        }
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (timeout) clearTimeout(timeout);
        if (err.code === "ENOENT") {
          reject(
            new Error(
              `Python not found on PATH (tried '${PYTHON_BIN}').\n\n` +
                `Set PYTHON_BIN in .env.local to the absolute path of your ` +
                `Python 3.10+ interpreter, or install Python and add it to PATH.`
            )
          );
          return;
        }
        reject(err);
      });
      child.on("close", (code) => {
        if (timeout) clearTimeout(timeout);
        resolve({ code: code ?? 1 });
      });
    });

    if (code !== 0) {
      let traceback: string | undefined;
      try {
        const raw = await readFile(outputPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed?.traceback) traceback = parsed.traceback;
      } catch {
        // Ignore — fall back to stderr.
      }
      const err: Error & { details?: WhisperError } = new Error(
        `WhisperX exited ${code}`
      );
      err.details = {
        message: `WhisperX exited with code ${code}`,
        stderrTail: tailLines(stderrBuf, 20),
        traceback,
      };
      throw err;
    }

    const raw = await readFile(outputPath, "utf-8");
    const result = JSON.parse(raw) as WhisperResult;
    return result;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function tailLines(s: string, n: number): string {
  return s.split(/\r?\n/).filter(Boolean).slice(-n).join("\n");
}
