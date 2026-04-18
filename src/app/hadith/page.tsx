"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  HadithPanel,
  HadithList,
  type HadithRecord,
} from "@/components/HadithPanel";
import { QuranBrowser } from "@/components/QuranBrowser";
import { cn } from "@/lib/utils";

export default function HadithPage() {
  const [tab, setTab] = useState<"hadith" | "quran">("hadith");
  const [hadith, setHadith] = useState<HadithRecord[]>([]);
  const [corpusCount, setCorpusCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/hadith");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { hadith } = (await res.json()) as { hadith: HadithRecord[] };
      setHadith(hadith);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    (async () => {
      try {
        const res = await fetch("/api/hadith-corpus/search?limit=0");
        if (!res.ok) return;
        const json = (await res.json()) as { total: number };
        setCorpusCount(json.total);
      } catch {
        // corpus count is informational — silent failure is fine
      }
    })();
  }, [refresh]);

  const handleDelete = useCallback(
    async (h: HadithRecord) => {
      if (!confirm(`Delete "${h.reference_text}"? This removes the row entirely.`))
        return;
      try {
        const res = await fetch(`/api/hadith/${h.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh]
  );

  return (
    <PageShell
      title="References"
      description="Hadith verification + Quran browsing"
    >
      <div className="max-w-4xl">
        <div className="flex items-center gap-1 border-b border-white/[0.06] mb-5">
          <button
            onClick={() => setTab("hadith")}
            className={cn(
              "px-4 py-2 text-[13px] border-b-2 -mb-px transition-colors",
              tab === "hadith"
                ? "border-primary-bright text-white/90"
                : "border-transparent text-white/50 hover:text-white/80"
            )}
          >
            Hadith
          </button>
          <button
            onClick={() => setTab("quran")}
            className={cn(
              "px-4 py-2 text-[13px] border-b-2 -mb-px transition-colors",
              tab === "quran"
                ? "border-primary-bright text-white/90"
                : "border-transparent text-white/50 hover:text-white/80"
            )}
          >
            Quran
          </button>
        </div>
      </div>

      {tab === "quran" ? (
        <div className="max-w-4xl">
          <QuranBrowser />
        </div>
      ) : (
      <div className="max-w-4xl space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Total" value={String(hadith.length)} />
          <StatTile
            label="Corpus"
            value={corpusCount === null ? "—" : corpusCount.toLocaleString()}
          />
        </div>

        <section>
          <div className="section-label mb-2">Add reference</div>
          <HadithPanel onAdded={() => refresh()} />
        </section>

        <section>
          <div className="section-label mb-2">
            References ({hadith.length})
          </div>
          {loading ? (
            <div className="text-[13px] text-white/40">Loading…</div>
          ) : error ? (
            <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
              {error}
            </div>
          ) : (
            <HadithList hadith={hadith} onDelete={handleDelete} />
          )}
        </section>
      </div>
      )}
    </PageShell>
  );
}

function StatTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="section-label">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white/85">
        {value}
      </div>
    </div>
  );
}
