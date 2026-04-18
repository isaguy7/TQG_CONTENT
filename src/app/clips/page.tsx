"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";

type EnvInfo = {
  hosted: boolean;
  gpu: boolean;
  ffmpeg: boolean;
  ytdlp: boolean;
  mode: "cloud" | "local";
};

export default function ClipsPage() {
  const [env, setEnv] = useState<EnvInfo | null>(null);

  useEffect(() => {
    fetch("/api/environment", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setEnv(j))
      .catch(() => setEnv(null));
  }, []);

  const hosted = env?.hosted ?? false;

  return (
    <PageShell
      title="Clips"
      description="Short-form Quran recitation clips for X, Reels, Facebook"
    >
      <div className="max-w-2xl space-y-4">
        {hosted ? (
          <div className="rounded-lg bg-amber-500/[0.08] border border-amber-400/30 p-4 text-[13px] text-amber-100 leading-relaxed">
            <div className="font-medium mb-1">
              Clip rendering is local-only
            </div>
            <p className="text-amber-100/80 text-[12px]">
              This page needs ffmpeg + NVENC on the machine running the app.
              The hosted Vercel deployment doesn&apos;t have GPU access, so
              &quot;New clip batch&quot; will return 501 here. Run the Studio
              locally (<code className="font-mono">npm run dev</code>) to
              render clips.
            </p>
          </div>
        ) : null}

        <Link
          href="/clips/new"
          className="block rounded-lg bg-primary/[0.1] border border-primary/30 hover:bg-primary/[0.15] p-5 transition-colors"
        >
          <div className="text-[14px] font-semibold text-white/90">
            New clip batch →
          </div>
          <div className="text-[12px] text-white/60 mt-1">
            Drop a recitation, match ayahs, pick backgrounds, batch-render
            with NVENC.
          </div>
        </Link>

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5 text-[12px] text-white/60 space-y-1.5">
          <div>
            Assets folders (set via{" "}
            <code className="font-mono text-[11px]">.env.local</code>):
          </div>
          <div>
            · <code className="font-mono text-[11px]">RECITATIONS_DIR</code>{" "}
            — MP3/WAV audio
          </div>
          <div>
            · <code className="font-mono text-[11px]">BACKGROUNDS_DIR</code>{" "}
            — looping nature/Kaaba MP4s
          </div>
          <div>
            · <code className="font-mono text-[11px]">RENDERS_DIR</code> —
            where rendered MP4s land (1080×1080 for X, 1080×1920 for Reels)
          </div>
        </div>
      </div>
    </PageShell>
  );
}
