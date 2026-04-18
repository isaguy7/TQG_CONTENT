import { NextRequest } from "next/server";
import { downloadVideo, type YtDlpProgress, getMetadata } from "@/lib/ytdlp";
import { extractAudioForWhisper } from "@/lib/ffmpeg";
import { transcribe } from "@/lib/whisper";
import {
  fetchYoutubeCaptions,
  fetchYoutubeCaptionsHttp,
  extractYoutubeVideoId,
  CaptionsHttpError,
} from "@/lib/captions";
import type { WhisperResult, WhisperSegment } from "@/lib/transcript";
import { isHosted } from "@/lib/environment";

const DEBUG_TRANSCRIBE =
  process.env.TQG_TRANSCRIBE_DEBUG === "1" ||
  process.env.NODE_ENV !== "production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// No maxDuration — local Node server, not Vercel.

type Source = "youtube-auto" | "youtube-manual" | "whisperx";

type Event =
  | { phase: "start"; url: string }
  | { phase: "captions-try" }
  | { phase: "captions-not-found"; reason?: string }
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

function humaniseCaptionsError(err: CaptionsHttpError): string {
  switch (err.reason) {
    case "invalid_url":
      return "That URL doesn't look like a YouTube video. Use a watch URL (youtube.com/watch?v=…) or youtu.be short link.";
    case "watch_page_blocked":
      return `${err.message} Try a different video, or run the Studio locally.`;
    case "player_not_parsed":
      return err.message;
    case "no_tracks":
      return "This video has no captions at all. Try a video that has auto-subs or manual captions, or run the local Studio to transcribe with WhisperX.";
    case "language_not_found":
      return err.message;
    case "timedtext_blocked":
      return err.message;
    case "empty_timedtext":
      return "YouTube returned an empty caption track — likely a transient issue, try again.";
  }
}

export async function POST(req: NextRequest) {
  if (DEBUG_TRANSCRIBE) {
    console.log(
      `[transcribe] POST hit — isHosted=${isHosted()} VERCEL=${
        process.env.VERCEL ?? "unset"
      } VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`
    );
  }

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

  const hosted = isHosted();
  // On hosted (Vercel) we can still do YouTube captions via HTTP — only
  // WhisperX transcription requires the local GPU box. Reject anything that
  // would need ffmpeg / yt-dlp / GPU here.
  if (hosted) {
    if (forceWhisper) {
      return new Response(
        JSON.stringify({
          error:
            "WhisperX requires the local desktop app with GPU access. YouTube captions still work here.",
        }),
        { status: 501, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!extractYoutubeVideoId(url)) {
      return new Response(
        JSON.stringify({
          error:
            "Hosted mode can only fetch existing captions from YouTube URLs. For other sources, run the local Studio.",
        }),
        { status: 501, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const abortController = new AbortController();
  const { signal } = abortController;

  const onAbort = (source: string) => {
    console.log(`[transcribe] Abort received from ${source}; killing subprocesses`);
    abortController.abort();
  };

  req.signal.addEventListener("abort", () => onAbort("req.signal"), {
    once: true,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: Event) => {
        try {
          controller.enqueue(encodeLine(ev));
        } catch {}
      };

      try {
        send({ phase: "start", url });

        if (!forceWhisper) {
          send({ phase: "captions-try" });
          if (DEBUG_TRANSCRIBE) console.log(`[transcribe] captions-try url=${url}`);

          let captionsMeta: {
            title: string;
            duration: number | null;
            channel: string | null;
          } | null = null;
          let captions: WhisperResult & { source: Source } | null = null;

          if (hosted) {
            // Vercel path — HTTP-only YouTube captions.
            console.log(
              `[transcribe] hosted path videoId=${extractYoutubeVideoId(url)} url=${url}`
            );
            try {
              const httpCaps = await fetchYoutubeCaptionsHttp(url, "en", signal);
              captions = httpCaps;
              captionsMeta = {
                title: httpCaps.title || "YouTube video",
                duration: null,
                channel: httpCaps.channel,
              };
              console.log(
                `[transcribe] hosted captions ok: ${httpCaps.source} ${httpCaps.segments.length} segs`
              );
            } catch (err) {
              if (err instanceof CaptionsHttpError) {
                console.error(
                  `[transcribe] hosted captions failed reason=${err.reason} msg=${err.message}`
                );
                send({
                  phase: "error",
                  message: humaniseCaptionsError(err),
                });
                return;
              }
              throw err;
            }
          } else {
            // Local path — yt-dlp can handle YouTube and other sources.
            captions = await fetchYoutubeCaptions(url, "en", signal);
          }

          if (DEBUG_TRANSCRIBE) {
            console.log(
              `[transcribe] captions result: ${
                captions ? `${captions.source} (${captions.segments.length} segs)` : "none"
              }`
            );
          }
          if (signal.aborted) return;
          if (captions) {
            if (!captionsMeta) {
              captionsMeta = {
                title: "video",
                duration: null,
                channel: null,
              };
              try {
                const info = await getMetadata(url, signal);
                captionsMeta = {
                  title: info.title,
                  duration: info.duration,
                  channel: info.channel,
                };
              } catch {}
            }
            if (signal.aborted) return;
            send({
              phase: "done",
              source: captions.source,
              transcript: captions,
              metadata: captionsMeta,
            });
            return;
          }

          if (hosted) {
            // On Vercel we can't fall through to WhisperX — surface a clear
            // error rather than offering a GPU retry that will 501.
            send({
              phase: "error",
              message:
                "YouTube has no English captions for this video. Run the local Studio to transcribe with WhisperX.",
            });
            return;
          }

          // Captions not available locally — surface to the client and stop.
          // Client shows a 'Try WhisperX (GPU)?' prompt and resubmits with
          // forceWhisper=true if the user agrees.
          send({
            phase: "captions-not-found",
            reason: "yt-dlp returned no English captions for this URL",
          });
          return;
        }

        const { videoPath, metadata } = await downloadVideo({
          url,
          signal,
          onProgress: (p) =>
            send({
              phase: "download",
              percent: p.percent,
              speed: p.speed,
              eta: p.eta,
              stage: p.stage,
            }),
        });
        if (signal.aborted) return;

        send({ phase: "extract" });
        const audioPath = await extractAudioForWhisper(videoPath, undefined, signal);
        if (signal.aborted) return;

        send({ phase: "transcribe" });
        let totalDuration = 0;
        const result = await transcribe({
          audioPath,
          signal,
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
        if (signal.aborted) return;

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
        // Swallow aborted errors — the client already knows they cancelled.
        if (signal.aborted) return;
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
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      onAbort("ReadableStream.cancel");
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
