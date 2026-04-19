"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/core";
import { X } from "lucide-react";
import { ListSkeleton, ErrorState } from "@/components/shared/SafeList";
import type { TiptapJson, PostVersion } from "@/types/post";
import { cn } from "@/lib/utils";
import { MentionFigure } from "./extensions/MentionFigure";
import { HashtagMark } from "./extensions/HashtagMark";

export interface VersionHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  currentVersion: number;
  onRestore: (args: {
    json: JSONContent;
    html: string | null;
    text: string | null;
  }) => void;
}

type VersionRow = Pick<
  PostVersion,
  "id" | "version" | "content" | "content_html" | "content_json" | "saved_at" | "saved_by"
>;

type VersionsResponse = { versions: VersionRow[] };

function formatRelative(isoLike: string): string {
  const saved = new Date(isoLike);
  const diffSec = Math.round((Date.now() - saved.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return saved.toLocaleString();
}

function shortUser(userId: string | null): string {
  if (!userId) return "—";
  return `User ${userId.slice(0, 6)}`;
}

export function VersionHistoryDialog({
  open,
  onClose,
  postId,
  currentVersion,
  onRestore,
}: VersionHistoryDialogProps) {
  const { data, isLoading, error, refetch } = useQuery<VersionsResponse>({
    queryKey: ["post-versions", postId],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}/versions`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as VersionsResponse;
    },
    enabled: open,
  });

  // Re-fetch when the dialog opens fresh — covers the case where the
  // user saved new versions after the last dialog close.
  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);

  const versions = data?.versions ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default to the top of the list once data loads.
  useEffect(() => {
    if (versions.length > 0 && !selectedId) {
      setSelectedId(versions[0].id);
    }
    if (!open) setSelectedId(null);
  }, [versions, selectedId, open]);

  const selected = useMemo(
    () => versions.find((v) => v.id === selectedId) ?? null,
    [versions, selectedId]
  );

  // Escape-to-close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Version history"
    >
      <div
        className="w-full max-w-4xl h-[80vh] rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl shadow-black/60 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-[14px] font-semibold text-white/90">
            Version history
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="p-1.5 rounded text-white/55 hover:text-white/90 hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {isLoading ? (
          <div className="flex-1 p-5">
            <ListSkeleton />
          </div>
        ) : error ? (
          <div className="flex-1 p-5">
            <ErrorState message={(error as Error).message} />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-5">
            <div className="text-[13px] text-white/55 max-w-sm">
              No version history yet. Save this post to start tracking
              versions. Older posts created before V10 may not have
              history until you edit them.
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-[320px_1fr]">
            <aside className="border-r border-white/[0.06] overflow-y-auto">
              <ul>
                {versions.map((v) => {
                  const isCurrent = v.version === currentVersion;
                  const isActive = v.id === selectedId;
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(v.id)}
                        className={cn(
                          "w-full text-left px-4 py-3 border-b border-white/[0.04] transition-colors",
                          isActive
                            ? "bg-zinc-800/60"
                            : "hover:bg-white/[0.03]"
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[13px] font-semibold text-white/90 tabular-nums">
                            v{v.version}
                          </span>
                          {isCurrent ? (
                            <span className="text-[10px] uppercase tracking-wider text-[#4CAF50] font-medium">
                              current
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-white/55 mt-1">
                          {formatRelative(v.saved_at)}
                        </div>
                        <div className="text-[11px] text-white/35 mt-0.5 truncate">
                          {shortUser(v.saved_by)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="flex flex-col min-h-0">
              {selected ? (
                <>
                  <div className="flex-1 overflow-y-auto p-5">
                    <VersionPreview version={selected} />
                  </div>
                  <div className="border-t border-white/[0.06] px-5 py-3 flex items-center justify-end gap-3">
                    <span className="text-[11px] text-white/45">
                      Restoring forks forward — current version stays in
                      history.
                    </span>
                    <button
                      type="button"
                      disabled={selected.version === currentVersion}
                      onClick={() => {
                        onRestore({
                          json:
                            (selected.content_json as JSONContent | null) ??
                            plainTextToJson(selected.content ?? ""),
                          html: selected.content_html,
                          text: selected.content,
                        });
                        onClose();
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                        selected.version === currentVersion
                          ? "bg-white/[0.05] text-white/35 cursor-not-allowed"
                          : "bg-[#1B5E20] text-white hover:bg-[#256a2b]"
                      )}
                    >
                      {selected.version === currentVersion
                        ? "Current version"
                        : "Restore this version"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[13px] text-white/45">
                  Pick a version to preview.
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only Tiptap instance for the preview pane. Re-renders fresh on
 * each selected-version change so the ProseMirror state doesn't hold
 * stale content between selections.
 */
function VersionPreview({ version }: { version: VersionRow }) {
  const content: JSONContent = useMemo(() => {
    if (version.content_json) return version.content_json as JSONContent;
    return plainTextToJson(version.content ?? "");
  }, [version.content_json, version.content]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: false }),
        Link.configure({ openOnClick: false, autolink: true }),
        MentionFigure,
        HashtagMark,
      ],
      content,
      editable: false,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "tiptap-version-preview focus:outline-none text-[14px] text-white/85 leading-[1.7] prose prose-invert max-w-none",
        },
      },
    },
    [version.id]
  );

  if (!editor) {
    return (
      <div className="text-[13px] text-white/35">Loading preview…</div>
    );
  }

  return <EditorContent editor={editor} />;
}

function plainTextToJson(text: string): JSONContent {
  const trimmed = text.trim();
  if (!trimmed) return { type: "doc", content: [{ type: "paragraph" }] };
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map<JSONContent>((chunk) => {
      const lines = chunk.split("\n");
      const inner: JSONContent[] = [];
      lines.forEach((line, i) => {
        if (line.length > 0) inner.push({ type: "text", text: line });
        if (i < lines.length - 1) inner.push({ type: "hardBreak" });
      });
      return { type: "paragraph", content: inner };
    });
  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  };
}

// Also allow TiptapJson callers to use plainTextToJson through a typed import.
export type { TiptapJson };
