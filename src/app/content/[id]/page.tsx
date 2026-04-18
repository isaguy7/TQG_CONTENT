"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";
import {
  SearchCorpus,
  type HadithRecord,
} from "@/components/HadithPanel";
import {
  PLATFORMS,
  counterTone,
  getPlatform,
  type PlatformId,
} from "@/lib/platform-rules";
import { buildSystemPrompt, type FigureContext } from "@/lib/system-prompt";
import {
  linkedinToFacebook,
  linkedinToInstagram,
  linkedinToX,
} from "@/lib/platform-convert";
import { HookGenerator } from "@/components/HookGenerator";
import { SlopChecker } from "@/components/SlopChecker";
import { TypefullyPush } from "@/components/TypefullyPush";
import { ImagePicker } from "@/components/ImagePicker";
import { FigureContextPanel } from "@/components/FigureContextPanel";
import { FigurePicker } from "@/components/FigurePicker";
import { AmbientSuggestions } from "@/components/AmbientSuggestions";
import { PostLabels } from "@/components/PostLabels";

type PostStatus =
  | "idea"
  | "drafting"
  | "review"
  | "ready"
  | "scheduled"
  | "published";

type Post = {
  id: string;
  title: string | null;
  final_content: string | null;
  status: PostStatus;
  platform: string;
  figure_id: string | null;
  hook_selected: string | null;
  image_url: string | null;
  image_rationale: string | null;
  labels: string[] | null;
  quran_refs: unknown;
  updated_at: string;
};

type Figure = {
  id: string;
  name_en: string;
  name_ar?: string | null;
  title?: string | null;
  bio_short?: string | null;
  themes?: string[] | null;
  notable_events?: unknown;
};

export default function PostEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const postId = params.id;

  const [post, setPost] = useState<Post | null>(null);
  const [figure, setFigure] = useState<Figure | null>(null);
  const [attached, setAttached] = useState<HadithRecord[]>([]);
  const [allHadith, setAllHadith] = useState<HadithRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [corpusOpen, setCorpusOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const initialLoadDone = useRef(false);

  const loadPost = useCallback(async () => {
    try {
      const [postRes, hadithRes] = await Promise.all([
        fetch(`/api/posts/${postId}`),
        fetch("/api/hadith"),
      ]);
      if (!postRes.ok) throw new Error(`Post ${postRes.status}`);
      const { post, hadith_refs } = (await postRes.json()) as {
        post: Post;
        hadith_refs: HadithRecord[];
      };
      setPost(post);
      if (!initialLoadDone.current) {
        setDraft(post.final_content || "");
        initialLoadDone.current = true;
      }
      setAttached(hadith_refs || []);
      if (hadithRes.ok) {
        const { hadith } = (await hadithRes.json()) as { hadith: HadithRecord[] };
        setAllHadith(hadith);
      }
      if (post.figure_id) {
        const fRes = await fetch(`/api/figures/${post.figure_id}`).catch(
          () => null
        );
        if (fRes && fRes.ok) {
          const { figure } = (await fRes.json()) as { figure: Figure };
          setFigure(figure);
        }
      } else {
        setFigure(null);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const save = async (patch: Partial<Post>) => {
    setSaveMsg("Saving…");
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveMsg(`Save failed: ${err.error || res.status}`);
        return;
      }
      const { post } = (await res.json()) as { post: Post };
      setPost(post);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (err) {
      setSaveMsg(`Save failed: ${(err as Error).message}`);
    }
  };

  const attachHadith = async (hadithId: string) => {
    await fetch(`/api/posts/${postId}/hadith`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hadith_id: hadithId }),
    });
    loadPost();
  };

  const detachHadith = async (hadithId: string) => {
    await fetch(`/api/posts/${postId}/hadith?hadith_id=${hadithId}`, {
      method: "DELETE",
    });
    loadPost();
  };

  const deletePost = async () => {
    if (
      !confirm(
        "Move this draft to trash? You can restore it within 7 days."
      )
    ) {
      return;
    }
    await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    router.push("/content");
  };

  const copyForClaude = async () => {
    if (!post) return;
    try {
      const figureCtx: FigureContext | null = figure
        ? {
            nameEn: figure.name_en,
            nameAr: figure.name_ar || null,
            title: figure.title || null,
            bioShort: figure.bio_short || null,
            themes: figure.themes || null,
            notableEvents: figure.notable_events,
          }
        : null;
      const prompt = buildSystemPrompt({
        platform: post.platform,
        figure: figureCtx,
        topic: post.title,
      });
      await navigator.clipboard.writeText(prompt);
      setCopyMsg("Copied to clipboard");
      setTimeout(() => setCopyMsg(null), 1800);
    } catch (err) {
      setCopyMsg(`Copy failed: ${(err as Error).message}`);
      setTimeout(() => setCopyMsg(null), 2500);
    }
  };

  const attachedIds = useMemo(() => new Set(attached.map((h) => h.id)), [attached]);
  const availableHadith = useMemo(
    () => allHadith.filter((h) => !attachedIds.has(h.id)),
    [allHadith, attachedIds]
  );

  const platformCfg = useMemo(
    () => getPlatform(post?.platform),
    [post?.platform]
  );
  const charCount = draft.length;
  const tone = counterTone(charCount, platformCfg);
  const pct = Math.min(100, (charCount / platformCfg.charLimit) * 100);
  const visiblePreview =
    draft.slice(0, platformCfg.visibleBefore) +
    (draft.length > platformCfg.visibleBefore ? "…" : "");

  if (loading) {
    return (
      <PageShell title="Loading…">
        <div className="text-[13px] text-white/40">Loading post…</div>
      </PageShell>
    );
  }

  if (error || !post) {
    return (
      <PageShell title="Post not found">
        <div className="rounded-lg bg-danger/[0.08] border border-danger/40 p-4 text-[13px] text-white/80">
          {error || "Post not found"}
        </div>
        <Link
          href="/content"
          className="inline-block mt-3 text-[12px] text-white/50 hover:text-white/80 underline underline-offset-2"
        >
          Back to drafts
        </Link>
      </PageShell>
    );
  }

  const counterColor =
    tone === "over"
      ? "text-danger"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "optimal"
          ? "text-emerald-400"
          : "text-white/60";
  const barColor =
    tone === "over"
      ? "bg-danger"
      : tone === "warn"
        ? "bg-amber-400"
        : tone === "optimal"
          ? "bg-emerald-400"
          : "bg-white/40";

  return (
    <PageShell
      title={post.title || "Untitled draft"}
      description={`${platformCfg.label} · ${post.status}`}
      actions={
        <>
          {saveMsg ? (
            <span className="text-[11px] text-white/40 self-center mr-2">
              {saveMsg}
            </span>
          ) : null}
          {copyMsg ? (
            <span className="text-[11px] text-primary-bright self-center mr-2">
              {copyMsg}
            </span>
          ) : null}
          <button
            onClick={copyForClaude}
            className="px-3 py-1.5 rounded text-[12px] border border-white/[0.08] text-white/85 hover:text-white hover:bg-white/[0.04]"
          >
            Copy to Claude
          </button>
          <button
            onClick={deletePost}
            className="px-3 py-1.5 rounded text-[12px] border border-white/[0.08] text-white/50 hover:text-danger hover:border-danger/40"
          >
            Delete
          </button>
        </>
      }
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <input
            value={post.title || ""}
            onChange={(e) => {
              setPost({ ...post, title: e.target.value });
            }}
            onBlur={(e) => save({ title: e.target.value })}
            placeholder="Title"
            className="w-full bg-transparent border-0 text-center text-[18px] font-semibold text-white/90 placeholder-white/25 focus:outline-none"
          />
          <div className="mt-2 flex justify-center">
            <PostLabels
              labels={post.labels || []}
              onChange={(labels) => {
                setPost({ ...post, labels });
                save({ labels } as Partial<Post>);
              }}
            />
          </div>
          <div className="mt-3">
            <FigurePicker
              value={post.figure_id}
              onChange={async (nextId) => {
                setPost({ ...post, figure_id: nextId });
                await save({ figure_id: nextId } as Partial<Post>);
                if (!nextId) {
                  setFigure(null);
                } else {
                  const fRes = await fetch(`/api/figures/${nextId}`).catch(() => null);
                  if (fRes && fRes.ok) {
                    const { figure } = (await fRes.json()) as { figure: Figure };
                    setFigure(figure);
                  }
                }
              }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => {
              if (e.target.value !== (post.final_content || "")) {
                save({ final_content: e.target.value });
              }
            }}
            placeholder="Write the post body here. This is the main thing on the page."
            className="w-full bg-transparent border-0 text-[14px] text-white/90 placeholder-white/25 focus:outline-none min-h-[340px] leading-relaxed resize-y"
          />

          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-3">
                <span className={cn("font-medium tabular-nums", counterColor)}>
                  {charCount.toLocaleString()} / {platformCfg.charLimit.toLocaleString()}
                </span>
                <span className="text-white/40">
                  optimal {platformCfg.optimalRange[0]}-
                  {platformCfg.optimalRange[1]}
                </span>
              </div>
              <span className={cn("text-[11px]", counterColor)}>
                {tone === "over"
                  ? "Over limit"
                  : tone === "warn"
                    ? "Past optimal"
                    : tone === "optimal"
                      ? "In the zone"
                      : "Below optimal"}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className={cn("h-full transition-all", barColor)}
                style={{ width: `${pct}%` }}
              />
            </div>
            {charCount > 0 ? (
              <div className="mt-3 rounded-md border border-dashed border-white/10 bg-white/[0.02] p-2 text-[11px] text-white/55 leading-relaxed">
                <span className="text-white/35 mr-1">
                  First {platformCfg.visibleBefore} chars visible in feed:
                </span>
                <span className="text-white/80">
                  {visiblePreview || "—"}
                </span>
              </div>
            ) : null}

            <details className="mt-3 text-[12px]">
              <summary className="cursor-pointer text-white/55 hover:text-white/80">
                {platformCfg.label} formatting tips
              </summary>
              <ul className="mt-2 space-y-1 text-white/70 leading-relaxed">
                {platformCfg.formatNotes.map((n) => (
                  <li key={n} className="pl-3 relative">
                    <span className="absolute left-0 text-white/30">·</span>
                    {n}
                  </li>
                ))}
                <li className="pl-3 relative pt-1 text-white/50">
                  <span className="absolute left-0 text-white/30">·</span>
                  Hashtags: {platformCfg.hashtagAdvice}
                </li>
              </ul>
            </details>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px]">
            <label className="flex items-center gap-2">
              <span className="text-white/50">Platform:</span>
              <select
                value={post.platform}
                onChange={(e) => {
                  const next = e.target.value as PlatformId;
                  setPost({ ...post, platform: next });
                  save({ platform: next });
                }}
                className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-white/85"
              >
                {Object.values(PLATFORMS).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-white/50">Status:</span>
              <select
                value={post.status}
                onChange={(e) => save({ status: e.target.value as PostStatus })}
                className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-white/85"
              >
                <option value="idea">idea</option>
                <option value="drafting">drafting</option>
                <option value="review">review</option>
                <option value="ready">ready</option>
                <option value="scheduled">scheduled</option>
                <option value="published">published</option>
              </select>
            </label>
            <div className="flex-1" />
            <button
              onClick={() => setConvertOpen((v) => !v)}
              className="px-2.5 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
            >
              {convertOpen ? "Hide previews" : "Preview on other platforms"}
            </button>
          </div>

          {convertOpen && post.platform === "linkedin" ? (
            <ConvertPreviews content={draft} />
          ) : convertOpen ? (
            <div className="mt-3 text-[11px] text-white/40">
              Conversion previews are available when the source platform is
              LinkedIn.
            </div>
          ) : null}
        </div>

        <AmbientSuggestions
          draft={draft}
          figureName={figure?.name_en || null}
          onPickHadith={async (row) => {
            try {
              const res = await fetch("/api/hadith", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url: row.sunnah_com_url,
                  reference_text: `${row.collection_name} ${row.hadith_number}`,
                  narrator: row.narrator,
                  arabic_text: row.arabic_text,
                  translation_en: row.english_text,
                }),
              });
              if (!res.ok) return;
              const { hadith } = await res.json();
              await fetch(`/api/posts/${postId}/hadith`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hadith_id: hadith.id }),
              });
              loadPost();
            } catch {
              /* noop */
            }
          }}
          onPickAyah={async (ayah) => {
            try {
              const current =
                ((post as unknown as { quran_refs?: unknown[] })
                  .quran_refs as unknown[]) || [];
              const next = [
                ...current,
                {
                  verse_key: ayah.verse_key,
                  text_uthmani: ayah.text_uthmani,
                  translation_en: ayah.translation_en,
                },
              ];
              await save({
                quran_refs: next,
              } as unknown as Partial<Post>);
            } catch {
              /* noop */
            }
          }}
        />

        {figure ? (
          <FigureContextPanel
            figureId={figure.id}
            postId={post.id}
            attachedHadithIds={attachedIds}
            onPickHookAngle={(text) => {
              save({ hook_selected: text });
              if (!draft.trim()) {
                setDraft(text + "\n\n");
              } else {
                setDraft(text + "\n\n" + draft);
              }
            }}
            onAttachedHadith={loadPost}
            onAttachedAyah={loadPost}
          />
        ) : null}

        <HookGenerator
          postId={post.id}
          onPick={(h) => {
            save({ hook_selected: h.text });
            if (!draft.trim()) {
              setDraft(h.text + "\n\n");
            } else {
              setDraft(h.text + "\n\n" + draft);
            }
          }}
        />

        <SlopChecker content={draft} postId={post.id} />

        <ImagePicker
          imageUrl={post.image_url}
          imageRationale={post.image_rationale}
          onChange={(image_url, image_rationale) => {
            save({ image_url, image_rationale });
            setPost({ ...post, image_url, image_rationale });
          }}
        />

        <TypefullyPush
          postId={post.id}
          content={draft}
          platform={post.platform}
          imageUrl={post.image_url}
          onScheduled={() => {
            save({ status: "scheduled" });
          }}
        />

        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">
              Hadith references ({attached.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCorpusOpen((v) => !v)}
                className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
              >
                {corpusOpen ? "Hide corpus" : "Search corpus"}
              </button>
            </div>
          </div>

          {corpusOpen ? (
            <div className="mb-4 rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
              <SearchCorpus
                onAdded={() => {
                  loadPost();
                }}
              />
            </div>
          ) : null}

          {attached.length === 0 ? (
            <div className="text-[12px] text-white/40">
              No references attached. Attach from the list below or search the
              corpus.
            </div>
          ) : (
            <ul className="space-y-1 mb-4">
              {attached.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-3 p-2 rounded bg-white/[0.02] border border-white/[0.04]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-white/85 truncate">
                      {h.reference_text}
                    </div>
                    {h.sunnah_com_url ? (
                      <a
                        href={h.sunnah_com_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-white/40 hover:text-white/70 truncate block underline underline-offset-2"
                      >
                        {h.sunnah_com_url}
                      </a>
                    ) : null}
                  </div>
                  <button
                    onClick={() => detachHadith(h.id)}
                    className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/50 hover:text-white"
                  >
                    Detach
                  </button>
                </li>
              ))}
            </ul>
          )}

          {availableHadith.length > 0 ? (
            <details className="text-[12px] text-white/70">
              <summary className="cursor-pointer hover:text-white/90 pb-2">
                Attach existing reference ({availableHadith.length} available)
              </summary>
              <ul className="space-y-1">
                {availableHadith.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-white/[0.03]"
                  >
                    <div className="flex-1 min-w-0 truncate">{h.reference_text}</div>
                    <button
                      onClick={() => attachHadith(h.id)}
                      className="px-2 py-1 rounded text-[11px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
                    >
                      Attach
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}

function ConvertPreviews({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <div className="mt-3 text-[11px] text-white/40">
        Type something in the draft above to preview it on other platforms.
      </div>
    );
  }
  const items: Array<{ label: string; text: string; limit: number }> = [
    { label: "X", text: linkedinToX(content), limit: PLATFORMS.x.charLimit },
    {
      label: "Instagram",
      text: linkedinToInstagram(content),
      limit: PLATFORMS.instagram.charLimit,
    },
    {
      label: "Facebook",
      text: linkedinToFacebook(content),
      limit: PLATFORMS.facebook.charLimit,
    },
  ];
  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2.5"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-white/75">
              {it.label}
            </span>
            <span className="text-[10px] text-white/40 tabular-nums">
              {it.text.length} / {it.limit.toLocaleString()}
            </span>
          </div>
          <div className="text-[11px] text-white/75 whitespace-pre-wrap leading-relaxed">
            {it.text}
          </div>
        </div>
      ))}
    </div>
  );
}
