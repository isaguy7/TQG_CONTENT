"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";
import { Plus, Film } from "lucide-react";

type Batch = {
  id: string;
  name: string;
  status: "preparing" | "rendering" | "done" | "error";
  created_at: string;
  clip_count: number;
};

type Stats = {
  total_clips: number;
  last_batch_at: string | null;
  batch_count: number;
};

const STATUS_TONE: Record<Batch["status"], string> = {
  preparing: "bg-white/[0.06] text-white/60 border-white/[0.1]",
  rendering: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  done: "bg-primary/15 text-primary-bright border-primary/30",
  error: "bg-danger/15 text-danger border-danger/30",
};

export default function ClipsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clips/batches")
      .then((r) => r.json())
      .then((j) => {
        setBatches(j.batches || []);
        setStats(j.stats || null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell
      title="Clips"
      description="Short-form Quran recitation clips for X, Reels, Facebook"
    >
      <div className="max-w-3xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/clips/new"
            className="group rounded-lg bg-primary/10 border border-primary/40 hover:bg-primary/20 hover:border-primary/60 p-5 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Plus className="w-4 h-4 text-primary-bright" />
              <div className="text-[14px] font-semibold text-white/95">
                New clip batch
              </div>
            </div>
            <div className="text-[12px] text-white/65 leading-relaxed">
              Drop a recitation, match ayahs, pick backgrounds, batch-render with NVENC.
            </div>
          </Link>

          <div className="rounded-lg bg-white/[0.04] border border-white/[0.08] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Film className="w-4 h-4 text-white/60" />
              <div className="text-[14px] font-semibold text-white/95">
                Stats
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-[18px] font-semibold text-white/95 tabular-nums">
                  {stats?.total_clips ?? 0}
                </div>
                <div className="text-[11px] text-white/50">Clips rendered</div>
              </div>
              <div>
                <div className="text-[18px] font-semibold text-white/95 tabular-nums">
                  {stats?.batch_count ?? 0}
                </div>
                <div className="text-[11px] text-white/50">Batches</div>
              </div>
            </div>
            {stats?.last_batch_at ? (
              <div className="text-[11px] text-white/40 mt-3 pt-3 border-t border-white/[0.05]">
                Last batch {formatDate(stats.last_batch_at)}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="section-label mb-2">Recent batches</div>
          {loading ? (
            <div className="text-[13px] text-white/40">Loading…</div>
          ) : batches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[13px] text-white/40">
              No batches yet. Create your first one above.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {batches.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-white/90 truncate">
                      {b.name}
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {b.clip_count} clip{b.clip_count === 1 ? "" : "s"} ·{" "}
                      {formatDate(b.created_at)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium border",
                      STATUS_TONE[b.status]
                    )}
                  >
                    {b.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5 text-[12px] text-white/60 space-y-1.5">
          <div className="section-label mb-2">Asset folders</div>
          <div>
            Set via <code className="font-mono text-[11px]">.env.local</code>:
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
