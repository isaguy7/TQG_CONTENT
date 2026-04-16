"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/content", label: "Content" },
  { href: "/figures", label: "Figures" },
  { href: "/clips", label: "Clips" },
  { href: "/video", label: "Video" },
  { href: "/hadith", label: "Hadith" },
  { href: "/calendar", label: "Calendar" },
  { href: "/convert", label: "Convert" },
  { href: "/settings", label: "Settings" },
];

type DraftStub = {
  id: string;
  title: string;
  status: "idea" | "drafting" | "ready" | "published";
  date: string;
};

const drafts: DraftStub[] = [
  { id: "1", title: "Abdur Rahman ibn Auf — marketplace", status: "drafting", date: "Today" },
  { id: "2", title: "Bilal's voice", status: "ready", date: "Yesterday" },
  { id: "3", title: "Mus'ab in Madinah", status: "idea", date: "2d ago" },
  { id: "4", title: "Salahuddin at Hattin", status: "published", date: "Apr 9" },
];

const statusBorder: Record<DraftStub["status"], string> = {
  ready: "border-l-2 border-status-ready",
  drafting: "border-l-2 border-status-drafting",
  idea: "border-l-2 border-white/10",
  published: "border-l-2 border-status-published",
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 shrink-0 bg-sidebar border-r border-white/[0.06] flex flex-col">
      <div className="h-12 flex items-center px-4 border-b border-white/[0.06]">
        <span className="text-[13px] font-semibold tracking-tight text-white/90">
          TQG Studio
        </span>
      </div>

      <nav className="pt-3 pb-4 px-2">
        {nav.map(({ href, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "block px-3 py-1.5 text-[13px] rounded transition-colors",
                active
                  ? "bg-white/[0.04] text-white/90"
                  : "text-white/55 hover:text-white/90 hover:bg-white/[0.02]"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pt-2 pb-1.5">
        <span className="section-label">Drafts</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {drafts.map((d) => (
          <Link
            key={d.id}
            href={`/content/${d.id}`}
            className={cn(
              "block pl-3 pr-2 py-1.5 rounded hover:bg-white/[0.03] transition-colors",
              statusBorder[d.status]
            )}
          >
            <div className="text-[12px] text-white/75 truncate leading-tight">
              {d.title}
            </div>
            <div className="text-[10px] text-white/30 mt-0.5">{d.date}</div>
          </Link>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-white/[0.06] text-[10px] text-white/30">
        v0.1 · Phase 0
      </div>
    </aside>
  );
}
