"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { PLATFORMS, type PlatformId } from "@/lib/platform-rules";
import { cn } from "@/lib/utils";

export interface CharacterCounterProps {
  editor: Editor | null;
  /**
   * Platform whose thresholds drive the counter. When the active variant
   * is "canonical", pass the post's primary platform (platforms[0] or
   * fallback to "linkedin"). When a variant tab is active, pass that
   * variant's platform.
   */
  platform: PlatformId;
}

type Tone = "neutral" | "warn" | "over";

function toneFor(count: number, warnAt: number, charLimit: number): Tone {
  if (count > charLimit) return "over";
  if (count >= warnAt) return "warn";
  return "neutral";
}

export function CharacterCounter({ editor, platform }: CharacterCounterProps) {
  // Subscribe to editor updates so the counter rerenders on every keystroke.
  // editor.storage.characterCount.characters() is synchronous and cheap.
  const [count, setCount] = useState(() =>
    editor?.storage.characterCount?.characters() ?? 0
  );

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      setCount(editor.storage.characterCount?.characters() ?? 0);
    };
    update();
    editor.on("update", update);
    editor.on("transaction", update);
    return () => {
      editor.off("update", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const cfg = PLATFORMS[platform];
  const tone = toneFor(count, cfg.warnAt, cfg.charLimit);
  const toneClass =
    tone === "over"
      ? "text-danger"
      : tone === "warn"
        ? "text-amber-400"
        : "text-white/55";

  return (
    <span
      className={cn("text-[12px] tabular-nums font-medium", toneClass)}
      aria-live="polite"
    >
      {count.toLocaleString()} / {cfg.charLimit.toLocaleString()}
      <span className="ml-1 text-white/35 font-normal">· {cfg.label}</span>
    </span>
  );
}
