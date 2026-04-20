import { Mark, markInputRule, markPasteRule } from "@tiptap/core";

/**
 * Regex-based hashtag mark. Input rule matches a `#word` followed by a
 * whitespace character via lookahead — the lookahead is critical: it
 * detects the trailing space without consuming it, so the user's typing
 * stream stays intact. The prior implementation (three capture groups
 * with a trailing-punctuation match that *was* consumed) caused the
 * markInputRule handler to delete swaths of document.
 *
 * Word pattern: [A-Za-z0-9_] — matches Twitter/LinkedIn conventions.
 * No suggestion dropdown; hashtags are freeform user-authored strings.
 *
 * Plain-text export: editor.getText() emits the #foo literally.
 */
const INPUT_REGEX = /(?:^|\s)(#[A-Za-z0-9_]+)(?=\s)$/;

// Paste rule: match all hashtag instances anywhere in pasted text.
// Lookahead keeps trailing whitespace/punctuation out of the mark range.
const PASTE_REGEX = /(?:^|\s)(#[A-Za-z0-9_]+)(?=\s|$|[.,;:!?])/g;

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
