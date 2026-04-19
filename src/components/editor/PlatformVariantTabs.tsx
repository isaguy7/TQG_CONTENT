"use client";

import { PLATFORMS, type PlatformId } from "@/lib/platform-rules";
import { cn } from "@/lib/utils";

/**
 * The "variant" currently being edited. "canonical" is the post's primary
 * content (posts.content_*); platform ids are stored in
 * posts.platform_versions[platform].
 */
export type EditorVariant = "canonical" | PlatformId;

export interface PlatformVariantTabsProps {
  /** Platforms enabled on this post (post.platforms) — drives tab visibility. */
  platforms: PlatformId[];
  active: EditorVariant;
  onChange: (variant: EditorVariant) => void;
  /**
   * Set of variants whose saved content differs from the canonical
   * content. Drives the small emerald dot on each platform tab so users
   * can see at a glance which variants have been customized.
   */
  differsFromCanonical: ReadonlySet<PlatformId>;
}

export function PlatformVariantTabs({
  platforms,
  active,
  onChange,
  differsFromCanonical,
}: PlatformVariantTabsProps) {
  // Canonical always shows. Platform tabs show only when the post has
  // that platform enabled (post.platforms[] membership).
  const tabs: Array<{
    id: EditorVariant;
    label: string;
    differs: boolean;
  }> = [{ id: "canonical", label: "Canonical", differs: false }];
  for (const platform of platforms) {
    tabs.push({
      id: platform,
      label: PLATFORMS[platform].label,
      differs: differsFromCanonical.has(platform),
    });
  }

  // If the post has zero or one platform there's no meaningful variant
  // choice — suppress the tab row entirely to reduce visual noise.
  if (tabs.length <= 1) return null;

  return (
    <div
      className="flex items-center gap-1 border-b border-white/[0.06] pb-2 mb-3"
      role="tablist"
      aria-label="Content variant"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors",
              isActive
                ? "bg-white/[0.08] text-white/95"
                : "text-white/55 hover:text-white/85 hover:bg-white/[0.04]"
            )}
          >
            <span>{tab.label}</span>
            {tab.differs ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                aria-label="differs from canonical"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
