"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type CorpusRow = {
  id: string;
  collection: string;
  collection_name: string;
  hadith_number: number;
  narrator: string | null;
  english_text: string;
  arabic_text: string;
  sunnah_com_url: string | null;
};

type Ayah = {
  verse_key: string;
  surah: number;
  ayah: number;
  text_uthmani: string;
  translation_en: string | null;
};

type Props = {
  draft: string;
  figureName?: string | null;
  /** Called with the corpus row when the user wants to add it to verification queue. */
  onPickHadith: (row: CorpusRow) => void;
  onPickAyah: (ayah: Ayah) => void;
};

const STOPWORDS = new Set([
  "the","a","an","and","or","but","of","in","on","for","to","with","at","by",
  "is","are","was","were","be","been","being","has","have","had","do","did",
  "this","that","these","those","it","its","from","as","he","she","they",
  "them","his","her","their","we","our","you","your","my","me","i","about",
  "not","no","so","if","then","than","which","who","what","when","where",
  "why","how","all","some","any","more","most","less","least","also",
]);

function extractKeywords(text: string, extra: string[] = []): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  for (const e of extra) {
    if (e) freq.set(e.toLowerCase(), (freq.get(e.toLowerCase()) || 0) + 5);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AmbientSuggestions({
  draft,
  figureName,
  onPickHadith,
  onPickAyah,
}: Props) {
  const debouncedDraft = useDebounced(draft, 600);
  const [hadithHits, setHadithHits] = useState<CorpusRow[]>([]);
  const [quranHits, setQuranHits] = useState<Ayah[]>([]);
  const [loading, setLoading] = useState(false);
  const [quranAvailable, setQuranAvailable] = useState(true);

  const keywords = useMemo(() => {
    if (!debouncedDraft || debouncedDraft.trim().length < 40) return [];
    return extractKeywords(
      debouncedDraft,
      figureName ? [figureName.split(" ")[0]] : []
    );
  }, [debouncedDraft, figureName]);

  useEffect(() => {
    if (keywords.length === 0) {
      setHadithHits([]);
      setQuranHits([]);
      return;
    }
    const query = figureName
      ? `${figureName} ${keywords.join(" ")}`.trim()
      : keywords.join(" ");
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(
        `/api/hadith-corpus/search?q=${encodeURIComponent(query)}&limit=4`
      )
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .catch(() => ({ results: [] })),
      fetch(`/api/quran/search?q=${encodeURIComponent(keywords[0])}&limit=4`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .catch(() => ({ results: [] })),
    ])
      .then(([h, q]) => {
        if (cancelled) return;
        setHadithHits((h.results || []) as CorpusRow[]);
        const ayahs = (q.results || []) as Ayah[];
        setQuranHits(ayahs);
        if (ayahs.length === 0) {
          // If quran_cache is empty the endpoint always returns [] — show
          // nothing but don't flag the emptiness as a network error.
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keywords, figureName]);

  useEffect(() => {
    fetch("/api/quran/search?q=a&limit=1")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((j) => setQuranAvailable((j.results || []).length > 0))
      .catch(() => setQuranAvailable(false));
  }, []);

  if (keywords.length === 0) return null;
  if (!loading && hadithHits.length === 0 && quranHits.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-dashed border-white/[0.08] bg-white/[0.015] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          Suggestions · {keywords.join(" · ")}
        </span>
        {loading ? (
          <span className="text-[10px] text-white/30">searching…</span>
        ) : null}
      </div>

      {hadithHits.length > 0 ? (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5">
            Hadith matches
          </div>
          <ul className="space-y-1">
            {hadithHits.map((h) => (
              <li
                key={h.id}
                className="flex items-start gap-2 p-2 rounded border border-transparent hover:border-white/[0.06] hover:bg-white/[0.02]"
              >
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-primary-bright mt-0.5">
                  {h.collection} #{h.hadith_number}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-white/70 line-clamp-2 leading-relaxed">
                    {h.english_text}
                  </div>
                </div>
                <button
                  onClick={() => onPickHadith(h)}
                  className="shrink-0 px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/65 hover:text-white hover:bg-white/[0.05]"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {quranAvailable && quranHits.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5">
            Quran matches
          </div>
          <ul className="space-y-1">
            {quranHits.map((a) => (
              <li
                key={a.verse_key}
                className="flex items-start gap-2 p-2 rounded border border-transparent hover:border-white/[0.06] hover:bg-white/[0.02]"
              >
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-primary-bright mt-0.5">
                  {a.verse_key}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-[11px] leading-relaxed line-clamp-2",
                      a.translation_en ? "text-white/70" : "text-white/55"
                    )}
                  >
                    {a.translation_en || a.text_uthmani}
                  </div>
                </div>
                <button
                  onClick={() => onPickAyah(a)}
                  className="shrink-0 px-2 py-0.5 rounded text-[10px] border border-white/[0.08] text-white/65 hover:text-white hover:bg-white/[0.05]"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
