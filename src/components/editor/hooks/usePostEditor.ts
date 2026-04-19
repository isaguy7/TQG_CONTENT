"use client";

import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
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
  onPlainTextChange?: (text: string) => void;
  onBlur?: (text: string) => void;
}

/**
 * Configured Tiptap editor for post content. Loads content_json when
 * present; falls back to wrapping final_content as paragraphs for legacy
 * rows (posts created before V10 §5).
 *
 * StarterKit is configured without headings per V10 §5 — post bodies are
 * flat paragraph streams; platform renderers don't honor heading styles
 * anyway.
 *
 * SSR note: immediatelyRender=false is required in the App Router so the
 * initial SSR pass doesn't try to instantiate ProseMirror in a Node env.
 * First render returns null; the client hydrates with a real editor.
 */
export function usePostEditor({
  post,
  onPlainTextChange,
  onBlur,
}: UsePostEditorOptions): Editor | null {
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
      onPlainTextChange?.(editor.getText());
    },
    onBlur: ({ editor }) => {
      onBlur?.(editor.getText());
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
