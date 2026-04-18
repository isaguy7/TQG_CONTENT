"use client";

import { useCallback, useEffect, useState } from "react";
import { SurahPicker, useSurahs } from "@/components/SurahPicker";
import { AyahTools } from "@/components/AyahTools";
import { cn } from "@/lib/utils";

type Ayah = {
  verse_key: string;
  surah: number;
  ayah: number;
  text_uthmani: string;
  translation_en: string | null;
};

/**
 * Single-ayah tafsir lookup. Pick a surah + ayah; the viewer renders the
 * ayah itself, then the Ibn Kathir / Jalalayn tafsir via AyahTools (which
 * fetches through /api/quran/tafsir and caches in tafsir_cache).
 */
export function TafsirBrowser() {
  const [surah, setSurah] = useState<number>(1);
  const [ayah, setAyah] = useState<number>(1);
  const [data, setData] = useState<Ayah | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quranImported, setQuranImported] = useState<boolean | null>(null);
  const surahs = useSurahs();
  const surahMeta = surahs.find((s) => s.surah === surah) || null;
  const maxAyah = surahMeta?.ayah_count ?? null;

  useEffect(() => {
    fetch("/api/quran/search?q=a&limit=1")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((j) => setQuranImported((j.results || []).length > 0))
      .catch(() => setQuranImported(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sRes = await fetch(`/api/quran/surah/${surah}`);
      if (!sRes.ok) {
        setError(`Surah ${surah} not available`);
        setData(null);
        return;
      }
      const sJson = await sRes.json();
      const rows = (sJson.ayahs || []) as Ayah[];
      const match = rows.find((r) => r.ayah === ayah) || null;
      setData(match);
      if (!match) setError(`Ayah ${surah}:${ayah} not found`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [surah, ayah]);

  useEffect(() => {
    if (quranImported) load();
  }, [quranImported, load]);

  if (quranImported === false) {
    return (
      <div className="rounded-lg bg-amber-500/[0.08] border border-amber-400/30 p-4 text-[13px] text-amber-100 leading-relaxed">
        <div className="font-medium mb-1">Quran data not imported</div>
        Run{" "}
        <code className="font-mono text-[11px] bg-black/30 px-1 rounded">
          node scripts/import-quran.mjs
        </code>{" "}
        to populate <code className="font-mono">quran_cache</code>, then
        tafsir lookups will resolve the ayah text automatically.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 flex flex-wrap items-center gap-2">
        <SurahPicker
          value={surah}
          onChange={(n) => {
            setSurah(n);
            setAyah(1);
          }}
          className="flex-1 min-w-[220px] bg-white/[0.03] border border-white/[0.08] rounded px-3 py-1.5 text-[13px] text-white/85"
        />
        <label className="flex items-center gap-2 text-[12px] text-white/60">
          Ayah
          <input
            type="number"
            min={1}
            max={maxAyah ?? undefined}
            value={ayah}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n) || n < 1) return;
              setAyah(n);
            }}
            className="w-20 bg-transparent border border-white/[0.08] rounded px-2 py-1 text-[13px] text-white/85 tabular-nums focus:outline-none focus:border-white/[0.2]"
          />
          {maxAyah ? (
            <span className="text-white/40 text-[11px]">of {maxAyah}</span>
          ) : null}
        </label>
      </div>

      {loading ? (
        <div className="text-[12px] text-white/45">Loading…</div>
      ) : error ? (
        <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-3 text-[12px] text-danger">
          {error}
        </div>
      ) : data ? (
        <div className="p-4 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider text-primary-bright">
              {data.verse_key}
            </span>
            {surahMeta ? (
              <span className="text-[11px] text-white/55">
                {surahMeta.name_transliteration} · {surahMeta.name_english}
              </span>
            ) : null}
          </div>
          <div
            dir="rtl"
            className="text-[16px] text-white/90 leading-loose mb-2"
          >
            {data.text_uthmani}
          </div>
          {data.translation_en ? (
            <div className="text-[13px] text-white/65 leading-relaxed mb-3">
              {data.translation_en}
            </div>
          ) : null}
          <AyahTools surah={data.surah} ayah={data.ayah} />
        </div>
      ) : (
        <div className="text-[12px] text-white/40">
          Pick a surah and ayah to read its tafsir.
        </div>
      )}

      <div className={cn("text-[11px] text-white/40")}>
        Tafsir sources: Ibn Kathir + Jalalayn (via
        cdn.jsdelivr.net/spa5k/tafsir_api, cached locally in{" "}
        <code className="font-mono">tafsir_cache</code>).
      </div>
    </div>
  );
}
