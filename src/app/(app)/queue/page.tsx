"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  PlayCircle,
  Server,
  XCircle,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";

type BatchResult = { output: string; ok: boolean; error?: string };

type Batch = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  processed_at?: string | null;
  results?: BatchResult[] | null;
  error?: string | null;
};

export default function QueuePage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processMsg, setProcessMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clips/queue");
      const j = await res.json();
      setBatches(j.batches || []);
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const processQueue = async () => {
    setProcessing(true);
    setProcessMsg(null);
    try {
      const res = await fetch("/api/clips/queue/process", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setProcessMsg(j.error || `HTTP ${res.status}`);
      } else {
        setProcessMsg(`Processed ${j.processed} batch(es).`);
      }
    } catch (err) {
      setProcessMsg((err as Error).message);
    } finally {
      setProcessing(false);
      load();
    }
  };

  const queuedCount = batches.filter((b) => b.status === "queued").length;

  return (
    <PageShell
      title="Render queue"
      description="Trigger renders locally for jobs queued from hosted sessions"
      actions={
        <>
          <Link
            href="/clips/new"
            className="px-3 py-1.5 rounded-lg text-[12px] border border-white/[0.1] text-white/75 hover:text-white hover:bg-white/[0.05]"
          >
            New batch
          </Link>
          <button
            onClick={processQueue}
            disabled={processing}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50"
          >
            {processing ? "Processing…" : "Process queue"}
          </button>
        </>
      }
    >
      <div className="max-w-4xl space-y-4">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] backdrop-blur-md p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-emerald-100">
            <Server className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-white/85">
              Run this locally to consume queued renders from Vercel.
            </div>
            <div className="text-[12px] text-white/55">
              Queued: {queuedCount} · Completed:{" "}
              {batches.filter((b) => b.status === "completed").length}
            </div>
          </div>
          <div className="text-[11px] text-white/50">
            Need assets? Configure <code>RECITATIONS_DIR</code> and{" "}
            <code>BACKGROUNDS_DIR</code>.
          </div>
        </div>

        {processMsg ? (
          <div className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-[12px] text-white/75">
            {processMsg}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] p-6 text-center text-white/70">
            <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />
            Loading queue…
          </div>
        ) : batches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.03] p-6 text-center">
            <div className="text-[13px] text-white/80">
              No jobs yet. Queue a batch from the hosted studio to see it here.
            </div>
            <div className="text-[12px] text-white/50">
              Use &ldquo;Add to render queue&rdquo; on Vercel, then process
              locally.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {batches.map((b) => {
              const success = b.status === "completed";
              const queued = b.status === "queued";
              return (
                <div
                  key={b.id}
                  className={cn(
                    "rounded-2xl border p-4 backdrop-blur-md transition-colors",
                    queued
                      ? "border-white/[0.12] bg-white/[0.05]"
                      : success
                        ? "border-emerald-400/40 bg-emerald-500/5"
                        : "border-danger/40 bg-danger/10"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-semibold text-white/85 truncate">
                      {b.name}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]",
                        queued
                          ? "bg-white/10 text-white/70"
                          : success
                            ? "bg-emerald-500/15 text-emerald-100"
                            : "bg-danger/20 text-danger"
                      )}
                    >
                      {queued ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : success ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {b.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/50 mt-1">
                    Created {new Date(b.created_at).toLocaleString()}
                    {b.processed_at
                      ? ` · Processed ${new Date(
                          b.processed_at
                        ).toLocaleString()}`
                      : ""}
                  </div>

                  {b.results && b.results.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {b.results.map((r, i) => (
                        <li
                          key={`${b.id}-${i}`}
                          className={cn(
                            "text-[11px] px-2 py-1 rounded border",
                            r.ok
                              ? "border-emerald-400/40 text-emerald-100 bg-emerald-500/10"
                              : "border-danger/40 text-danger bg-danger/10"
                          )}
                        >
                          {r.ok ? "✓" : "×"} {r.output}
                          {r.error ? ` — ${r.error}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {b.error ? (
                    <div className="mt-2 text-[11px] text-danger">
                      {b.error}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
