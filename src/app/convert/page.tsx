import { PageShell, StubPlaceholder } from "@/components/PageShell";

export default function ConvertPage() {
  return (
    <PageShell
      title="Platform converter"
      description="LinkedIn to X thread, single tweet, Instagram, Facebook"
    >
      <StubPlaceholder phase="v2 (deferred from v1)" />
    </PageShell>
  );
}
