import { PageShell } from "@/components/PageShell";
import { TranscribeWorkflow } from "@/components/TranscribeWorkflow";
import Link from "next/link";

export default function NewPostPage() {
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
            transcript. The blank-draft workflow wires up in Phase 2 once the
            hadith verification kernel is in place.
          </p>
          <Link
            href="/content"
            className="inline-block mt-3 text-[12px] text-white/50 hover:text-white/80 underline underline-offset-2"
          >
            Back to drafts
          </Link>
        </section>
      </div>
    </PageShell>
  );
}
