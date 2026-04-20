"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { InputDialog } from "@/components/shared/InputDialog";
import { ListSkeleton } from "@/components/shared/SafeList";
import { cn } from "@/lib/utils";
import type {
  FigureType,
  HookAngle,
  IslamicFigure,
} from "@/types/figure";

const TYPE_LABEL: Record<FigureType, string> = {
  sahabi: "Sahabi",
  prophet: "Prophet",
  scholar: "Scholar",
  tabii: "Tabi'i",
};

const TYPE_PILL: Record<FigureType, string> = {
  sahabi: "bg-green-500/10 text-green-400 border-green-500/20",
  prophet: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  scholar: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  tabii: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const HOOK_CATEGORIES = [
  "contrast",
  "provocative",
  "scene",
  "purpose",
  "refusal",
  "dua",
  "scale",
  "loss",
  "character",
] as const;
type HookCategory = (typeof HOOK_CATEGORIES)[number];

type HadithRefRow = {
  relevance_note: string | null;
  hadith_corpus: {
    id: string;
    collection: string;
    collection_name: string;
    hadith_number: number;
    english_text: string;
    arabic_text: string;
    narrator: string | null;
    grade: string | null;
    sunnah_com_url: string | null;
  } | null;
};

type QuranRefRow = {
  verse_key: string;
  surah: number;
  ayah: number;
  relevance_note: string | null;
  tafseer_note: string | null;
  verse: {
    text_uthmani: string;
    translation_en: string | null;
  } | null;
};

type RecentPost = {
  id: string;
  title: string | null;
  status: string;
  platforms: string[] | null;
  platform: string | null;
  updated_at: string;
  final_content: string | null;
};

type DetailResponse = {
  figure: IslamicFigure;
  hadith_refs: HadithRefRow[];
  quran_refs: QuranRefRow[];
  recent_posts: RecentPost[];
  post_count: number;
};

export default function FigureDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/figures/by-slug/${slug}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("NOT_FOUND");
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as DetailResponse;
      setData(json);
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
        <div className="max-w-4xl">
          <ListSkeleton />
        </div>
      </PageShell>
    );
  }

  if (error === "NOT_FOUND" || !data) {
    return (
      <PageShell title="Figure not found">
        <div className="max-w-md space-y-3">
          <p className="text-[13px] text-zinc-400">
            No figure matches the slug <span className="font-mono text-white/80">{slug}</span>.
          </p>
          <Link
            href="/figures"
            className="inline-flex items-center gap-1 text-[12px] text-[#4CAF50] hover:underline"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            All figures
          </Link>
        </div>
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
    <DetailView
      initial={data}
      slug={slug}
      onReload={load}
      onDeleted={() => router.push(`/figures?deleted=${encodeURIComponent(data.figure.name_en)}`)}
    />
  );
}

/**
 * Editable inner view. Keeps state local to avoid re-fetching on every
 * optimistic update; refetches only on significant events (e.g. after
 * PATCH rollback).
 */
function DetailView({
  initial,
  slug,
  onReload,
  onDeleted,
}: {
  initial: DetailResponse;
  slug: string;
  onReload: () => void;
  onDeleted: () => void;
}) {
  const [figure, setFigure] = useState<IslamicFigure>(initial.figure);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const router = useRouter();

  // Dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [addThemeOpen, setAddThemeOpen] = useState(false);
  const [editAngleIdx, setEditAngleIdx] = useState<number | null>(null);
  const [deleteAngleIdx, setDeleteAngleIdx] = useState<number | null>(null);

  // Inline hook-angle add state
  const [addingAngle, setAddingAngle] = useState(false);
  const [newAngleCategory, setNewAngleCategory] =
    useState<HookCategory>("contrast");
  const [newAngleTemplate, setNewAngleTemplate] = useState("");
  const [savingAngle, setSavingAngle] = useState(false);

  const [creatingPost, setCreatingPost] = useState(false);

  const patchFigure = useCallback(
    async (patch: Partial<IslamicFigure>): Promise<boolean> => {
      const res = await fetch(`/api/figures/by-slug/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setInlineError(body.error || `Save failed (HTTP ${res.status})`);
        return false;
      }
      const { figure: updated } = (await res.json()) as {
        figure: IslamicFigure;
      };
      setFigure(updated);
      setInlineError(null);
      return true;
    },
    [slug]
  );

  const addTheme = async (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const next = [...figure.themes, clean];
    // Optimistic
    const prev = figure.themes;
    setFigure({ ...figure, themes: next });
    const ok = await patchFigure({ themes: next });
    if (!ok) setFigure({ ...figure, themes: prev });
    else setAddThemeOpen(false);
  };

  const removeTheme = async (theme: string) => {
    const prev = figure.themes;
    const next = prev.filter((t) => t !== theme);
    setFigure({ ...figure, themes: next });
    const ok = await patchFigure({ themes: next });
    if (!ok) setFigure({ ...figure, themes: prev });
  };

  const submitNewAngle = async () => {
    const template = newAngleTemplate.trim();
    if (!template || template.length > 500) return;
    setSavingAngle(true);
    const next: HookAngle[] = [
      ...figure.hook_angles,
      { category: newAngleCategory, template },
    ];
    const ok = await patchFigure({ hook_angles: next });
    setSavingAngle(false);
    if (ok) {
      setAddingAngle(false);
      setNewAngleTemplate("");
      setNewAngleCategory("contrast");
    }
  };

  const saveEditedAngle = async (idx: number, newTemplate: string) => {
    const template = newTemplate.trim();
    if (!template || template.length > 500) return;
    const prev = figure.hook_angles;
    const next = prev.map((a, i) =>
      i === idx ? { ...a, template } : a
    );
    setFigure({ ...figure, hook_angles: next });
    const ok = await patchFigure({ hook_angles: next });
    if (!ok) setFigure({ ...figure, hook_angles: prev });
    else setEditAngleIdx(null);
  };

  const deleteAngle = async (idx: number) => {
    const prev = figure.hook_angles;
    const next = prev.filter((_, i) => i !== idx);
    setFigure({ ...figure, hook_angles: next });
    const ok = await patchFigure({ hook_angles: next });
    if (!ok) setFigure({ ...figure, hook_angles: prev });
    else setDeleteAngleIdx(null);
  };

  const deleteFigure = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/figures/by-slug/${slug}`, { method: "DELETE" });
      if (res.status === 501) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setDeleteError(
          body.message ??
            "Soft delete requires a migration — ships in §6 commit 5."
        );
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setDeleteError(body.error || `Delete failed (HTTP ${res.status})`);
        return;
      }
      onDeleted();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const startPostAboutFigure = async () => {
    setCreatingPost(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `About ${figure.name_en}`,
          platform: "linkedin",
          figure_id: figure.id,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { post } = (await res.json()) as { post: { id: string } };
      router.push(`/content/${post.id}`);
    } catch (err) {
      setInlineError((err as Error).message);
      setCreatingPost(false);
    }
  };

  const deleteDescription = `This soft-deletes ${figure.name_en}. Posts that reference them keep their figure_id, but the figure won't show in the library or mention dropdown.${
    deleteError ? `\n\n${deleteError}` : ""
  }`;

  return (
    <PageShell
      title={figure.name_en}
      description={figure.title || TYPE_LABEL[figure.type]}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href={`/figures/${slug}/edit`}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-transparent px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Link>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-transparent px-3 py-1.5 text-[12px] text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      }
    >
      <div className="max-w-5xl">
        <Link
          href="/figures"
          className="inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-white mb-4"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          All figures
        </Link>

        {inlineError ? (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            {inlineError}
          </div>
        ) : null}

        {/* Identity header */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-white">
                {figure.name_en}
              </h1>
              {figure.name_ar ? (
                <div
                  dir="rtl"
                  className="mt-1 text-lg text-zinc-400"
                >
                  {figure.name_ar}
                </div>
              ) : null}
              {figure.title ? (
                <div className="mt-2 text-[13px] text-zinc-400">
                  {figure.title}
                </div>
              ) : null}
              {figure.era ? (
                <div className="mt-1 text-[12px] text-zinc-500">
                  Era: {figure.era}
                </div>
              ) : null}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                TYPE_PILL[figure.type]
              )}
            >
              {TYPE_LABEL[figure.type]}
            </span>
          </div>
          {figure.bio_short ? (
            <p className="mt-4 text-[14px] text-zinc-300 leading-relaxed">
              {figure.bio_short}
            </p>
          ) : null}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ThemesSection
              themes={figure.themes}
              onAddClick={() => setAddThemeOpen(true)}
              onRemove={removeTheme}
            />
            <HookAnglesSection
              angles={figure.hook_angles}
              addingAngle={addingAngle}
              newAngleCategory={newAngleCategory}
              newAngleTemplate={newAngleTemplate}
              savingAngle={savingAngle}
              editAngleIdx={editAngleIdx}
              onStartAdd={() => setAddingAngle(true)}
              onCancelAdd={() => {
                setAddingAngle(false);
                setNewAngleTemplate("");
              }}
              onChangeCategory={setNewAngleCategory}
              onChangeTemplate={setNewAngleTemplate}
              onSubmitNew={submitNewAngle}
              onStartEdit={setEditAngleIdx}
              onStartDelete={setDeleteAngleIdx}
            />
          </div>

          <div className="space-y-6">
            <LinkedHadithPanel refs={initial.hadith_refs} />
            <LinkedQuranPanel refs={initial.quran_refs} />
            <RecentPostsPanel
              posts={initial.recent_posts}
              postCount={initial.post_count}
              figureName={figure.name_en}
              onCreate={startPostAboutFigure}
              creating={creatingPost}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteError(null);
        }}
        title={`Delete ${figure.name_en}?`}
        description={deleteDescription}
        variant="danger"
        confirmLabel="Delete figure"
        loading={deleteLoading}
        onConfirm={deleteFigure}
      />

      <InputDialog
        open={addThemeOpen}
        onOpenChange={setAddThemeOpen}
        title="Add theme"
        description={`Add a new theme to ${figure.name_en}.`}
        label="Theme name"
        placeholder="e.g., patience, repentance, courage"
        submitLabel="Add"
        validate={(v) => {
          const t = v.trim();
          if (t.length < 1) return "Theme cannot be empty.";
          if (t.length > 50) return "Theme must be 50 characters or fewer.";
          if (
            figure.themes.some((existing) => existing.toLowerCase() === t.toLowerCase())
          ) {
            return "That theme is already listed.";
          }
          return null;
        }}
        onSubmit={addTheme}
      />

      {editAngleIdx !== null ? (
        <InputDialog
          open={editAngleIdx !== null}
          onOpenChange={(open) => {
            if (!open) setEditAngleIdx(null);
          }}
          title="Edit hook angle"
          description={`Category: ${figure.hook_angles[editAngleIdx].category}`}
          label="Template text"
          placeholder="Rephrased hook opener…"
          defaultValue={figure.hook_angles[editAngleIdx].template}
          submitLabel="Save"
          validate={(v) => {
            const t = v.trim();
            if (t.length < 1) return "Template cannot be empty.";
            if (t.length > 500) return "Template must be 500 characters or fewer.";
            return null;
          }}
          onSubmit={(v) => saveEditedAngle(editAngleIdx, v)}
        />
      ) : null}

      <ConfirmDialog
        open={deleteAngleIdx !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteAngleIdx(null);
        }}
        title="Remove this hook angle?"
        description={`This angle will no longer appear as a suggestion when writing posts about ${figure.name_en}.`}
        variant="danger"
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteAngleIdx !== null) void deleteAngle(deleteAngleIdx);
        }}
      />
    </PageShell>
  );
}

function ThemesSection({
  themes,
  onAddClick,
  onRemove,
}: {
  themes: string[];
  onAddClick: () => void;
  onRemove: (theme: string) => void;
}) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Themes ({themes.length})
      </h2>
      <div className="flex flex-wrap gap-2">
        {themes.map((theme) => (
          <span
            key={theme}
            className="group inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800 pl-3 pr-1.5 py-1 text-sm text-zinc-200"
          >
            <span>{theme}</span>
            <button
              type="button"
              onClick={() => onRemove(theme)}
              aria-label={`Remove ${theme}`}
              className="ml-2 rounded p-0.5 text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 focus:opacity-100"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-700 px-3 py-1 text-sm text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
        >
          <Plus className="w-3 h-3" />
          Add theme
        </button>
      </div>
    </section>
  );
}

function HookAnglesSection({
  angles,
  addingAngle,
  newAngleCategory,
  newAngleTemplate,
  savingAngle,
  editAngleIdx,
  onStartAdd,
  onCancelAdd,
  onChangeCategory,
  onChangeTemplate,
  onSubmitNew,
  onStartEdit,
  onStartDelete,
}: {
  angles: HookAngle[];
  addingAngle: boolean;
  newAngleCategory: HookCategory;
  newAngleTemplate: string;
  savingAngle: boolean;
  editAngleIdx: number | null;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onChangeCategory: (c: HookCategory) => void;
  onChangeTemplate: (t: string) => void;
  onSubmitNew: () => void;
  onStartEdit: (idx: number) => void;
  onStartDelete: (idx: number) => void;
}) {
  const canSubmit =
    !savingAngle &&
    newAngleTemplate.trim().length > 0 &&
    newAngleTemplate.trim().length <= 500;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider">
          Hook angles ({angles.length})
        </h2>
      </div>

      {angles.length === 0 && !addingAngle ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 p-6 text-center">
          <p className="text-sm text-zinc-400">No hook angles yet.</p>
          <button
            type="button"
            onClick={onStartAdd}
            className="mt-2 text-[12px] text-[#4CAF50] hover:underline"
          >
            Add the first one
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {angles.map((angle, i) => (
            <li
              key={`${angle.category}-${i}`}
              className="group rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300 uppercase tracking-wider">
                  {angle.category}
                </span>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => onStartEdit(i)}
                    aria-label="Edit hook angle"
                    className="rounded p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                    disabled={editAngleIdx !== null}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartDelete(i)}
                    aria-label="Remove hook angle"
                    className="rounded p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                {angle.template}
              </p>
            </li>
          ))}
        </ul>
      )}

      {addingAngle ? (
        <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Category
          </label>
          <select
            value={newAngleCategory}
            onChange={(e) => onChangeCategory(e.target.value as HookCategory)}
            disabled={savingAngle}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
          >
            {HOOK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="mt-3 block text-sm font-medium text-zinc-300 mb-1.5">
            Template
          </label>
          <textarea
            value={newAngleTemplate}
            onChange={(e) => onChangeTemplate(e.target.value)}
            placeholder="e.g., The companion who gave everything — but kept nothing for himself"
            rows={3}
            maxLength={500}
            disabled={savingAngle}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
          />
          <div className="mt-1 text-xs text-zinc-500 tabular-nums">
            {newAngleTemplate.trim().length} / 500
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelAdd}
              disabled={savingAngle}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmitNew}
              disabled={!canSubmit}
              className="rounded-md bg-[#1B5E20] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#154d19] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingAngle ? "Saving…" : "Add angle"}
            </button>
          </div>
        </div>
      ) : angles.length > 0 ? (
        <button
          type="button"
          onClick={onStartAdd}
          className="mt-3 inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        >
          <Plus className="w-3.5 h-3.5" />
          Add hook angle
        </button>
      ) : null}
    </section>
  );
}

function LinkedHadithPanel({ refs }: { refs: HadithRefRow[] }) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Linked hadith ({refs.length})
      </h3>
      {refs.length === 0 ? (
        <p className="text-[12px] text-zinc-500">No hadith linked.</p>
      ) : (
        <ul className="space-y-2">
          {refs.map((row, i) => {
            const h = row.hadith_corpus;
            if (!h) return null;
            const excerpt =
              h.english_text && h.english_text.length > 160
                ? `${h.english_text.slice(0, 160).trim()}…`
                : h.english_text;
            return (
              <li
                key={`${h.id}-${i}`}
                className="rounded-md border border-zinc-800 bg-zinc-900 p-3"
              >
                <div className="text-[12px] text-zinc-300 leading-relaxed">
                  {excerpt}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    {h.collection_name} #{h.hadith_number}
                    {h.grade ? ` · ${h.grade}` : ""}
                  </span>
                  {h.sunnah_com_url ? (
                    <a
                      href={h.sunnah_com_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#60a5fa] hover:underline"
                    >
                      sunnah.com →
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LinkedQuranPanel({ refs }: { refs: QuranRefRow[] }) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Linked Quran verses ({refs.length})
      </h3>
      {refs.length === 0 ? (
        <p className="text-[12px] text-zinc-500">No verses linked.</p>
      ) : (
        <ul className="space-y-2">
          {refs.map((r) => (
            <li
              key={r.verse_key}
              className="rounded-md border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-zinc-300 tabular-nums">
                  {r.verse_key}
                </span>
                <a
                  href={`https://quran.com/${r.surah}/${r.ayah}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#60a5fa] hover:underline"
                >
                  quran.com →
                </a>
              </div>
              {r.verse?.translation_en ? (
                <p className="mt-1.5 text-[12px] text-zinc-400 leading-relaxed line-clamp-3">
                  {r.verse.translation_en}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentPostsPanel({
  posts,
  postCount,
  figureName,
  onCreate,
  creating,
}: {
  posts: RecentPost[];
  postCount: number;
  figureName: string;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Recent posts ({postCount})
      </h3>
      {posts.length === 0 ? (
        <p className="text-[12px] text-zinc-500">
          No posts about {figureName} yet.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={`/content/${p.id}`}
                className="block rounded-md border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12px] font-medium text-white truncate">
                    {p.title || "Untitled draft"}
                  </span>
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                    {p.status}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  {new Date(p.updated_at).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="w-full rounded-md bg-[#1B5E20] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#154d19] disabled:opacity-50"
      >
        {creating ? "Creating…" : `Write new post about ${figureName}`}
      </button>
    </section>
  );
}
