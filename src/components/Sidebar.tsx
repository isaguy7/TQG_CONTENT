"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  Film,
  Calendar as CalendarIcon,
  Settings as SettingsIcon,
  Video,
  BookOpen,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const primaryNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/figures", label: "Figures", icon: Users },
  { href: "/clips", label: "Clips", icon: Film },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
];

const secondaryNav: NavItem[] = [
  { href: "/video", label: "Video", icon: Video },
  { href: "/hadith", label: "Hadith", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

type Draft = {
  id: string;
  title: string | null;
  status: "idea" | "drafting" | "review" | "ready" | "scheduled" | "published";
  updated_at: string;
};

const statusBorder: Record<Draft["status"], string> = {
  idea: "border-l-2 border-white/15",
  drafting: "border-l-2 border-status-drafting",
  review: "border-l-2 border-status-drafting",
  ready: "border-l-2 border-status-ready",
  scheduled: "border-l-2 border-status-published",
  published: "border-l-2 border-status-published",
};

export function Sidebar() {
  const pathname = usePathname();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/posts?limit=8");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { posts } = (await res.json()) as { posts: Draft[] };
        const open = posts.filter(
          (p) => p.status !== "published" && p.status !== "scheduled"
        );
        setDrafts(open.slice(0, 8));
      } catch {
        setDrafts([]);
      } finally {
        setDraftsLoaded(true);
      }
    };
    load();
  }, [pathname]);

  return (
    <aside className="w-52 shrink-0 bg-sidebar border-r border-white/[0.06] flex flex-col">
      <div className="h-12 flex items-center px-4 border-b border-white/[0.06]">
        <span className="text-[13px] font-semibold tracking-tight text-white/90">
          TQG Studio
        </span>
      </div>

      <nav className="pt-3 pb-2 px-2">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname || ""} />
        ))}
      </nav>

      <div className="mt-1 border-t border-white/[0.04] pt-2 pb-3 px-2">
        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname || ""} />
        ))}
      </div>

      <div className="px-4 pt-2 pb-1.5 flex items-center justify-between">
        <span className="section-label">Drafts</span>
        <Link
          href="/content"
          className="text-[10px] text-white/35 hover:text-white/70 uppercase tracking-wider"
        >
          View all →
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {!draftsLoaded ? (
          <div className="px-3 py-1.5 text-[11px] text-white/30">Loading…</div>
        ) : drafts.length === 0 ? (
          <Link
            href="/content"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] text-white/50 hover:text-primary-bright hover:bg-white/[0.03] transition-colors"
          >
            <Plus className="w-3 h-3" />
            New draft
          </Link>
        ) : (
          drafts.map((d) => (
            <Link
              key={d.id}
              href={`/content/${d.id}`}
              className={cn(
                "block pl-3 pr-2 py-1.5 rounded hover:bg-white/[0.04] transition-colors",
                statusBorder[d.status]
              )}
            >
              <div className="text-[12px] text-white/80 truncate leading-tight">
                {d.title || "Untitled"}
              </div>
              <div className="text-[10px] text-white/35 mt-0.5">
                {formatRelative(d.updated_at)}
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/[0.06] text-[10px] text-white/30">
        v1.0
      </div>
    </aside>
  );
}

function NavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const { href, label, icon: Icon } = item;
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-[13px] rounded transition-colors",
        active
          ? "bg-primary/15 text-primary-bright font-medium"
          : "text-white/60 hover:text-white/95 hover:bg-white/[0.04]"
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary-bright" : "text-white/45")} />
      {label}
    </Link>
  );
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}
