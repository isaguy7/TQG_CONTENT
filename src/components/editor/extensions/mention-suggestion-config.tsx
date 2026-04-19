"use client";

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  MentionSuggestion,
  type FigureSuggestionItem,
  type MentionSuggestionRef,
} from "./MentionSuggestion";

// Fetch-all-and-filter strategy: 15 figures today, 70 after §6 seed lands.
// Both are small enough to fetch once and filter in-memory. No server-side
// search endpoint needed; avoids a round-trip per keystroke.
let figuresPromise: Promise<FigureSuggestionItem[]> | null = null;

async function fetchFigures(): Promise<FigureSuggestionItem[]> {
  if (figuresPromise) return figuresPromise;
  figuresPromise = (async () => {
    try {
      const res = await fetch("/api/figures", { cache: "no-store" });
      if (!res.ok) return [];
      const json = (await res.json()) as { figures?: FigureSuggestionItem[] };
      return json.figures ?? [];
    } catch {
      // Network failure — return empty so the popover shows "No figures
      // match" rather than hanging or erroring.
      figuresPromise = null; // let next open retry
      return [];
    }
  })();
  return figuresPromise;
}

function filterFigures(
  all: FigureSuggestionItem[],
  query: string
): FigureSuggestionItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, 10);
  const matches = all.filter((f) => {
    const hay = `${f.name_en} ${f.name_ar ?? ""} ${f.title ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
  return matches.slice(0, 10);
}

export const mentionSuggestionConfig: Omit<
  SuggestionOptions<FigureSuggestionItem>,
  "editor"
> = {
  char: "@",
  items: async ({ query }) => {
    const all = await fetchFigures();
    return filterFigures(all, query);
  },
  render: () => {
    let component: ReactRenderer<MentionSuggestionRef> | null = null;
    let popup: TippyInstance[] | null = null;

    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionSuggestion, {
          props,
          editor: props.editor,
        });
        if (!props.clientRect) return;
        popup = tippy("body", {
          getReferenceClientRect: () => {
            const r = props.clientRect?.();
            // tippy requires a non-null DOMRect-like object
            return r ?? new DOMRect();
          },
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
          // Keep the popover unstyled — list styles live in MentionSuggestion.
          theme: "tqg-mention",
        });
      },
      onUpdate: (props) => {
        component?.updateProps(props);
        if (!props.clientRect) return;
        popup?.[0]?.setProps({
          getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
        });
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return component?.ref?.onKeyDown({ event: props.event }) ?? false;
      },
      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
        popup = null;
        component = null;
      },
    };
  },
};
