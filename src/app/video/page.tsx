import { PageShell } from "@/components/PageShell";
import { TranscribeWorkflow } from "@/components/TranscribeWorkflow";

function Prerequisites() {
  return (
    <div className="p-4 text-[11px] text-white/50 leading-relaxed">
      <div className="section-label mb-2">Pipeline</div>
      <ol className="space-y-1 list-decimal list-inside text-white/55 mb-4">
        <li>yt-dlp downloads up to 4K</li>
        <li>ffmpeg extracts 16 kHz WAV</li>
        <li>WhisperX large-v3 on GPU</li>
        <li>Word-level alignment (wav2vec2)</li>
      </ol>

      <div className="section-label mb-2">Requires</div>
      <ul className="space-y-1 list-disc list-inside text-white/55">
        <li>Python 3.10+ with whisperx, yt-dlp, faster-whisper</li>
        <li>CUDA 12.x + compatible PyTorch</li>
        <li>ffmpeg on PATH (or FFMPEG_BIN set)</li>
        <li>Downloads land in <code className="font-mono text-white/70">downloads/</code></li>
      </ul>

      <div className="section-label mt-4 mb-2">Tips</div>
      <ul className="space-y-1 list-disc list-inside text-white/55">
        <li>First run downloads the ~3GB large-v3 model.</li>
        <li>8GB VRAM: defaults are tuned for you. Bump batch/compute in .env.local for bigger cards.</li>
        <li>Short clips first if anything fails.</li>
      </ul>
    </div>
  );
}

export default function VideoPage() {
  return (
    <PageShell
      title="Video"
      description="Paste a URL → yt-dlp → ffmpeg → WhisperX on GPU"
      rightPanel={<Prerequisites />}
    >
      <div className="max-w-3xl">
        <TranscribeWorkflow />
      </div>
    </PageShell>
  );
}
