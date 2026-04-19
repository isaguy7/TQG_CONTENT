"use client";

import { useEffect } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { usePostEditor, type PostEditorSource } from "./hooks/usePostEditor";

export interface PostEditorProps {
  post: PostEditorSource;
  /** Fires on every keystroke with the current plain-text content. */
  onPlainTextChange?: (text: string) => void;
  /** Fires when the editor loses focus, with final plain-text content. */
  onBlur?: (text: string) => void;
  /**
   * Exposes the Tiptap editor instance to the parent. Parents use this to
   * programmatically insert content (e.g. from AmbientSuggestions) via
   * editor.commands.* instead of mutating plain-text state.
   */
  onReady?: (editor: Editor) => void;
  placeholder?: string;
}

/**
 * V10 §5 editor. Commit 4 scaffold: Tiptap-backed post body with
 * StarterKit + Link. Autosave, toolbar, character counter, platform
 * variants, mentions, hashtags, version history, and Copy-for-Typefully
 * land in commits 5-10.
 *
 * Content source: post.content_json (preferred) or post.final_content
 * (legacy fallback). See usePostEditor for the resolution logic.
 */
export function PostEditor({
  post,
  onPlainTextChange,
  onBlur,
  onReady,
}: PostEditorProps) {
  const editor = usePostEditor({ post, onPlainTextChange, onBlur });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  if (!editor) {
    return (
      <div className="min-h-[380px] text-[15px] text-white/25 leading-[1.8]">
        Loading editor…
      </div>
    );
  }

  return <EditorContent editor={editor} />;
}
