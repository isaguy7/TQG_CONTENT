import { NextRequest } from "next/server";
import { downloadVideo, type YtDlpProgress, getMetadata } from "@/lib/ytdlp";
import { extractAudioForWhisper } from "@/lib/ffmpeg";
import { transcribe } from "@/lib/whisper";
import { fetchYoutubeCaptions } from "@/lib/captions";
import type { WhisperResult, WhisperSegment } from "@/lib/transcript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// No maxDuration — local Node server, not Vercel.

type Source = "youtube-auto" | "youtube-manual" | "whisperx";

type Event =
  | { phase: "start"; url: string }
  | { phase: "captions-try" }
  | {
      phase: "download";
      percent: number | null;
      speed: string | null;
      eta: string | null;
      stage: YtDlpProgress["stage"];
    }
  | { phase: "extract" }
  | {
      phase: "transcribe-meta";
      duration: number;
      language: string;
      model: string;
    }
  | { phase: "segment"; segment: WhisperSegment; progress: number }
  | { phase: "align" }
  | { phase: "transcribe"; line?: string }
  | {
      phase: "done";
      source: Source;
      transcript: WhisperResult;
      metadata: { title: string; duration: number | null; channel: string | null };
    }
  | { phase: "error"; message: string; stderrTail?: string; traceback?: string };

function encodeLine(ev: Event): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(ev) + "\n");
}

export async function POST(req: NextRequest) {
  let body: { url?: string; forceWhisper?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = body.url?.trim();
  const forceWhisper = Boolean(body.forceWhisper);
  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid 'url'" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: Event) => {
        try {
          controller.enqueue(encodeLine(ev));
        } catch {}
      };

      try {
        send({ phase: "start", url });

        // ============================================================
        // Tier 1: YouTube captions (fast path — 2-5s typical)
        // ============================================================
        if (!forceWhisper) {
          send({ phase: "captions-try" });
          const captions = await fetchYoutubeCaptions(url);
          if (captions) {
            let meta: { title: string; duration: number | null; channel: string | null } = {
              title: "video",
              duration: null,
              channel: null,
            };
            try {
              const info = await getMetadata(url);
              meta = {
                title: info.title,
                duration: info.duration,
                channel: info.channel,
              };
            } catch {}
            send({
              phase: "done",
              source: captions.source,
              transcript: captions,
              metadata: meta,
            });
            controller.close();
            return;
          }
        }

        // ============================================================
        // Tier 2: Full pipeline (yt-dlp → ffmpeg → WhisperX streaming)
        // ============================================================
        const { videoPath, metadata } = await downloadVideo({
          url,
          onProgress: (p) =>
            send({
              phase: "download",
              percent: p.percent,
              speed: p.speed,
              eta: p.eta,
              stage: p.stage,
            }),
        });

        send({ phase: "extract" });
        const audioPath = await extractAudioForWhisper(videoPath);

        send({ phase: "transcribe" });
        let totalDuration = 0;
        const result = await transcribe({
          audioPath,
          onMeta: (m) => {
            totalDuration = m.duration;
            send({
              phase: "transcribe-meta",
              duration: m.duration,
              language: m.language,
              model: m.model,
            });
          },
          onSegment: (seg) => {
            const progress =
              totalDuration > 0 ? Math.min(1, seg.end / totalDuration) : 0;
            send({ phase: "segment", segment: seg, progress });
          },
          onAlignStart: () => send({ phase: "align" }),
          onStderrLine: (line) => {
            if (
              /Loading model|Loading audio|Transcribing|Aligning|Done/i.test(line) ||
              /\d+%\s*\|/.test(line) ||
              /\d+(\.\d+)?\s*(MB|GB|KB)\/s/.test(line) ||
              /Downloading|Fetching|Resolving/i.test(line)
            ) {
              send({ phase: "transcribe", line });
            }
          },
        });

        send({
          phase: "done",
          source: "whisperx",
          transcript: result,
          metadata: {
            title: metadata.title,
            duration: metadata.duration,
            channel: metadata.channel,
          },
        });
      } catch (err) {
        const e = err as Error & {
          details?: { stderrTail?: string; traceback?: string };
        };
        send({
          phase: "error",
          message: e.message || "Unknown error",
          stderrTail: e.details?.stderrTail,
          traceback: e.details?.traceback,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
