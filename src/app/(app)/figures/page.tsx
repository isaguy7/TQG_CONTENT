"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { ListSkeleton } from "@/components/shared/SafeList";
import { cn } from "@/lib/utils";
import type { FigureType, IslamicFigureWithCounts } from "@/types/figure";

type TypeFilter = "all" | FigureType;
type SortKey = "name" | "posts" | "recent";

const TYPE_LABEL: Record<FigureType, string> = {
  sahabi: "Sahabi",
  prophet: "Prophet",
  scholar: "Scholar",
  tabii: "Tabi'i",
};

// Plural forms for the filter chips (15 sahabah reads better than
// 15 sahabi). Chip counts only — body text uses TYPE_LABEL.
const TYPE_PLURAL: Record<FigureType, string> = {
  sahabi: "Sahabah",
  prophet: "Prophets",
  scholar: "Scholars",
  tabii: "Tabi'in",
};

const TYPE_PILL: Record<FigureType, string> = {
  sahabi: "bg-green-500/10 text-green-400 border-green-500/20",
  prophet: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  scholar: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  tabii: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const SORT_LABEL: Record<SortKey, string> = {
  name: "Name (A–Z)",
  posts: "Most posts",
  recent: "Recently added",
};

export default function FiguresPage() {
  const [figures, setFigures] = useState<IslamicFigureWithCounts[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    fetch("/api/figures")
      .then((r) => r.json())
      .then((j) => setFigures((j.figures as IslamicFigureWithCounts[]) || []))
      .catch(() => setFigures([]));
  }, []);

  // Counts per type — always computed from the full (pre-filter) set so
  // chip labels stay stable as the user narrows the view.
  const typeCounts = useMemo(() => {
    const out: Record<TypeFilter, number> = {
      all: 0,
      sahabi: 0,
      prophet: 0,
      scholar: 0,
      tabii: 0,
    };
    if (!figures) return out;
    out.all = figures.length;
    for (const f of figures) out[f.type] += 1;
    return out;
  }, [figures]);

  const filtered = useMemo(() => {
    if (!figures) return [];
    const q = deferredQuery.trim().toLowerCase();
    const qRaw = deferredQuery.trim();
    const list = figures.filter((f) => {
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (!q) return true;
      if (f.name_en.toLowerCase().includes(q)) return true;
      if ((f.name_ar ?? "").includes(qRaw)) return true;
      if ((f.title ?? "").toLowerCase().includes(q)) return true;
      if (f.themes.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
    const sorted = [...list];
    if (sort === "name") {
      sorted.sort((a, b) => a.name_en.localeCompare(b.name_en));
    } else if (sort === "posts") {
      sorted.sort((a, b) => b.post_count - a.post_count);
    } else if (sort === "recent") {
      sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return sorted;
  }, [figures, deferredQuery, typeFilter, sort]);

  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
  };

  const anyFiltersActive = typeFilter !== "all" || query.trim().length > 0;

  return (
    <PageShell
      title="Islamic Figures"
      description="Sahabah, prophets, scholars, tabi'in — browse and search"
      actions={
        <Link
          href="/figures/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-[#1B5E20] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#154d19] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add figure
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Search + sort */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search figures by name or theme…"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-1.5 pl-9 pr-3 text-[13px] text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#1B5E20] focus:border-[#1B5E20]"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-zinc-400 sm:ml-auto">
            <span className="hidden sm:inline">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[12px] text-white focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Type chips with counts */}
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeChip
            active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
            label={`All (${typeCounts.all})`}
          />
          {(["sahabi", "prophet", "scholar", "tabii"] as const).map((t) =>
            typeCounts[t] > 0 ? (
              <TypeChip
                key={t}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                label={`${TYPE_PLURAL[t]} (${typeCounts[t]})`}
              />
            ) : null
          )}
        </div>

        {/* Cards */}
        {figures === null ? (
          <ListSkeleton />
        ) : filtered.length === 0 && anyFiltersActive ? (
          <div className="py-12 text-center">
            <p className="text-[13px] text-zinc-400">
              No figures match your filters.
            </p>
            <button
              onClick={clearFilters}
              className="mt-2 text-[12px] text-[#4CAF50] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : figures.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-zinc-500">
            No figures yet. Click <span className="text-white/80">Add figure</span> to seed the library.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((f) => (
              <li key={f.id}>
                <FigureCard figure={f} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

function TypeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
        active
          ? "bg-[#1B5E20] border-[#1B5E20] text-white"
          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
      )}
    >
      {label}
    </button>
  );
}

function FigureCard({ figure: f }: { figure: IslamicFigureWithCounts }) {
  const themesShown = f.themes.slice(0, 3);
  const themesExtra = f.themes.length - themesShown.length;

  return (
    <Link
      href={`/figures/${f.slug}`}
      className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{f.name_en}</div>
          {f.name_ar ? (
            <div
              dir="rtl"
              className="mt-0.5 text-sm text-zinc-400 truncate"
            >
              {f.name_ar}
            </div>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
            TYPE_PILL[f.type]
          )}
        >
          {TYPE_LABEL[f.type]}
        </span>
      </div>

      {themesShown.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {themesShown.map((theme) => (
            <span
              key={theme}
              className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
            >
              {theme}
            </span>
          ))}
          {themesExtra > 0 ? (
            <span className="text-xs text-zinc-500 self-center">
              +{themesExtra}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 text-xs text-zinc-500">
        {f.post_count === 0
          ? "No posts yet"
          : f.post_count === 1
            ? "1 post"
            : `${f.post_count} posts`}
      </div>
    </Link>
  );
}
