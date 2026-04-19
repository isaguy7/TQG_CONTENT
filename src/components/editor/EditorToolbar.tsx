"use client";

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditorToolbarProps {
  editor: Editor | null;
}

/**
 * Minimal formatting toolbar. V10 §5 scaffold — Bold, Italic, Link,
 * Bullet list, Ordered list, Blockquote. Keyboard shortcuts still work
 * via StarterKit's defaults (⌘B, ⌘I, ⌘K on mac equivalents).
 */
export function EditorToolbar({ editor }: EditorToolbarProps) {
  // Force rerender on selection changes so button "active" states stay
  // in sync with cursor position / selection.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const trigger = () => forceUpdate((n) => n + 1);
    editor.on("selectionUpdate", trigger);
    editor.on("transaction", trigger);
    return () => {
      editor.off("selectionUpdate", trigger);
      editor.off("transaction", trigger);
    };
  }, [editor]);

  const toggleLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previous ?? "https://");
    if (url === null) return; // cancelled
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className="flex items-center gap-0.5 border-b border-white/[0.06] pb-2 mb-3"
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold (⌘B)"
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic (⌘I)"
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("link")}
        onClick={toggleLink}
        label="Link"
      >
        <LinkIcon className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bullet list"
      >
        <List className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered list"
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        label="Blockquote"
      >
        <Quote className="w-3.5 h-3.5" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarSeparator() {
  return <span className="mx-1 h-4 w-px bg-white/[0.08]" aria-hidden="true" />;
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded transition-colors",
        active
          ? "bg-white/[0.1] text-white/95"
          : "text-white/55 hover:text-white/90 hover:bg-white/[0.05]"
      )}
    >
      {children}
    </button>
  );
}
