import { PageShell, StubPlaceholder } from "@/components/PageShell";

export default function HadithPage() {
  return (
    <PageShell
      title="Hadith verification"
      description="Every reference must link to sunnah.com and be manually verified"
    >
      <StubPlaceholder phase="Phase 2 (safety-critical kernel)" />
    </PageShell>
  );
}
