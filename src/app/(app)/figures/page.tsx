"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SafeList, ListSkeleton } from "@/components/shared/SafeList";
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

// Type-keyed 4px left border on each card. Using raw rgba so the class
// survives Tailwind's tree-shaker without needing arbitrary values on
// border-* that would be harder to tweak later.
const TYPE_BORDER: Record<Figure["type"], string> = {
  sahabi: "#10b981", // emerald-500
  prophet: "#f59e0b", // amber-500
  scholar: "#0ea5e9", // sky-500
  tabii: "#8b5cf6", // violet-500
};

const TYPE_HEADER_GRADIENT: Record<Figure["type"], string> = {
  sahabi:
    "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, transparent 70%)",
  prophet:
    "linear-gradient(135deg, rgba(245,158,11,0.12) 0%, transparent 70%)",
  scholar:
    "linear-gradient(135deg, rgba(14,165,233,0.12) 0%, transparent 70%)",
  tabii:
    "linear-gradient(135deg, rgba(139,92,246,0.12) 0%, transparent 70%)",
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
          <ListSkeleton />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <SafeList
              data={filtered}
              empty={
                <li className="col-span-full text-[13px] text-white/40">
                  No figures match.
                </li>
              }
              keyFn={(f) => f.id}
            >
              {(f) => {
                const needsRefs =
                  f.hadith_ref_count === 0 && f.quran_ref_count === 0;
                return (
                  <li key={f.id}>
                  <Link
                    href={`/figures/${f.id}`}
                    className="card-interactive block rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden shadow-lg shadow-black/10"
                    style={{
                      borderLeft: `4px solid ${TYPE_BORDER[f.type]}`,
                    }}
                  >
                    <div
                      className="p-4"
                      style={{ background: TYPE_HEADER_GRADIENT[f.type] }}
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
                      <div className="text-[12px] text-white/65 line-clamp-2 leading-relaxed">
                        {f.bio_short}
                      </div>
                    </div>
                    <div className="px-4 pb-4 pt-3 border-t border-white/[0.05] flex items-center gap-2 flex-wrap">
                      {needsRefs ? (
                        <span className="text-[11px] text-white/35 italic">
                          No references yet
                        </span>
                      ) : (
                        <>
                          {f.quran_ref_count > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.06] text-[11px] tabular-nums">
                              <span className="text-white/95 font-semibold">
                                {f.quran_ref_count}
                              </span>
                              <span className="text-white/55">Quran</span>
                            </span>
                          ) : null}
                          {f.hadith_ref_count > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.06] text-[11px] tabular-nums">
                              <span className="text-white/95 font-semibold">
                                {f.hadith_ref_count}
                              </span>
                              <span className="text-white/55">Hadith</span>
                            </span>
                          ) : null}
                        </>
                      )}
                      {f.posts_written > 0 ? (
                        <span className="ml-auto text-[11px] text-white/55">
                          {f.posts_written} post
                          {f.posts_written === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
                );
              }}
            </SafeList>
          </ul>
        )}
      </div>
    </PageShell>
  );
}
