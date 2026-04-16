import { NextRequest } from "next/server";
import { downloadVideo, type YtDlpProgress } from "@/lib/ytdlp";
import { extractAudioForWhisper } from "@/lib/ffmpeg";
import { transcribe } from "@/lib/whisper";
import type { WhisperResult } from "@/lib/transcript";

// This route spawns yt-dlp + ffmpeg + WhisperX. It must never run on the
// edge runtime. It also needs the full Node request lifetime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900; // 15 minutes

type Event =
  | { phase: "start"; url: string }
  | {
      phase: "download";
      percent: number | null;
      speed: string | null;
      eta: string | null;
      stage: YtDlpProgress["stage"];
    }
  | { phase: "extract" }
  | { phase: "transcribe"; line?: string }
  | {
      phase: "done";
      transcript: WhisperResult;
      metadata: { title: string; duration: number | null; channel: string | null };
      videoPath: string;
      audioPath: string;
    }
  | { phase: "error"; message: string; stderrTail?: string };

function encodeLine(ev: Event): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(ev) + "\n");
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = body.url?.trim();
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
        } catch {
          // Client disconnected.
        }
      };

      try {
        send({ phase: "start", url });

        // 1. Download video
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

        // 2. Extract audio
        send({ phase: "extract" });
        const audioPath = await extractAudioForWhisper(videoPath);

        // 3. Transcribe
        send({ phase: "transcribe" });
        const result = await transcribe({
          audioPath,
          onStderrLine: (line) => {
            // Surface high-signal WhisperX progress lines.
            if (
              /Loading model|Loading audio|Transcribing|Aligning|Done/i.test(line)
            ) {
              send({ phase: "transcribe", line });
            }
          },
        });

        send({
          phase: "done",
          transcript: result,
          metadata: {
            title: metadata.title,
            duration: metadata.duration,
            channel: metadata.channel,
          },
          videoPath,
          audioPath,
        });
      } catch (err) {
        const e = err as Error & { details?: { stderrTail?: string } };
        send({
          phase: "error",
          message: e.message || "Unknown error",
          stderrTail: e.details?.stderrTail,
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
