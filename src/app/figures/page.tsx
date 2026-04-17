"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";

type Figure = {
  id: string;
  name_en: string;
  name_ar: string | null;
  title: string | null;
  type: "sahabi" | "prophet" | "scholar" | "tabii";
  era: string | null;
  bio_short: string;
  themes: string[];
  quran_refs: string[];
  posts_written: number;
  last_posted_at: string | null;
  hadith_ref_count: number;
  quran_ref_count: number;
};

const TYPE_LABEL: Record<Figure["type"], string> = {
  sahabi: "Sahabi",
  prophet: "Prophet",
  scholar: "Scholar",
  tabii: "Tabi'i",
};

const TYPE_COLOR: Record<Figure["type"], string> = {
  sahabi: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  prophet: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  scholar: "bg-sky-500/15 text-sky-200 border-sky-400/30",
  tabii: "bg-violet-500/15 text-violet-200 border-violet-400/30",
};

export default function FiguresPage() {
  const [figures, setFigures] = useState<Figure[] | null>(null);
  const [filter, setFilter] = useState<"all" | Figure["type"]>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/figures")
      .then((r) => r.json())
      .then((j) => setFigures(j.figures || []))
      .catch(() => setFigures([]));
  }, []);

  const filtered = (figures || []).filter((f) => {
    if (filter !== "all" && f.type !== filter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (
        !f.name_en.toLowerCase().includes(q) &&
        !(f.name_ar || "").includes(query.trim()) &&
        !(f.title || "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <PageShell
      title="Islamic Figures"
      description="Sahabah, prophets, scholars, tabi'in — with linked hadith and Quran refs"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search figures…"
            className="flex-1 bg-transparent border border-white/[0.08] rounded px-3 py-1.5 text-[13px] text-white/85 focus:outline-none focus:border-white/[0.2]"
          />
          <div className="flex gap-1">
            {(["all", "sahabi", "prophet", "scholar", "tabii"] as const).map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] border transition-colors",
                    filter === t
                      ? "bg-white/[0.08] border-white/20 text-white/90"
                      : "bg-transparent border-white/[0.08] text-white/50 hover:text-white/80"
                  )}
                >
                  {t === "all" ? "All" : TYPE_LABEL[t]}
                </button>
              )
            )}
          </div>
        </div>

        {figures === null ? (
          <div className="text-[13px] text-white/40">Loading figures…</div>
        ) : filtered.length === 0 ? (
          <div className="text-[13px] text-white/40">No figures match.</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((f) => {
              const needsRefs =
                f.hadith_ref_count === 0 && f.quran_ref_count === 0;
              return (
                <li key={f.id}>
                  <Link
                    href={`/figures/${f.id}`}
                    className="block rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 hover:bg-white/[0.05] hover:border-white/[0.12] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-white/90 truncate">
                          {f.name_en}
                        </div>
                        {f.name_ar ? (
                          <div
                            dir="rtl"
                            className="text-[13px] text-white/60 mt-0.5"
                          >
                            {f.name_ar}
                          </div>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider shrink-0",
                          TYPE_COLOR[f.type]
                        )}
                      >
                        {TYPE_LABEL[f.type]}
                      </span>
                    </div>
                    {f.title ? (
                      <div className="text-[11px] text-white/50 mb-2">
                        {f.title}
                      </div>
                    ) : null}
                    <div className="text-[12px] text-white/65 line-clamp-2 leading-relaxed mb-3">
                      {f.bio_short}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-white/55 tabular-nums">
                      <span title="Linked hadith">
                        <span className="text-white/35">H</span> {f.hadith_ref_count}
                      </span>
                      <span title="Linked Quran ayahs">
                        <span className="text-white/35">Q</span> {f.quran_ref_count}
                      </span>
                      <span title="Posts written">
                        <span className="text-white/35">P</span> {f.posts_written}
                      </span>
                      {needsRefs ? (
                        <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-200 border border-amber-400/20">
                          needs refs
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
