"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SurahPicker, useSurahs } from "@/components/SurahPicker";
import { AyahTools } from "@/components/AyahTools";

type Ayah = {
  verse_key: string;
  surah: number;
  ayah: number;
  text_uthmani: string;
  translation_en: string | null;
};

type FigureLite = {
  id: string;
  name_en: string;
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function QuranBrowser() {
  const [mode, setMode] = useState<"search" | "browse">("search");
  const [query, setQuery] = useState("");
  const [surah, setSurah] = useState<number>(1);
  const [results, setResults] = useState<Ayah[]>([]);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [quranImported, setQuranImported] = useState<boolean | null>(null);
  const [linkTarget, setLinkTarget] = useState<Ayah | null>(null);
  const surahs = useSurahs();
  const surahByNum = new Map(surahs.map((s) => [s.surah, s]));
  const debouncedQuery = useDebounced(query, 350);

  useEffect(() => {
    fetch("/api/quran/search?q=a&limit=1")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((j) => setQuranImported((j.results || []).length > 0))
      .catch(() => setQuranImported(false));
  }, []);

  const runSearch = useCallback(async () => {
    const q = debouncedQuery.trim();
    if (!q) {
      setResults([]);
      setEmpty(false);
      return;
    }
    setLoading(true);
    setEmpty(false);
    try {
      const res = await fetch(
        `/api/quran/search?q=${encodeURIComponent(q)}&limit=30`
      );
      const j = await res.json();
      const rows = (j.results || []) as Ayah[];
      setResults(rows);
      setEmpty(rows.length === 0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  const loadSurah = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quran/surah/${surah}`);
      const j = await res.json();
      const rows = (j.ayahs || []) as Ayah[];
      setResults(rows);
      setEmpty(rows.length === 0);
    } finally {
      setLoading(false);
    }
  }, [surah]);

  useEffect(() => {
    if (mode === "search") runSearch();
  }, [mode, runSearch]);

  useEffect(() => {
    if (mode === "browse") loadSurah();
  }, [mode, loadSurah]);

  if (quranImported === false) {
    return (
      <div className="rounded-lg bg-amber-500/[0.08] border border-amber-400/30 p-4 text-[13px] text-amber-100 leading-relaxed">
        <div className="font-medium mb-1">Quran data not imported</div>
        Run{" "}
        <code className="font-mono text-[11px] bg-black/30 px-1 rounded">
          node scripts/import-quran.mjs
        </code>{" "}
        to populate <code className="font-mono">quran_cache</code> before
        searching or browsing.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-white/[0.08] overflow-hidden">
          <button
            onClick={() => setMode("search")}
            className={cn(
              "px-3 py-1.5 text-[12px]",
              mode === "search"
                ? "bg-white/[0.08] text-white/90"
                : "text-white/55 hover:text-white/80"
            )}
          >
            Search
          </button>
          <button
            onClick={() => setMode("browse")}
            className={cn(
              "px-3 py-1.5 text-[12px] border-l border-white/[0.08]",
              mode === "browse"
                ? "bg-white/[0.08] text-white/90"
                : "text-white/55 hover:text-white/80"
            )}
          >
            Browse by surah
          </button>
        </div>
        {mode === "search" ? (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search English translation…"
            className="flex-1 bg-transparent border border-white/[0.08] rounded px-3 py-1.5 text-[13px] text-white/85 focus:outline-none focus:border-white/[0.2]"
          />
        ) : (
          <SurahPicker
            value={surah}
            onChange={setSurah}
            className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded px-3 py-1.5 text-[13px] text-white/85"
          />
        )}
      </div>

      {loading ? (
        <div className="text-[12px] text-white/45">Loading…</div>
      ) : empty ? (
        <div className="text-[12px] text-white/45">
          No ayahs match that query.
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map((a) => {
            const meta = surahByNum.get(a.surah);
            return (
              <li
                key={a.verse_key}
                className="p-3 rounded border border-white/[0.06] bg-white/[0.02]"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-primary-bright">
                      {a.verse_key}
                    </span>
                    {meta ? (
                      <span className="ml-2 text-[11px] text-white/55">
                        {meta.name_transliteration} · {meta.name_english}
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={() => setLinkTarget(a)}
                    className="px-2 py-0.5 rounded text-[11px] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.05]"
                  >
                    Link to figure
                  </button>
                </div>
                <div
                  dir="rtl"
                  className="text-[14px] text-white/90 leading-relaxed mb-1"
                >
                  {a.text_uthmani}
                </div>
                {a.translation_en ? (
                  <div className="text-[12px] text-white/60 leading-relaxed mb-2">
                    {a.translation_en}
                  </div>
                ) : null}
                <AyahTools surah={a.surah} ayah={a.ayah} />
              </li>
            );
          })}
        </ul>
      )}

      {linkTarget ? (
        <LinkToFigureModal
          ayah={linkTarget}
          onClose={() => setLinkTarget(null)}
        />
      ) : null}
    </div>
  );
}

function LinkToFigureModal({
  ayah,
  onClose,
}: {
  ayah: Ayah;
  onClose: () => void;
}) {
  const [figures, setFigures] = useState<FigureLite[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/figures")
      .then((r) => r.json())
      .then((j) => setFigures(j.figures || []));
  }, []);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await fetch(`/api/figures/${selected}/quran`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verse_key: ayah.verse_key,
        relevance_note: note || null,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMessage("Linked.");
      setTimeout(onClose, 800);
    } else {
      const j = await res.json().catch(() => ({}));
      setMessage(`Failed: ${j.error || res.status}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#111] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="text-[14px] font-semibold text-white/90">
            Link ayah {ayah.verse_key} to a figure
          </div>
          <div className="text-[11px] text-white/45 mt-0.5 line-clamp-2">
            {ayah.translation_en || ayah.text_uthmani}
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <label className="block">
            <span className="text-[11px] text-white/50">Figure</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1.5 text-[13px] text-white/85 [&>option]:bg-zinc-900 [&>option]:text-white/85"
            >
              <option value="">— choose —</option>
              {(figures || []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name_en}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-white/50">
              Relevance note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this ayah connects to the figure…"
              className="mt-1 w-full bg-transparent border border-white/[0.08] rounded px-2 py-1.5 text-[12px] text-white/85 min-h-[60px] focus:outline-none focus:border-white/[0.2]"
            />
          </label>
          {message ? (
            <div className="text-[12px] text-primary-bright">{message}</div>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              disabled={!selected || busy}
              className="flex-1 px-3 py-2 rounded-md text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
            >
              {busy ? "Linking…" : "Link"}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-md text-[12px] border border-white/[0.08] text-white/70 hover:text-white/90"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
