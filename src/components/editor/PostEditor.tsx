"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { History } from "lucide-react";
import type { PlatformId } from "@/lib/platform-rules";
import type { TiptapJson } from "@/types/post";
import { usePostEditor, type PostEditorSource } from "./hooks/usePostEditor";
import { useAutosave, type SavePayload } from "./hooks/useAutosave";
import { EditorToolbar } from "./EditorToolbar";
import { CharacterCounter } from "./CharacterCounter";
import { AutosaveStatus } from "./AutosaveStatus";
import { VersionHistoryDialog } from "./VersionHistoryDialog";
import {
  PlatformVariantTabs,
  type EditorVariant,
} from "./PlatformVariantTabs";

/**
 * Per-variant content snapshot held in memory while the user edits.
 * Written to DB by useAutosave (3s debounced) and on blur (flush).
 */
export interface VariantSnapshot {
  text: string;
  html: string;
  json: JSONContent;
}

/** Mirrored from /api/posts/[id] PATCH response. Looser than the full
 *  canonical Post type so clients with narrow local shapes pass through. */
export interface ServerPostSnapshot {
  platform_versions?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface PostEditorProps {
  /** Post id for autosave's PATCH target. Stable — autosave hook is
   *  instantiated once per mount. */
  postId: string;
  post: PostEditorSource & {
    platforms?: PlatformId[] | null;
    platform_versions?: Record<string, unknown> | null;
    version?: number | null;
  };
  /** Fires on every keystroke with the current plain-text content. */
  onPlainTextChange?: (text: string) => void;
  /** Called with the server's post response after each successful save.
   *  Parent re-seeds its local Post state from this. */
  onServerUpdate?: (post: ServerPostSnapshot) => void;
  /** Exposes the Tiptap editor instance (e.g. for external insertions). */
  onReady?: (editor: Editor) => void;
}

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function PostEditor({
  postId,
  post,
  onPlainTextChange,
  onServerUpdate,
  onReady,
}: PostEditorProps) {
  const platforms = (post.platforms ?? []) as PlatformId[];
  const primaryPlatform: PlatformId = platforms[0] ?? "linkedin";

  const [activeVariant, setActiveVariant] =
    useState<EditorVariant>("canonical");
  const activeVariantRef = useRef<EditorVariant>("canonical");
  const [historyOpen, setHistoryOpen] = useState(false);

  // Per-variant in-memory working state. Canonical seeds from
  // post.content_json on editor ready; variants seed from
  // post.platform_versions or fall back to a copy of canonical.
  const variantsMap = useRef<Map<EditorVariant, VariantSnapshot>>(new Map());

  const [differsFromCanonical, setDiffersFromCanonical] = useState<
    ReadonlySet<PlatformId>
  >(() => buildDiffersSet(post, platforms));

  // Autosave hook — instantiated once per mount, variant lives on payload.
  const autosave = useAutosave({
    postId,
    onServerUpdate: (serverPost) => {
      // 1. Forward to parent so it can keep its Post state fresh.
      onServerUpdate?.(serverPost as ServerPostSnapshot);
      // 2. Re-seed variant-differs Set from authoritative server data.
      //    Fixes commit 5's stale-set-after-variant-save concern.
      setDiffersFromCanonical(
        buildDiffersSet(
          {
            final_content: (serverPost.final_content as string | null) ?? null,
            platform_versions:
              (serverPost.platform_versions as Record<string, unknown>) ?? null,
          },
          platforms
        )
      );
    },
  });

  const buildSavePayload = useCallback(
    (ed: Editor, variant: EditorVariant): SavePayload => ({
      variant,
      text: ed.getText(),
      html: ed.getHTML(),
      json: ed.getJSON(),
    }),
    []
  );

  const editor = usePostEditor({
    post,
    onPlainTextChange,
    // Route keystroke updates into the debounced autosave. triggerSave
    // overwrites any prior pending payload, so the 3s timer always ends
    // up saving the latest content.
    onUpdate: (ed) => {
      autosave.triggerSave(buildSavePayload(ed, activeVariantRef.current));
    },
    // Blur flushes immediately so explicit "I'm done editing" moments
    // don't wait 3s. The mutex inside useAutosave prevents this from
    // racing the debounced save.
    onBlur: (ed) => {
      autosave.triggerSave(buildSavePayload(ed, activeVariantRef.current));
      void autosave.flushSave();
    },
  });

  // Initial-ready: seed canonical snapshot, expose editor to parent.
  useEffect(() => {
    if (!editor) return;
    variantsMap.current.set("canonical", {
      text: editor.getText(),
      html: editor.getHTML(),
      json: editor.getJSON(),
    });
    onReady?.(editor);
  }, [editor, onReady]);

  useEffect(() => {
    activeVariantRef.current = activeVariant;
  }, [activeVariant]);

  const handleVariantChange = useCallback(
    async (next: EditorVariant) => {
      if (!editor || next === activeVariant) return;

      // 1. Flush any pending save for the outgoing variant so we don't
      //    save stale-variant content under the new variant's name.
      await autosave.flushSave();
      autosave.cancelPending();

      // 2. Capture current editor state for the outgoing variant.
      variantsMap.current.set(activeVariant, {
        text: editor.getText(),
        html: editor.getHTML(),
        json: editor.getJSON(),
      });

      // 3. Resolve incoming variant's content: in-memory first, then DB.
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

      // 4. Swap editor content without emitting an update (a load isn't
      //    a user edit — shouldn't trigger autosave).
      editor.commands.setContent(incoming.json, { emitUpdate: false });
      setActiveVariant(next);
      onPlainTextChange?.(incoming.text);
    },
    [editor, activeVariant, post, onPlainTextChange, autosave]
  );

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PlatformVariantTabs
          platforms={platforms}
          active={activeVariant}
          onChange={handleVariantChange}
          differsFromCanonical={differsFromCanonical}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Post version history"
            title="Version history"
            className="flex items-center gap-1.5 rounded-lg p-2 text-[11px] text-white/55 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
          </button>
          <AutosaveStatus
            state={autosave.state}
            onRetry={() => {
              void autosave.flushSave();
            }}
          />
        </div>
      </div>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-end">
        <CharacterCounter editor={editor} platform={primary} />
      </div>

      <VersionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        postId={postId}
        currentVersion={(post.version as number | null) ?? 0}
        onRestore={({ json }) => {
          // Natural fork-forward: setContent onto the canonical editor
          // and let autosave write a new post_versions row with the
          // restored content. Never deletes — restore appends.
          editor.commands.setContent(json, { emitUpdate: false });
          // After setContent with emitUpdate: false the editor's state
          // is updated but onUpdate didn't fire. Trigger the save
          // manually so the restored content lands in the DB + history.
          autosave.triggerSave({
            variant: "canonical",
            text: editor.getText(),
            html: editor.getHTML(),
            json: editor.getJSON(),
          });
          // Flush immediately so the user sees "Saved just now" without
          // waiting 3 seconds after closing the dialog.
          void autosave.flushSave();
          // Mirror the restored text back to the parent so downstream
          // consumers (char counter, PublishPanel, etc.) reflect the
          // restore without needing a blur.
          onPlainTextChange?.(editor.getText());
          // If the user was on a variant tab, a canonical restore means
          // variants no longer diff-match their prior canonical comparison
          // baseline. The autosave onServerUpdate will re-seed the
          // differs set from server truth, so no local action needed
          // here beyond the save itself.
          setActiveVariant("canonical");
        }}
      />
    </div>
  );
}

/**
 * Compute which platform variants currently differ from canonical on
 * plain-text content. Drives the emerald dot on variant tabs.
 */
function buildDiffersSet(
  post: {
    final_content?: string | null;
    platform_versions?: Record<string, unknown> | null;
  },
  platforms: PlatformId[]
): ReadonlySet<PlatformId> {
  const set = new Set<PlatformId>();
  const versions = (post.platform_versions ?? {}) as Record<
    string,
    { final_content?: string | null }
  >;
  for (const p of platforms) {
    const v = versions[p];
    if (!v) continue;
    if ((v.final_content ?? "") !== (post.final_content ?? "")) {
      set.add(p);
    }
  }
  return set;
}
