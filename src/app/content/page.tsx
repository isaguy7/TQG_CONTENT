import { PageShell } from "@/components/PageShell";
import Link from "next/link";

export default function ContentPage() {
  return (
    <PageShell
      title="Content"
      description="Drafts, reviews, and published posts"
    >
      <div className="max-w-3xl space-y-4">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-6">
          <div className="section-label mb-2">Start a new post</div>
          <p className="text-[13px] text-white/75 leading-relaxed mb-4">
            From a video URL, or blank once the hadith verification kernel
            ships (Phase 2).
          </p>
          <Link
            href="/content/new"
            className="inline-block px-4 py-2 rounded-md text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            New post
          </Link>
        </div>
        <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-6 text-[12px] text-white/40">
          Drafts list + editor land in Phase 2. The sidebar shows placeholder
          drafts in the meantime.
        </div>
      </div>
    </PageShell>
  );
}
