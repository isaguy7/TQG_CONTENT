import Mention from "@tiptap/extension-mention";
import { mentionSuggestionConfig } from "./mention-suggestion-config";

/**
 * Figure mention: '*' triggers a popover of islamic_figures rows.
 * Selection inserts a Mention node carrying { id, label }, rendered as
 * a TQG-green pill in the editor.
 *
 * '@' is reserved for future platform-mention support (tagging real
 * users on LinkedIn/X); platform-mention extensions land in §10-§12
 * when the adapters ship.
 *
 * Plain-text export: editor.getText() renders each mention as
 * "*{label}" — single-word-ish, no spaces, good for copying into
 * platforms that don't support structured mentions.
 */
export const MentionFigure = Mention.extend({
  renderText({ node }) {
    return `*${(node.attrs.label as string | undefined) ?? ""}`;
  },
}).configure({
  HTMLAttributes: {
    class:
      "tqg-mention inline-flex items-center rounded px-1 py-0.5 bg-[#1B5E20]/20 text-[#4CAF50] text-[13px] font-medium",
  },
  suggestion: mentionSuggestionConfig,
});
