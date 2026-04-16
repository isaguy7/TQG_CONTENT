"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/utils";
import type { HadithRecord } from "@/components/HadithPanel";

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
  updated_at: string;
};

export default function PostEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const postId = params.id;

  const [post, setPost] = useState<Post | null>(null);
  const [attached, setAttached] = useState<HadithRecord[]>([]);
  const [allHadith, setAllHadith] = useState<HadithRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [publishMsg, setPublishMsg] = useState<
    | { ok: true }
    | { ok: false; message: string; unverified?: Array<{ id: string; reference_text: string }> }
    | null
  >(null);

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
      setAttached(hadith_refs || []);
      if (hadithRes.ok) {
        const { hadith } = (await hadithRes.json()) as { hadith: HadithRecord[] };
        setAllHadith(hadith);
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

  const attachedIds = useMemo(() => new Set(attached.map((h) => h.id)), [attached]);
  const availableHadith = useMemo(
    () => allHadith.filter((h) => !attachedIds.has(h.id)),
    [allHadith, attachedIds]
  );

  const unverifiedAttached = attached.filter((h) => !h.verified);

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

  return (
    <PageShell
      title={post.title || "Untitled draft"}
      description={`${post.platform} · ${post.status}`}
      actions={
        <>
          {saveMsg ? (
            <span className="text-[11px] text-white/40 self-center mr-2">
              {saveMsg}
            </span>
          ) : null}
          <button
            onClick={deletePost}
            className="px-3 py-1.5 rounded text-[12px] border border-white/[0.08] text-white/50 hover:text-danger hover:border-danger/40"
          >
            Delete
          </button>
        </>
      }
    >
      <div className="max-w-3xl space-y-6">
        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <label className="section-label block mb-2">Title</label>
          <input
            defaultValue={post.title || ""}
            onBlur={(e) => save({ title: e.target.value })}
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white/90 focus:outline-none focus:border-primary-hover/50"
          />

          <label className="section-label block mt-4 mb-2">Draft</label>
          <textarea
            defaultValue={post.final_content || ""}
            onBlur={(e) => save({ final_content: e.target.value })}
            placeholder="Paste or write the post body here."
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white/90 placeholder-white/25 focus:outline-none focus:border-primary-hover/50 min-h-[280px] font-mono leading-relaxed resize-y"
          />

          <div className="mt-4 flex items-center gap-4 text-[12px]">
            <label className="flex items-center gap-2">
              <span className="text-white/50">Platform:</span>
              <select
                defaultValue={post.platform}
                onChange={(e) => save({ platform: e.target.value })}
                className="bg-white/[0.03] border border-white/[0.08] rounded px-2 py-1 text-white/85"
              >
                <option value="linkedin">LinkedIn</option>
                <option value="x">X</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
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
          </div>
        </section>

        <section className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="section-label">
              Hadith references ({attached.length})
            </span>
            {unverifiedAttached.length > 0 ? (
              <span className="text-[11px] text-danger">
                {unverifiedAttached.length} unverified — blocks publish
              </span>
            ) : attached.length > 0 ? (
              <span className="text-[11px] text-primary-bright">
                All verified
              </span>
            ) : null}
          </div>

          {attached.length === 0 ? (
            <div className="text-[12px] text-white/40">
              No references attached. Attach from the list below.
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
            Add new references on the{" "}
            <Link
              href="/hadith"
              className="underline underline-offset-2 hover:text-white/70"
            >
              Hadith verification page
            </Link>
            .
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
