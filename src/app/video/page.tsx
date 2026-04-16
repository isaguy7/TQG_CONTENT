import { PageShell, StubPlaceholder } from "@/components/PageShell";

export default function VideoPage() {
  return (
    <PageShell
      title="Video projects"
      description="Download, transcribe, overlay Arabic text"
    >
      <StubPlaceholder phase="Phase 1 (download + transcribe) — long-form editor deferred to v2" />
    </PageShell>
  );
}
