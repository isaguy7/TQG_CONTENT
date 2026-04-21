"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { FigureForm } from "@/components/figures/FigureForm";
import { ListSkeleton } from "@/components/shared/SafeList";
import type { IslamicFigure } from "@/types/figure";

export default function EditFigurePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [figure, setFigure] = useState<IslamicFigure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/figures/by-slug/${slug}`);
      if (res.status === 404) {
        setError("NOT_FOUND");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { figure: IslamicFigure };
      setFigure(json.figure);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <PageShell title="Loading…">
        <div className="max-w-2xl">
          <ListSkeleton />
        </div>
      </PageShell>
    );
  }

  if (error === "NOT_FOUND" || !figure) {
    return (
      <PageShell title="Figure not found">
        <Link
          href="/figures"
          className="inline-flex items-center gap-1 text-[12px] text-[#4CAF50] hover:underline"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          All figures
        </Link>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Error">
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-[13px] text-red-300">
          {error}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`Edit ${figure.name_en}`}
      description="Change names, title, type, themes, or hook angles. Slug is immutable."
    >
      <Link
        href={`/figures/${slug}`}
        className="inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-white mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to figure
      </Link>
      <FigureForm
        mode="edit"
        initial={{
          name_en: figure.name_en,
          name_ar: figure.name_ar ?? "",
          title: figure.title ?? "",
          type: figure.type,
          era: figure.era ?? "",
          bio_short: figure.bio_short,
          slug: figure.slug,
          themes: figure.themes,
          hook_angles: figure.hook_angles,
        }}
        onSuccess={(updatedSlug) => router.push(`/figures/${updatedSlug}`)}
        onCancel={() => router.push(`/figures/${slug}`)}
      />
    </PageShell>
  );
}
