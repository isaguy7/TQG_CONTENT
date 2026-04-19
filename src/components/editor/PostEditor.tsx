"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { PlatformId } from "@/lib/platform-rules";
import type { TiptapJson } from "@/types/post";
import { usePostEditor, type PostEditorSource } from "./hooks/usePostEditor";
import { EditorToolbar } from "./EditorToolbar";
import { CharacterCounter } from "./CharacterCounter";
import {
  PlatformVariantTabs,
  type EditorVariant,
} from "./PlatformVariantTabs";

/**
 * Per-variant content snapshot held in memory while the user edits. Only
 * flushed to DB by the parent on blur (commit 5 scaffold); autosave in
 * commit 6 makes this persist on every debounce tick.
 */
export interface VariantSnapshot {
  text: string;
  html: string;
  json: JSONContent;
}

export interface BlurPayload extends VariantSnapshot {
  variant: EditorVariant;
}

export interface PostEditorProps {
  post: PostEditorSource & {
    platforms?: PlatformId[] | null;
    platform_versions?: Record<string, unknown> | null;
  };
  /** Fires on every keystroke with the current plain-text content. */
  onPlainTextChange?: (text: string) => void;
  /**
   * Fires when the editor loses focus with a snapshot of the active
   * variant's content. Parent dispatches to posts.content_* (canonical)
   * or posts.platform_versions[variant] (platform).
   */
  onBlur?: (payload: BlurPayload) => void;
  /** Exposes the Tiptap editor instance (e.g. for external insertions). */
  onReady?: (editor: Editor) => void;
  placeholder?: string;
}

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Variants are keyed to a single Tiptap editor instance. On tab switch
 * we save the outgoing variant's snapshot to a map and setContent with
 * the incoming variant's snapshot.
 */
export function PostEditor({
  post,
  onPlainTextChange,
  onBlur,
  onReady,
}: PostEditorProps) {
  const platforms = (post.platforms ?? []) as PlatformId[];
  const primaryPlatform: PlatformId = platforms[0] ?? "linkedin";

  const [activeVariant, setActiveVariant] =
    useState<EditorVariant>("canonical");
  const activeVariantRef = useRef<EditorVariant>("canonical");

  // variantsMap holds the working state for each variant the user has
  // visited this session. Canonical is seeded from post.content_json
  // once the editor mounts.
  const variantsMap = useRef<Map<EditorVariant, VariantSnapshot>>(new Map());

  // Tracks which stored variants differ from canonical (drives the
  // emerald dot on variant tabs). Seeded from post.platform_versions
  // on mount; updated when the user saves a variant.
  const [differsFromCanonical, setDiffersFromCanonical] = useState<
    ReadonlySet<PlatformId>
  >(() => {
    const set = new Set<PlatformId>();
    const versions = (post.platform_versions ?? {}) as Record<
      string,
      { final_content?: string | null }
    >;
    for (const p of platforms) {
      const variant = versions[p];
      if (!variant) continue;
      if ((variant.final_content ?? "") !== (post.final_content ?? "")) {
        set.add(p);
      }
    }
    return set;
  });

  const editor = usePostEditor({
    post,
    onPlainTextChange,
    onBlur: (text) => {
      const ed = editor; // closure captures editor below; safe to use ref
      if (!ed) return;
      const snapshot: VariantSnapshot = {
        text,
        html: ed.getHTML(),
        json: ed.getJSON(),
      };
      variantsMap.current.set(activeVariantRef.current, snapshot);
      onBlur?.({ variant: activeVariantRef.current, ...snapshot });
    },
  });

  // Initial-ready callback. Also capture the canonical snapshot into the
  // map so tab switches don't need to re-resolve post.content_json.
  useEffect(() => {
    if (!editor) return;
    variantsMap.current.set("canonical", {
      text: editor.getText(),
      html: editor.getHTML(),
      json: editor.getJSON(),
    });
    onReady?.(editor);
  }, [editor, onReady]);

  // Keep activeVariantRef in sync with state for the onBlur closure above.
  useEffect(() => {
    activeVariantRef.current = activeVariant;
  }, [activeVariant]);

  const handleVariantChange = useCallback(
    (next: EditorVariant) => {
      if (!editor || next === activeVariant) return;

      // 1. Capture current editor state for the outgoing variant.
      variantsMap.current.set(activeVariant, {
        text: editor.getText(),
        html: editor.getHTML(),
        json: editor.getJSON(),
      });

      // 2. Resolve incoming variant's content: in-memory first, then DB.
      let incoming = variantsMap.current.get(next);
      if (!incoming) {
        if (next === "canonical") {
          incoming = {
            text: post.final_content ?? "",
            html: "",
            json: (post.content_json as JSONContent | null) ?? EMPTY_DOC,
          };
        } else {
          const versions = (post.platform_versions ?? {}) as Record<
            string,
            {
              final_content?: string | null;
              content_html?: string | null;
              content_json?: TiptapJson | null;
            }
          >;
          const saved = versions[next];
          if (saved?.content_json) {
            incoming = {
              text: saved.final_content ?? "",
              html: (saved.content_html as string) ?? "",
              json: saved.content_json as JSONContent,
            };
          } else {
            // No saved variant yet — seed from canonical so the user
            // edits a copy rather than starting from a blank slate.
            const canonical = variantsMap.current.get("canonical");
            incoming = canonical ?? {
              text: post.final_content ?? "",
              html: "",
              json: (post.content_json as JSONContent | null) ?? EMPTY_DOC,
            };
          }
        }
        variantsMap.current.set(next, incoming);
      }

      // 3. Swap editor content. `false` = don't emit an update event (no
      // need to bounce through onPlainTextChange for a load).
      editor.commands.setContent(incoming.json, { emitUpdate: false });
      setActiveVariant(next);

      // 4. Push the new tab's plain text to the parent so the char counter
      // and downstream consumers reflect the switch.
      onPlainTextChange?.(incoming.text);
    },
    [editor, activeVariant, post, onPlainTextChange]
  );

  // Allow the parent to learn about differs-state changes when it saves
  // a variant (parent is the one that writes to DB). Exposed via ref-
  // style imperative API would be overkill for one signal — instead,
  // the parent can directly set this via the onBlur callback adding to
  // a shared state. For commit 5 we compute purely from saved state at
  // mount and update locally when the user saves.
  const markVariantSaved = useCallback(
    (variant: PlatformId, differs: boolean) => {
      setDiffersFromCanonical((prev) => {
        const next = new Set(prev);
        if (differs) next.add(variant);
        else next.delete(variant);
        return next;
      });
    },
    []
  );
  // Attach to the editor instance so the page-level save handler can
  // signal back after the DB write lands. This dodges a prop-drilling
  // callback chain for a single signal.
  useEffect(() => {
    if (!editor) return;
    (editor as unknown as { __markVariantSaved?: typeof markVariantSaved }).__markVariantSaved =
      markVariantSaved;
  }, [editor, markVariantSaved]);

  const primary = useMemo(
    () => (activeVariant === "canonical" ? primaryPlatform : activeVariant),
    [activeVariant, primaryPlatform]
  );

  if (!editor) {
    return (
      <div className="min-h-[380px] text-[15px] text-white/25 leading-[1.8]">
        Loading editor…
      </div>
    );
  }

  return (
    <div>
      <PlatformVariantTabs
        platforms={platforms}
        active={activeVariant}
        onChange={handleVariantChange}
        differsFromCanonical={differsFromCanonical}
      />
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-end">
        <CharacterCounter editor={editor} platform={primary} />
      </div>
    </div>
  );
}
