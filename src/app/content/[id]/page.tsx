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
  const [publishMsg, setPublishMsg] = useState<
    | { ok: true }
    | { ok: false; message: string; unverified?: Array<{ id: string; reference_text: string }> }
    | null
  >(null);
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

  const tryPublish = async () => {
    setPublishMsg(null);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
      if (res.status === 422) {
        const err = (await res.json()) as {
          message: string;
          unverified: Array<{ id: string; reference_text: string }>;
        };
        setPublishMsg({
          ok: false,
          message: err.message,
          unverified: err.unverified,
        });
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setPublishMsg({ ok: false, message: err.error || `HTTP ${res.status}` });
        return;
      }
      const { post } = (await res.json()) as { post: Post };
      setPost(post);
      setPublishMsg({ ok: true });
    } catch (err) {
      setPublishMsg({ ok: false, message: (err as Error).message });
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
    if (!confirm("Delete this draft?")) return;
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
  const unverifiedAttached = attached.filter((h) => !h.verified);

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
        {figure ? (
          <div className="flex items-center justify-center">
            <Link
              href={`/figures`}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] text-white/70 hover:text-white hover:bg-white/[0.05]"
            >
              <span className="text-white/40">About:</span>
              <span className="font-medium">{figure.name_en}</span>
              {figure.name_ar ? (
                <span className="text-white/40">· {figure.name_ar}</span>
              ) : null}
            </Link>
          </div>
        ) : null}

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
                <option value="ready" disabled>
                  ready (use Publish button)
                </option>
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
              {unverifiedAttached.length > 0 ? (
                <span className="text-[11px] text-danger">
                  {unverifiedAttached.length} unverified — blocks publish
                </span>
              ) : attached.length > 0 ? (
                <span className="text-[11px] text-primary-bright">
                  All verified
                </span>
              ) : null}
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
              <div className="mt-3 text-[11px] text-white/40">
                Corpus Adds create an UNVERIFIED reference. Attach it to the
                post from the list below once it appears.
              </div>
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
                  <span
                    className={cn(
                      "shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium",
                      h.verified
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-danger/15 text-danger"
                    )}
                  >
                    {h.verified ? "Verified" : "Unverified"}
                  </span>
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
                    <span
                      className={cn(
                        "shrink-0 w-2 h-2 rounded-full",
                        h.verified ? "bg-emerald-400" : "bg-danger"
                      )}
                    />
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

          <div className="mt-3 text-[11px] text-white/40">
            Manage references on the{" "}
            <Link
              href="/hadith"
              className="underline underline-offset-2 hover:text-white/70"
            >
              Hadith verification page
            </Link>
            . Every reference — including ones added from the local corpus —
            starts UNVERIFIED.
          </div>
        </section>

        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="section-label">Publish gate</span>
            <button
              onClick={tryPublish}
              disabled={post.status === "ready" || post.status === "published"}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {post.status === "ready" || post.status === "published"
                ? "Already ready"
                : "Mark as ready"}
            </button>
          </div>
          <p className="text-[12px] text-white/50 leading-relaxed">
            Status can only transition to <span className="text-white/80">ready</span>{" "}
            when every attached hadith reference is verified. The check runs
            in the API and at the database level — both must agree.
          </p>

          {publishMsg?.ok === false ? (
            <div className="mt-3 rounded-lg bg-danger/[0.08] border border-danger/40 p-3">
              <div className="text-[12px] text-danger font-medium mb-1">
                Blocked by publish gate
              </div>
              <div className="text-[12px] text-white/70">
                {publishMsg.message}
              </div>
              {publishMsg.unverified && publishMsg.unverified.length > 0 ? (
                <ul className="mt-2 space-y-0.5">
                  {publishMsg.unverified.map((u) => (
                    <li key={u.id} className="text-[11px] text-white/60">
                      · {u.reference_text}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link
                href="/hadith"
                className="inline-block mt-2 text-[11px] text-white/50 hover:text-white/80 underline underline-offset-2"
              >
                Go verify →
              </Link>
            </div>
          ) : publishMsg?.ok === true ? (
            <div className="mt-3 rounded-lg bg-primary/[0.08] border border-primary/40 p-3 text-[12px] text-primary-bright">
              Post marked as ready.
            </div>
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
