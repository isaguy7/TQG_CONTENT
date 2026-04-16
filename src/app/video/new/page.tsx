import { PageShell } from "@/components/PageShell";
import { TranscribeWorkflow } from "@/components/TranscribeWorkflow";

export default function NewVideoPage() {
  return (
    <PageShell
      title="New video project"
      description="Paste a URL → yt-dlp → ffmpeg → WhisperX large-v3 on your 4090"
    >
      <div className="max-w-3xl">
        <TranscribeWorkflow />
        <div className="mt-6 rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 text-[12px] text-white/50 leading-relaxed">
          <div className="section-label mb-2">Prerequisites</div>
          <ul className="space-y-1 list-disc list-inside">
            <li>
              Python 3.10+ with <code className="font-mono text-white/70">whisperx</code>,{" "}
              <code className="font-mono text-white/70">yt-dlp</code>, and{" "}
              <code className="font-mono text-white/70">faster-whisper</code> installed
              (<code className="font-mono text-white/70">pip install -r requirements.txt</code>).
            </li>
            <li>
              CUDA 12.x + compatible cuDNN + PyTorch with CUDA support.
            </li>
            <li>
              <code className="font-mono text-white/70">ffmpeg</code> and{" "}
              <code className="font-mono text-white/70">yt-dlp</code> on PATH, or set{" "}
              <code className="font-mono text-white/70">FFMPEG_BIN</code> /{" "}
              <code className="font-mono text-white/70">YTDLP_BIN</code> in{" "}
              <code className="font-mono text-white/70">.env.local</code>.
            </li>
            <li>
              Downloaded video + extracted audio land in{" "}
              <code className="font-mono text-white/70">downloads/</code>.
            </li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
