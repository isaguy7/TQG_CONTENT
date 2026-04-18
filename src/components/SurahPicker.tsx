"use client";

import { useEffect, useState } from "react";

export type SurahMeta = {
  surah: number;
  name_arabic: string;
  name_english: string;
  name_transliteration: string;
  revelation_place: string | null;
  ayah_count: number;
};

let cachedSurahs: SurahMeta[] | null = null;
let inflight: Promise<SurahMeta[]> | null = null;

export async function loadSurahs(): Promise<SurahMeta[]> {
  if (cachedSurahs) return cachedSurahs;
  if (inflight) return inflight;
  inflight = fetch("/api/quran/surahs")
    .then((r) => (r.ok ? r.json() : { surahs: [] }))
    .then((j) => {
      cachedSurahs = (j.surahs || []) as SurahMeta[];
      return cachedSurahs;
    })
    .catch(() => {
      cachedSurahs = [];
      return cachedSurahs;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function formatSurahOption(s: SurahMeta): string {
  return `${s.surah}. ${s.name_transliteration} (${s.name_english}) · ${s.ayah_count} ayahs`;
}

export function useSurahs(): SurahMeta[] {
  const [surahs, setSurahs] = useState<SurahMeta[]>(cachedSurahs || []);
  useEffect(() => {
    if (cachedSurahs) {
      setSurahs(cachedSurahs);
      return;
    }
    loadSurahs().then(setSurahs);
  }, []);
  return surahs;
}

export function SurahPicker({
  value,
  onChange,
  className,
  includeEmpty,
}: {
  value: number;
  onChange: (surah: number) => void;
  className?: string;
  includeEmpty?: boolean;
}) {
  const surahs = useSurahs();
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={
        className ||
        "bg-white/[0.03] border border-white/[0.08] rounded px-3 py-1.5 text-[13px] text-white/85"
      }
    >
      {includeEmpty ? <option value={0}>— choose a surah —</option> : null}
      {surahs.length === 0
        ? Array.from({ length: 114 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Surah {n}
            </option>
          ))
        : surahs.map((s) => (
            <option key={s.surah} value={s.surah}>
              {formatSurahOption(s)}
            </option>
          ))}
    </select>
  );
}
