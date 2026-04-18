"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { TranscribeWorkflow } from "@/components/TranscribeWorkflow";

export default function NewPostPage() {
  return (
    <Suspense
      fallback={
        <PageShell title="New post">
          <div className="text-[13px] text-white/40">Loading…</div>
        </PageShell>
      }
    >
      <NewPostInner />
    </Suspense>
  );
}

function NewPostInner() {
  const router = useRouter();
  const params = useSearchParams();
  const scheduledDate = params.get("date");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggered = useRef(false);

  useEffect(() => {
    if (!scheduledDate || triggered.current) return;
    triggered.current = true;
    setCreating(true);
    (async () => {
      try {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Untitled draft",
            platform: "linkedin",
          }),
        });
        if (!res.ok) throw new Error(`Create HTTP ${res.status}`);
        const { post } = (await res.json()) as { post: { id: string } };
        // Default to 08:00 UTC on the chosen day.
        await fetch(`/api/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduled_for: `${scheduledDate}T08:00:00.000Z`,
          }),
        });
        router.push(`/content/${post.id}`);
      } catch (err) {
        setCreating(false);
        setError((err as Error).message);
      }
    })();
  }, [scheduledDate, router]);

  if (scheduledDate) {
    return (
      <PageShell title="New post">
        <div className="text-[13px] text-white/55">
          {creating ? `Creating a draft scheduled for ${scheduledDate}…` : null}
          {error ? (
            <div className="mt-2 text-danger">{error}</div>
          ) : null}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="New post"
      description="Start from a video URL (transcribe) or blank (Phase 2+)"
    >
      <div className="max-w-3xl space-y-6">
        <section>
          <div className="section-label mb-3">From a video URL</div>
          <TranscribeWorkflow />
        </section>

        <section className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-6">
          <div className="section-label mb-2">Start blank</div>
          <p className="text-[13px] text-white/60 leading-relaxed">
            Drafting from your own knowledge as a hafiz doesn&apos;t need a
            transcript. Use the button below to spin up an empty draft and
            jump straight into the editor.
          </p>
          <div className="mt-3 flex gap-2">
            <BlankDraftButton />
            <Link
              href="/content"
              className="inline-block text-[12px] text-white/50 hover:text-white/80 underline underline-offset-2 self-center"
            >
              Back to drafts
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function BlankDraftButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled draft", platform: "linkedin" }),
    });
    if (!res.ok) {
      setBusy(false);
      return;
    }
    const { post } = (await res.json()) as { post: { id: string } };
    router.push(`/content/${post.id}`);
  };
  return (
    <button
      onClick={create}
      disabled={busy}
      className="px-3 py-1.5 rounded-md text-[12px] bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
    >
      {busy ? "Creating…" : "Blank draft"}
    </button>
  );
}
