"use client";

import { useEffect, useState } from "react";

export type FigureLite = {
  id: string;
  name_en: string;
  name_ar: string | null;
  title: string | null;
  type: "sahabi" | "prophet" | "scholar" | "tabii";
  hadith_ref_count?: number;
  quran_ref_count?: number;
};

let cache: FigureLite[] | null = null;

const TYPE_LABEL: Record<FigureLite["type"], string> = {
  sahabi: "Sahabi",
  prophet: "Prophet",
  scholar: "Scholar",
  tabii: "Tabi'i",
};

export function FigurePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (figureId: string | null) => void;
}) {
  const [figures, setFigures] = useState<FigureLite[]>(cache || []);

  useEffect(() => {
    if (cache) return;
    fetch("/api/figures")
      .then((r) => r.json())
      .then((j) => {
        cache = (j.figures || []) as FigureLite[];
        setFigures(cache);
      })
      .catch(() => setFigures([]));
  }, []);

  const current = figures.find((f) => f.id === value) || null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] uppercase tracking-wider text-white/40">
        Figure
      </label>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-[12px] text-white/85"
      >
        <option value="">— no figure —</option>
        {figures.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name_en} · {TYPE_LABEL[f.type]}
            {typeof f.quran_ref_count === "number" ||
            typeof f.hadith_ref_count === "number"
              ? ` (${f.quran_ref_count ?? 0}Q · ${f.hadith_ref_count ?? 0}H)`
              : ""}
          </option>
        ))}
      </select>
      {current ? (
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.05] text-white/60">
          {TYPE_LABEL[current.type]}
        </span>
      ) : null}
    </div>
  );
}
