"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { SuggestionProps } from "@tiptap/suggestion";
import { cn } from "@/lib/utils";

export interface FigureSuggestionItem {
  id: string;
  name_en: string;
  name_ar: string | null;
  title: string | null;
  type: string;
}

export interface MentionSuggestionRef {
  onKeyDown: (evt: { event: KeyboardEvent }) => boolean;
}

/**
 * Popover list rendered by Tippy when the user types @ in the editor.
 * ref exposes onKeyDown so the Tiptap suggestion plugin can forward
 * arrow-key / enter / escape events without stealing focus from the
 * editor.
 */
export const MentionSuggestion = forwardRef<
  MentionSuggestionRef,
  SuggestionProps<FigureSuggestionItem>
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = props.items;

  useEffect(() => setSelectedIndex(0), [items]);

  const select = (index: number) => {
    const item = items[index];
    if (item) {
      props.command({ id: item.id, label: item.name_en } as Record<
        string,
        unknown
      >);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        select(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-white/[0.08] bg-zinc-900 text-[12px] text-white/55 px-3 py-2 shadow-xl shadow-black/40">
        No figures match
      </div>
    );
  }

  return (
    <ul
      className="min-w-[220px] max-h-[260px] overflow-y-auto rounded-md border border-white/[0.08] bg-zinc-900 py-1 shadow-xl shadow-black/40"
      role="listbox"
    >
      {items.map((item, i) => (
        <li key={item.id}>
          <button
            type="button"
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              // Prevent editor blur before command fires.
              e.preventDefault();
              select(i);
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px]",
              i === selectedIndex
                ? "bg-[#1B5E20]/25 text-white"
                : "text-white/85 hover:bg-white/[0.05]"
            )}
          >
            <span className="flex-1 truncate">
              <span className="text-white/95">{item.name_en}</span>
              {item.name_ar ? (
                <span className="ml-1.5 text-white/40">· {item.name_ar}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/35">
              {item.type}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
});

MentionSuggestion.displayName = "MentionSuggestion";
