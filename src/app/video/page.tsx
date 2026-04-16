import { PageShell } from "@/components/PageShell";
import Link from "next/link";

export default function VideoPage() {
  return (
    <PageShell
      title="Video projects"
      description="Download, transcribe, overlay Arabic text"
    >
      <div className="max-w-3xl space-y-4">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-6">
          <div className="section-label mb-2">Phase 1 · ready</div>
          <p className="text-[13px] text-white/75 leading-relaxed mb-4">
            Paste a URL (YouTube, X, Instagram, most platforms). yt-dlp
            downloads up to 4K, ffmpeg extracts audio, WhisperX large-v3
            transcribes on your 4090 with word-level timestamps.
          </p>
          <Link
            href="/video/new"
            className="inline-block px-4 py-2 rounded-md text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            New project
          </Link>
        </div>
        <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-6 text-[12px] text-white/40">
          Project list lands in Phase 2 once the Supabase persistence layer is
          wired. For now each transcription is a one-shot session.
        </div>
      </div>
    </PageShell>
  );
}
