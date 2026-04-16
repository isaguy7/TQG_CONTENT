import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WhisperResult } from "@/lib/transcript";

export type { WhisperResult, WhisperSegment, WhisperWord } from "@/lib/transcript";

const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const WHISPERX_MODEL = process.env.WHISPERX_MODEL || "large-v3";
const WHISPERX_DEVICE = process.env.WHISPERX_DEVICE || "cuda";
const WHISPERX_COMPUTE_TYPE = process.env.WHISPERX_COMPUTE_TYPE || "float16";
const WHISPERX_BATCH_SIZE = process.env.WHISPERX_BATCH_SIZE || "16";
const TRANSCRIBE_TIMEOUT_MS = parseInt(
  process.env.WHISPERX_TIMEOUT_MS || String(10 * 60 * 1000),
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

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          new Error(
            `WhisperX timed out after ${Math.round(TRANSCRIBE_TIMEOUT_MS / 1000)}s`
          )
        );
      }, TRANSCRIBE_TIMEOUT_MS);

      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (chunk: string) => {
        stderrBuf += chunk;
        for (const line of chunk.split(/\r?\n/)) {
          if (line && onStderrLine) onStderrLine(line);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
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
