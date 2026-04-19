import { Mark, markInputRule, markPasteRule } from "@tiptap/core";

/**
 * Regex-based hashtag mark. Fires when the user types a space, enter, or
 * punctuation after a `#word` pattern — the preceding #foo gets wrapped
 * with this mark. Also matches hashtags inside pasted content.
 *
 * Word pattern: [A-Za-z0-9_] — matches Twitter/LinkedIn conventions.
 * No suggestion dropdown; hashtags are freeform user-authored strings.
 *
 * Plain-text export: editor.getText() emits the #foo literally.
 */
// Input rule: trailing boundary char triggers the mark on the preceding
// #word. `$` in an input-rule regex anchors to the cursor position, not
// end of string, so this fires exactly when the user types the trailing
// char.
const INPUT_REGEX = /(^|\s)(#[A-Za-z0-9_]+)([\s.,;:!?])$/;

// Paste rule: match all hashtag instances anywhere in pasted text. Global
// flag required by markPasteRule.
const PASTE_REGEX = /(^|\s)(#[A-Za-z0-9_]+)(?=\s|$|[.,;:!?])/g;

export const HashtagMark = Mark.create({
  name: "hashtag",

  inclusive: false,

  parseHTML() {
    return [{ tag: "span[data-hashtag]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        ...HTMLAttributes,
        "data-hashtag": "true",
        class: "tqg-hashtag text-zinc-400",
      },
      0,
    ];
  },

  addInputRules() {
    return [
      markInputRule({
        find: INPUT_REGEX,
        type: this.type,
        // match[2] is the #word; we don't want the leading space or the
        // trailing punctuation to get marked.
        getAttributes: () => ({}),
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: PASTE_REGEX,
        type: this.type,
      }),
    ];
  },
});
