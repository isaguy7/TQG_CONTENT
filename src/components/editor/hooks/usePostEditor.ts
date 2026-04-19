"use client";

import { useEffect, useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import CharacterCount from "@tiptap/extension-character-count";
import type { JSONContent } from "@tiptap/core";
import type { TiptapJson } from "@/types/post";

/**
 * Minimum subset of a Post the editor needs. Declared here (rather than
 * importing the full Post type) so callers with narrower local post shapes
 * can pass through without a full type migration.
 */
export interface PostEditorSource {
  content_json: TiptapJson | null;
  final_content: string | null;
}

export interface UsePostEditorOptions {
  post: PostEditorSource;
  /** Fires on every keystroke with plain-text content. Convenience for
   *  downstream consumers (char counter mirror, PublishPanel preview). */
  onPlainTextChange?: (text: string) => void;
  /** Fires on every keystroke with the editor instance. Richer callback
   *  used by useAutosave to capture full {text, html, json} snapshots. */
  onUpdate?: (editor: Editor) => void;
  /** Fires when the editor loses focus, with the editor instance. */
  onBlur?: (editor: Editor) => void;
}

/**
 * Configured Tiptap editor for post content. Loads content_json when
 * present; falls back to wrapping final_content as paragraphs for legacy
 * rows (posts created before V10 §5 editor).
 *
 * StarterKit is configured without headings per V10 §5 — post bodies are
 * flat paragraph streams; platform renderers don't honor heading styles.
 *
 * SSR note: immediatelyRender=false is required in the App Router so the
 * initial SSR pass doesn't try to instantiate ProseMirror in a Node env.
 * First render returns null; the client hydrates with a real editor.
 *
 * Callback indirection: Tiptap's useEditor captures options on first mount
 * and never re-reads them. We stash handlers in refs so the editor's
 * onUpdate / onBlur always dispatch to the *current* parent callback, not
 * a stale closure from first render.
 */
export function usePostEditor({
  post,
  onPlainTextChange,
  onUpdate,
  onBlur,
}: UsePostEditorOptions): Editor | null {
  const plainTextRef = useRef(onPlainTextChange);
  const updateRef = useRef(onUpdate);
  const blurRef = useRef(onBlur);
  useEffect(() => {
    plainTextRef.current = onPlainTextChange;
  }, [onPlainTextChange]);
  useEffect(() => {
    updateRef.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    blurRef.current = onBlur;
  }, [onBlur]);

  return useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      // No hard limit here — the PlatformCharacterCounter renders a
      // visual warning when the active platform's warn threshold is
      // crossed. Blocking input at the limit is unfriendly when the
      // user is iterating across multiple platforms with different caps.
      CharacterCount.configure({ limit: null }),
    ],
    content: resolveInitialContent(post),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "tiptap-post-editor focus:outline-none min-h-[380px] text-[15px] text-white/90 leading-[1.8] tracking-[0.005em] prose prose-invert max-w-none",
      },
    },
    onUpdate: ({ editor }) => {
      plainTextRef.current?.(editor.getText());
      updateRef.current?.(editor);
    },
    onBlur: ({ editor }) => {
      blurRef.current?.(editor);
    },
  });
}

function resolveInitialContent(post: PostEditorSource): JSONContent {
  // Prefer the authoritative Tiptap JSON when the row has one.
  if (post.content_json) {
    return post.content_json as JSONContent;
  }

  // Legacy path: wrap plain text as a paragraph stream. Blank-line
  // separators become paragraph breaks; single newlines stay inline (hard
  // break) so we don't split sentence fragments across paragraphs.
  const raw = post.final_content ?? "";
  if (!raw.trim()) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map<JSONContent>((chunk) => {
      const lines = chunk.split("\n");
      const content: JSONContent[] = [];
      lines.forEach((line, i) => {
        if (line.length > 0) content.push({ type: "text", text: line });
        if (i < lines.length - 1) content.push({ type: "hardBreak" });
      });
      return { type: "paragraph", content };
    });

  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  };
}
