import { PageShell, StubPlaceholder } from "@/components/PageShell";

export default function ContentPage() {
  return (
    <PageShell
      title="Content"
      description="Drafts, reviews, and published posts"
    >
      <StubPlaceholder phase="Phase 1 (video+transcription) then Phase 2 (hadith kernel)" />
    </PageShell>
  );
}
