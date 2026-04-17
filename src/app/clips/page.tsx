import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export default function ClipsPage() {
  return (
    <PageShell
      title="Clips"
      description="Short-form Quran recitation clips for X, Reels, Facebook"
    >
      <div className="max-w-2xl space-y-4">
        <Link
          href="/clips/new"
          className="block rounded-lg bg-primary/[0.1] border border-primary/30 hover:bg-primary/[0.15] p-5 transition-colors"
        >
          <div className="text-[14px] font-semibold text-white/90">
            New clip batch →
          </div>
          <div className="text-[12px] text-white/60 mt-1">
            Drop a recitation, match ayahs, pick backgrounds, batch-render with
            NVENC.
          </div>
        </Link>

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5 text-[12px] text-white/60 space-y-1.5">
          <div>
            Assets folders (set via <code className="font-mono text-[11px]">.env.local</code>):
          </div>
          <div>
            · <code className="font-mono text-[11px]">RECITATIONS_DIR</code> — MP3/WAV audio
          </div>
          <div>
            · <code className="font-mono text-[11px]">BACKGROUNDS_DIR</code> — looping nature/Kaaba MP4s
          </div>
          <div>
            · <code className="font-mono text-[11px]">RENDERS_DIR</code> — where 1080x1080 MP4s land
          </div>
        </div>
      </div>
    </PageShell>
  );
}
