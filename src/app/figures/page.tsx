import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { FigureCard, type FigureCardData } from "@/components/FigureCard";
import { getSupabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = {
  type?: string;
  filter?: string;
};

type FilterKey = "all" | "sahabi" | "prophet" | "scholar" | "never-posted";

const FILTERS: Array<{ key: FilterKey; label: string; href: string }> = [
  { key: "all", label: "All", href: "/figures" },
  { key: "sahabi", label: "Sahabah", href: "/figures?type=sahabi" },
  { key: "prophet", label: "Prophets", href: "/figures?type=prophet" },
  { key: "scholar", label: "Scholars", href: "/figures?type=scholar" },
  {
    key: "never-posted",
    label: "Never posted",
    href: "/figures?filter=never-posted",
  },
];

function activeFilter(sp: SearchParams): FilterKey {
  if (sp.filter === "never-posted") return "never-posted";
  if (sp.type === "sahabi") return "sahabi";
  if (sp.type === "prophet") return "prophet";
  if (sp.type === "scholar") return "scholar";
  return "all";
}

export default async function FiguresPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const db = getSupabaseServer();
  const { data: rows, error } = await db
    .from("islamic_figures")
    .select(
      "id,name_en,name_ar,type,era,themes,posts_written,last_posted_at"
    )
    .order("name_en");

  const figures: FigureCardData[] = (rows as FigureCardData[] | null) || [];

  const counts = {
    all: figures.length,
    sahabi: figures.filter((f) => f.type === "sahabi").length,
    prophet: figures.filter((f) => f.type === "prophet").length,
    scholar: figures.filter((f) => f.type === "scholar").length,
    "never-posted": figures.filter((f) => f.posts_written === 0).length,
  };

  const active = activeFilter(searchParams);
  const filtered = figures.filter((f) => {
    if (active === "never-posted") return f.posts_written === 0;
    if (active === "sahabi") return f.type === "sahabi";
    if (active === "prophet") return f.type === "prophet";
    if (active === "scholar") return f.type === "scholar";
    return true;
  });

  return (
    <PageShell
      title="Islamic Figures"
      description="Sahabah, prophets, scholars, tabi'in"
    >
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-[12px] text-danger">
          Failed to load figures: {error.message}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {FILTERS.map((f) => {
              const isActive = f.key === active;
              const isNeverPosted = f.key === "never-posted";
              const base =
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors";
              const state = isActive
                ? isNeverPosted
                  ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
                  : "bg-white/[0.08] border border-white/[0.12] text-white/90"
                : isNeverPosted
                ? "bg-transparent border border-amber-500/30 text-amber-400/80 hover:bg-amber-500/10"
                : "bg-transparent border border-white/[0.06] text-white/50 hover:bg-white/[0.04] hover:text-white/70";
              return (
                <Link
                  key={f.key}
                  href={f.href}
                  className={`${base} ${state}`}
                >
                  {f.label}
                  <span className="text-[10px] text-white/40">
                    {counts[f.key]}
                  </span>
                </Link>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[13px] text-white/40">
              No figures match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((fig) => (
                <FigureCard key={fig.id} figure={fig} />
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
