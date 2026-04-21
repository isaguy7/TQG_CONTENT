"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FigureType, HookAngle } from "@/types/figure";

const FIGURE_TYPES: FigureType[] = ["sahabi", "prophet", "scholar", "tabii"];

const TYPE_LABEL: Record<FigureType, string> = {
  sahabi: "Sahabi",
  prophet: "Prophet",
  scholar: "Scholar",
  tabii: "Tabi'i",
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

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Mirrors the migration + POST route slug derivation. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type SlugStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; reason: string }
  | { state: "invalid"; reason: string };

export interface FigureFormValues {
  name_en: string;
  name_ar: string;
  title: string;
  type: FigureType;
  era: string;
  bio_short: string;
  slug: string;
  themes: string[];
  hook_angles: HookAngle[];
}

export interface FigureFormProps {
  mode: "create" | "edit";
  initial?: Partial<FigureFormValues>;
  /** Called after a successful save with the resulting figure's slug
   *  so the parent can navigate. */
  onSuccess: (slug: string) => void;
  onCancel: () => void;
}

export function FigureForm({
  mode,
  initial,
  onSuccess,
  onCancel,
}: FigureFormProps) {
  const [name_en, setNameEn] = useState(initial?.name_en ?? "");
  const [name_ar, setNameAr] = useState(initial?.name_ar ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<FigureType>(
    (initial?.type as FigureType) ?? "sahabi"
  );
  const [era, setEra] = useState(initial?.era ?? "");
  const [bio_short, setBioShort] = useState(initial?.bio_short ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [themes, setThemes] = useState<string[]>(initial?.themes ?? []);
  const [newTheme, setNewTheme] = useState("");
  const [hookAngles, setHookAngles] = useState<HookAngle[]>(
    initial?.hook_angles ?? []
  );
  const [addingAngle, setAddingAngle] = useState(false);
  const [newAngleCategory, setNewAngleCategory] =
    useState<HookCategory>("contrast");
  const [newAngleTemplate, setNewAngleTemplate] = useState("");

  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ state: "idle" });
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-derive slug from name_en on each keystroke unless the user
  // has touched the slug field. Create mode only — edit mode keeps the
  // existing slug readonly.
  useEffect(() => {
    if (mode !== "create") return;
    if (slugTouched) return;
    setSlug(slugify(name_en));
  }, [name_en, slugTouched, mode]);

  // Debounced slug availability check (create mode only).
  useEffect(() => {
    if (mode !== "create") return;
    if (slugTimer.current) clearTimeout(slugTimer.current);
    const candidate = slug.trim();
    if (!candidate) {
      setSlugStatus({ state: "idle" });
      return;
    }
    if (!SLUG_PATTERN.test(candidate)) {
      setSlugStatus({
        state: "invalid",
        reason: "Lowercase letters, digits, hyphens. No leading/trailing hyphens.",
      });
      return;
    }
    setSlugStatus({ state: "checking" });
    slugTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/figures/slug-available?slug=${encodeURIComponent(candidate)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          available: boolean;
          reason?: string;
        };
        if (json.available) {
          setSlugStatus({ state: "available" });
        } else {
          setSlugStatus({
            state:
              json.reason === "Invalid format" ? "invalid" : "taken",
            reason: json.reason ?? "Not available",
          });
        }
      } catch {
        setSlugStatus({ state: "idle" });
      }
    }, 300);
    return () => {
      if (slugTimer.current) clearTimeout(slugTimer.current);
    };
  }, [slug, mode]);

  const addTheme = () => {
    const clean = newTheme.trim();
    if (!clean) return;
    if (clean.length > 50) {
      setFormError("Theme names must be 50 characters or fewer.");
      return;
    }
    if (themes.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setFormError("That theme is already in the list.");
      return;
    }
    if (themes.length >= 20) {
      setFormError("Maximum of 20 themes.");
      return;
    }
    setThemes([...themes, clean]);
    setNewTheme("");
    setFormError(null);
  };

  const removeTheme = (theme: string) => {
    setThemes(themes.filter((t) => t !== theme));
  };

  const onThemeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTheme();
    }
  };

  const submitNewAngle = () => {
    const template = newAngleTemplate.trim();
    if (!template) return;
    if (template.length > 500) {
      setFormError("Hook angle templates must be 500 characters or fewer.");
      return;
    }
    if (hookAngles.length >= 10) {
      setFormError("Maximum of 10 hook angles.");
      return;
    }
    setHookAngles([
      ...hookAngles,
      { category: newAngleCategory, template },
    ]);
    setNewAngleTemplate("");
    setNewAngleCategory("contrast");
    setAddingAngle(false);
    setFormError(null);
  };

  const removeAngle = (idx: number) => {
    setHookAngles(hookAngles.filter((_, i) => i !== idx));
  };

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (name_en.trim().length < 1 || name_en.trim().length > 100) return false;
    if (bio_short.trim().length < 1) return false;
    if (name_ar && name_ar.length > 100) return false;
    if (title && title.length > 200) return false;
    if (mode === "create") {
      if (!slug.trim()) return false;
      if (slugStatus.state !== "available") return false;
    }
    return true;
  }, [
    submitting,
    name_en,
    bio_short,
    name_ar,
    title,
    slug,
    slugStatus.state,
    mode,
  ]);

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setFormError(null);

      const payload = {
        name_en: name_en.trim(),
        name_ar: name_ar.trim() || null,
        title: title.trim() || null,
        type,
        era: era.trim() || null,
        bio_short: bio_short.trim(),
        themes,
        hook_angles: hookAngles,
        ...(mode === "create" ? { slug: slug.trim() } : {}),
      };

      try {
        const url =
          mode === "create"
            ? "/api/figures"
            : `/api/figures/by-slug/${initial?.slug ?? slug.trim()}`;
        const method = mode === "create" ? "POST" : "PATCH";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          if (body.error === "SLUG_TAKEN") {
            setSlugStatus({ state: "taken", reason: "Already used" });
            setFormError(body.message ?? "That slug is already used.");
          } else {
            setFormError(body.error || `Save failed (HTTP ${res.status})`);
          }
          return;
        }
        const json = (await res.json()) as {
          figure: { slug: string };
        };
        onSuccess(json.figure.slug);
      } catch (err) {
        setFormError((err as Error).message);
      } finally {
        setSubmitting(false);
      }
    },
    [
      canSubmit,
      name_en,
      name_ar,
      title,
      type,
      era,
      bio_short,
      themes,
      hookAngles,
      slug,
      mode,
      initial?.slug,
      onSuccess,
    ]
  );

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      {formError ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {formError}
        </div>
      ) : null}

      {/* Name + Arabic */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name (English)" required>
          <input
            autoFocus
            value={name_en}
            onChange={(e) => setNameEn(e.target.value)}
            maxLength={100}
            className={baseInput}
            placeholder="e.g., Abu Bakr as-Siddiq"
          />
        </Field>
        <Field label="Name (Arabic)">
          <input
            value={name_ar}
            onChange={(e) => setNameAr(e.target.value)}
            maxLength={100}
            dir="rtl"
            className={baseInput}
            placeholder="e.g., أبو بكر الصديق"
          />
        </Field>
      </div>

      <Field label="Title (optional)">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className={baseInput}
          placeholder="e.g., Companion of the Prophet ﷺ"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type" required>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FigureType)}
            className={baseInput}
          >
            {FIGURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Era (optional)">
          <input
            value={era}
            onChange={(e) => setEra(e.target.value)}
            className={baseInput}
            placeholder="e.g., Early Islamic period"
          />
        </Field>
      </div>

      <Field label="Slug" required>
        <input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value.toLowerCase());
            setSlugTouched(true);
          }}
          readOnly={mode === "edit"}
          className={cn(
            baseInput,
            "font-mono",
            slugStatus.state === "invalid" || slugStatus.state === "taken"
              ? "border-red-500/60 focus:ring-red-500/50"
              : slugStatus.state === "available"
                ? "border-green-500/40 focus:ring-green-500/50"
                : undefined,
            mode === "edit" && "opacity-60 cursor-not-allowed"
          )}
          placeholder="abu-bakr-as-siddiq"
        />
        <SlugStatusLine status={slugStatus} mode={mode} />
      </Field>

      <Field label="Short bio" required>
        <textarea
          value={bio_short}
          onChange={(e) => setBioShort(e.target.value)}
          rows={3}
          className={cn(baseInput, "resize-y")}
          placeholder="2-3 sentence summary used as subtitle context."
        />
      </Field>

      {/* Themes chip editor */}
      <Field label={`Themes (${themes.length}/20)`}>
        <div className="flex flex-wrap gap-2">
          {themes.map((theme) => (
            <span
              key={theme}
              className="group inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800 pl-3 pr-1.5 py-1 text-sm text-zinc-200"
            >
              <span>{theme}</span>
              <button
                type="button"
                onClick={() => removeTheme(theme)}
                aria-label={`Remove ${theme}`}
                className="ml-2 rounded p-0.5 text-zinc-500 hover:text-red-400"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={newTheme}
            onChange={(e) => setNewTheme(e.target.value)}
            onKeyDown={onThemeKeyDown}
            maxLength={50}
            placeholder="Add a theme and press Enter"
            className={baseInput}
          />
          <button
            type="button"
            onClick={addTheme}
            disabled={!newTheme.trim() || themes.length >= 20}
            className="shrink-0 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </Field>

      {/* Hook angles */}
      <Field label={`Hook angles (${hookAngles.length}/10)`}>
        {hookAngles.length === 0 && !addingAngle ? (
          <p className="text-sm text-zinc-500">No hook angles yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hookAngles.map((angle, i) => (
              <li
                key={`${angle.category}-${i}`}
                className="group rounded-md border border-zinc-800 bg-zinc-900 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-zinc-300">
                    {angle.category}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAngle(i)}
                    aria-label="Remove hook angle"
                    className="rounded p-1 text-zinc-500 opacity-0 hover:text-red-400 hover:bg-red-500/10 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                  {angle.template}
                </p>
              </li>
            ))}
          </ul>
        )}

        {addingAngle ? (
          <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-900 p-3 space-y-2">
            <select
              value={newAngleCategory}
              onChange={(e) =>
                setNewAngleCategory(e.target.value as HookCategory)
              }
              className={baseInput}
            >
              {HOOK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <textarea
              value={newAngleTemplate}
              onChange={(e) => setNewAngleTemplate(e.target.value)}
              placeholder="Template text for the hook…"
              rows={3}
              maxLength={500}
              className={cn(baseInput, "resize-y")}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 tabular-nums">
                {newAngleTemplate.trim().length} / 500
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddingAngle(false);
                    setNewAngleTemplate("");
                  }}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitNewAngle}
                  disabled={!newAngleTemplate.trim()}
                  className="rounded-md bg-[#1B5E20] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#154d19] disabled:opacity-50"
                >
                  Add angle
                </button>
              </div>
            </div>
          </div>
        ) : hookAngles.length < 10 ? (
          <button
            type="button"
            onClick={() => setAddingAngle(true)}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          >
            <Plus className="w-3.5 h-3.5" />
            Add hook angle
          </button>
        ) : null}
      </Field>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-[#1B5E20] px-4 py-2 text-sm font-medium text-white hover:bg-[#154d19] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create figure"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}

const baseInput =
  "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#1B5E20] focus:border-[#1B5E20]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-zinc-300 mb-1.5">
        {label}
        {required ? <span className="text-red-400 ml-0.5">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function SlugStatusLine({
  status,
  mode,
}: {
  status: SlugStatus;
  mode: "create" | "edit";
}) {
  if (mode === "edit") {
    return (
      <p className="mt-1.5 text-xs text-zinc-500">
        Slug is immutable once set.
      </p>
    );
  }
  if (status.state === "idle") {
    return (
      <p className="mt-1.5 text-xs text-zinc-500">
        Auto-derived from the English name until you edit it.
      </p>
    );
  }
  if (status.state === "checking") {
    return <p className="mt-1.5 text-xs text-zinc-500">Checking availability…</p>;
  }
  if (status.state === "available") {
    return <p className="mt-1.5 text-xs text-green-400">Available — looks good.</p>;
  }
  return <p className="mt-1.5 text-xs text-red-400">{status.reason}</p>;
}
