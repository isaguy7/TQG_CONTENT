import { PageShell } from "@/components/PageShell";
import Link from "next/link";
import { FileText, Film, Video, Calendar as CalendarIcon } from "lucide-react";

const quickCreate = [
  { href: "/content/new", label: "New post", icon: FileText },
  { href: "/clips/new", label: "New clip batch", icon: Film },
  { href: "/video/new", label: "New video project", icon: Video },
];

const phaseProgress = [
  { phase: "Phase 0", name: "Scaffold + Supabase", status: "in-progress" },
  { phase: "Phase 1", name: "Video download + transcription", status: "pending" },
  { phase: "Phase 2", name: "Hadith verification kernel", status: "pending" },
  { phase: "Phase 3", name: "Islamic figures MVP", status: "pending" },
  { phase: "Phase 4", name: "Quran local corpus + matcher", status: "pending" },
  { phase: "Phase 5", name: "Short-form clip batch creator", status: "pending" },
];

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Weekly content overview and quick actions"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="flex items-center gap-2 mb-3">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">This week</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Calendar view lands in Phase 4 (deferred to v2). For now, manage
              posts directly from the Content tab.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold mb-4">Build progress</h2>
            <ul className="space-y-2">
              {phaseProgress.map((p) => (
                <li
                  key={p.phase}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {p.phase}
                    </span>{" "}
                    · {p.name}
                  </span>
                  <span
                    className={
                      p.status === "in-progress"
                        ? "text-warning"
                        : "text-muted-foreground"
                    }
                  >
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold mb-3">Quick create</h2>
            <ul className="space-y-2">
              {quickCreate.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 text-xs text-muted-foreground space-y-2">
            <p>
              <span className="text-foreground font-medium">Target:</span> 2
              LinkedIn originals + 3 TQG reposts per week.
            </p>
            <p>
              <span className="text-foreground font-medium">X clips:</span>{" "}
              daily at 8pm BST once Phase 5 ships.
            </p>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
