import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WhisperResult, WhisperSegment } from "@/lib/transcript";
import { killTree } from "@/lib/kill-tree";

export type { WhisperResult, WhisperSegment, WhisperWord } from "@/lib/transcript";

const PYTHON_BIN =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const WHISPERX_MODEL = process.env.WHISPERX_MODEL || "large-v3-turbo";
const WHISPERX_DEVICE = process.env.WHISPERX_DEVICE || "cuda";
const WHISPERX_COMPUTE_TYPE = process.env.WHISPERX_COMPUTE_TYPE || "int8_float16";
const WHISPERX_BATCH_SIZE = process.env.WHISPERX_BATCH_SIZE || "4";
// Word-level alignment is needed for Phase 5 (Quran clip overlays) but
// only adds time to simple post-drafting transcription. Off by default.
// Set WHISPERX_ALIGN=1 in .env.local to re-enable globally, or pass
// { align: true } per-call.
const WHISPERX_ALIGN_DEFAULT = process.env.WHISPERX_ALIGN === "1";
const TRANSCRIBE_TIMEOUT_MS = parseInt(
  process.env.WHISPERX_TIMEOUT_MS || String(6 * 60 * 60 * 1000),
  10
);

export type WhisperError = {
  message: string;
  stderrTail: string;
  traceback?: string;
};

export type TranscribeMeta = {
  duration: number;
  language: string;
  model: string;
};

export type TranscribeOptions = {
  audioPath: string;
  language?: string;
  align?: boolean; // word-level alignment; defaults to WHISPERX_ALIGN env (off)
  signal?: AbortSignal;
  onStderrLine?: (line: string) => void;
  onMeta?: (meta: TranscribeMeta) => void;
  onSegment?: (segment: WhisperSegment) => void;
  onAlignStart?: () => void;
};

/**
 * Run scripts/transcribe.py as a subprocess with streaming output.
 *
 * The Python side emits marker lines to stderr:
 *   TQG_META:{"duration":..,"language":"..","model":".."}
 *   TQG_SEGMENT:{"start":..,"end":..,"text":".."}
 *   TQG_ALIGN_START
 *   TQG_DONE
 *
 * Plus free-form informational lines. All marker lines are removed
 * before the non-marker line is handed to onStderrLine (for progress
 * panels) so the UI doesn't see our internal protocol.
 */
export async function transcribe(opts: TranscribeOptions): Promise<WhisperResult> {
  const {
    audioPath,
    language = "auto",
    align = WHISPERX_ALIGN_DEFAULT,
    signal,
    onStderrLine,
    onMeta,
    onSegment,
    onAlignStart,
  } = opts;

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
  if (!align) args.push("--no-align");

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
              killTree(child);
              reject(
                new Error(
                  `WhisperX timed out after ${Math.round(
                    TRANSCRIBE_TIMEOUT_MS / 1000
                  )}s. Bump WHISPERX_TIMEOUT_MS in .env.local (0 to disable).`
                )
              );
            }, TRANSCRIBE_TIMEOUT_MS)
          : null;

      const abortHandler = () => {
        killTree(child);
        if (timeout) clearTimeout(timeout);
        reject(new Error("Transcription aborted"));
      };
      if (signal) {
        if (signal.aborted) abortHandler();
        else signal.addEventListener("abort", abortHandler, { once: true });
      }

      child.stderr.setEncoding("utf-8");
      child.stderr.on("data", (chunk: string) => {
        stderrBuf += chunk;
        for (const line of chunk.split(/\r?\n/)) {
          if (!line) continue;
          // Parse our marker protocol first.
          if (line.startsWith("TQG_META:")) {
            try {
              const meta = JSON.parse(line.slice("TQG_META:".length));
              onMeta?.(meta);
            } catch {}
            continue;
          }
          if (line.startsWith("TQG_SEGMENT:")) {
            try {
              const seg = JSON.parse(line.slice("TQG_SEGMENT:".length));
              onSegment?.(seg);
            } catch {}
            continue;
          }
          if (line === "TQG_ALIGN_START") {
            onAlignStart?.();
            continue;
          }
          if (line === "TQG_DONE") {
            continue;
          }
          onStderrLine?.(line);
        }
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (timeout) clearTimeout(timeout);
        if (signal) signal.removeEventListener("abort", abortHandler);
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
        if (signal) signal.removeEventListener("abort", abortHandler);
        if (signal?.aborted) return;
        resolve({ code: code ?? 1 });
      });
    });

    if (code !== 0) {
      let parsed: unknown = null;
      try {
        const raw = await readFile(outputPath, "utf-8");
        parsed = JSON.parse(raw);
      } catch {
        // output missing or unreadable
      }

      // If Python wrote a valid transcript before the non-zero exit, treat
      // it as success. This covers Windows STATUS_STACK_BUFFER_OVERRUN
      // (0xC0000409 / 3221226505) where CUDA crashes during interpreter
      // shutdown AFTER the segments have been decoded and the JSON written.
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as WhisperResult).segments) &&
        (parsed as WhisperResult).segments.length > 0
      ) {
        onStderrLine?.(
          `Note: WhisperX exited ${code} during shutdown, but transcript was ` +
            `written successfully before the crash. Treating as success.`
        );
        return parsed as WhisperResult;
      }

      let traceback: string | undefined;
      if (parsed && typeof parsed === "object" && "traceback" in parsed) {
        traceback = (parsed as { traceback?: string }).traceback;
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
