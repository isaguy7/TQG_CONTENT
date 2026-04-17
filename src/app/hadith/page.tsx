"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import {
  HadithPanel,
  HadithList,
  type HadithRecord,
} from "@/components/HadithPanel";

export default function HadithPage() {
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

  const handleSaveNotes = useCallback(
    async (h: HadithRecord, notes: string) => {
      try {
        await fetch(`/api/hadith/${h.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verification_notes: notes }),
        });
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refresh]
  );

  return (
    <PageShell
      title="Hadith references"
      description="Browse the local corpus and manage the references attached to your posts"
    >
      <div className="max-w-4xl space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Your references" value={String(hadith.length)} />
          <StatTile
            label="Corpus"
            value={corpusCount === null ? "—" : corpusCount.toLocaleString()}
            hint="Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah"
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
            <HadithList
              hadith={hadith}
              onDelete={handleDelete}
              onSaveNotes={handleSaveNotes}
            />
          )}
        </section>

        <section className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-4 text-[12px] text-white/55 leading-relaxed">
          <div className="section-label mb-2">How hadith work in TQG Studio</div>
          <p>
            Every reference links to sunnah.com so readers can follow the chain
            back to the original collection. The app never fabricates hadith
            numbers or translations — it only references what already exists in
            the corpus.
          </p>
        </section>
      </div>
    </PageShell>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/[0.08] p-4">
      <div className="section-label">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white/90">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-white/40">{hint}</div>
      ) : null}
    </div>
  );
}
