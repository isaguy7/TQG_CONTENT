# V10 Brand Guidelines

Visual identity, copy tone, and component styling rules.

The product is a TQG sub-brand. Recognizably related to TQG (shared palette accent), but with its own identity so it can stand alone as a SaaS.

---

## Name

**Working name (internal and V10):** TQG Content Studio

**Possible final names to consider:**
- TQG Studio
- TQG Content
- Sahih Studio
- Adab (the Arabic term for etiquette/good manners)
- Mahfil (a gathering, esp. for religious discourse)
- Minbar (the pulpit from which sermons are delivered)
- Muhaddith (one who narrates hadith — maybe too niche)

Decision deadline: before M4 launch. Can keep "TQG Content Studio" and rename later if needed.

**In code, use:** `tqg-content-studio` as repo slug, `TQG Studio` as short product name throughout UI.

**In marketing copy:** "from the team behind The Quran Group" is a valid subtitle for the first 6-12 months, strengthens trust.

---

## Visual identity

### Palette

**Core palette (dark mode first):**

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#09090B` (zinc-950) | Main app background |
| `--bg-secondary` | `#18181B` (zinc-900) | Cards, sidebar, raised surfaces |
| `--bg-tertiary` | `#27272A` (zinc-800) | Hover states, subtle dividers |
| `--border` | `#3F3F46` (zinc-700) | Borders on interactive elements |
| `--text-primary` | `#F4F4F5` (zinc-100) | Main text |
| `--text-secondary` | `#A1A1AA` (zinc-400) | Muted text, labels |
| `--text-tertiary` | `#52525B` (zinc-600) | Hints, disabled |

**TQG green (accent):**

| Token | Hex | Usage |
|---|---|---|
| `--accent` | `#1B5E20` | TQG green — primary accent, active states, focus rings |
| `--accent-glow` | `rgba(27, 94, 32, 0.5)` | Glow effect on active nav items, highlighted elements |
| `--accent-hover` | `#2E7D32` | Slightly lighter for hover on accent elements |
| `--accent-subtle` | `rgba(27, 94, 32, 0.1)` | Subtle backgrounds, tag fills |

**Semantic colors:**

| Token | Hex | Usage |
|---|---|---|
| `--success` | `#10B981` (emerald-500) | Sahih, verified, success toasts |
| `--warning` | `#F59E0B` (amber-500) | Hasan, warnings, figure gap 4-7d |
| `--danger` | `#EF4444` (red-500) | Daif, mawdu, errors, figure gap ≤3d, UNVERIFIED |
| `--info` | `#3B82F6` (blue-500) | Informational, mentions, hashtags |

**Light mode (phase 2, not M1):**
Light mode is not a blocker for M1. Build everything dark-first. Add light mode in M2 or later as a user preference.

### Typography

**Font stack:**
- UI (English): `Inter`, sans-serif (via `next/font`)
- Arabic: `Amiri`, serif (via Google Fonts) — for Quran and Arabic-heavy text
- Monospace: `JetBrains Mono` — for code, IDs, technical details

**Type scale:**

| Class | Size | Weight | Usage |
|---|---|---|---|
| `text-display` | 2.5rem / 40px | 600 | Landing page hero |
| `text-h1` | 1.875rem / 30px | 600 | Page titles |
| `text-h2` | 1.5rem / 24px | 600 | Section headings |
| `text-h3` | 1.25rem / 20px | 600 | Card headings |
| `text-base` | 0.9375rem / 15px | 400 | Body text |
| `text-sm` | 0.8125rem / 13px | 400 | Secondary info, labels |
| `text-xs` | 0.75rem / 12px | 500 | Tags, badges, timestamps |

Line heights: 1.5 for body, 1.2 for headings.

Letter-spacing: -0.01em on headings, 0 on body.

### Logo

**Wordmark:**
- Simple text: `TQG Studio` in Inter 600
- Next to it a minimal icon: could be the TQG logo (if you have one) or a minimalist glyph

**Glyph:**
- Suggestion: a stylized quill + diacritical dot (suggests writing + Arabic text)
- Or: a subtle crescent + pen crossing
- Keep it simple enough to work at 16px favicon size

Hire a designer for the final logo (Fiverr or similar, £100-200). Don't block M1-M3 on this — use a placeholder wordmark-only logo.

### Iconography

Use **Lucide** (already in the stack) as the default icon library. Consistent stroke width (1.5px), consistent size scale (16, 20, 24, 32).

For Islamic-specific icons that Lucide doesn't have (e.g. Kaaba silhouette, mosque, prayer beads), commission custom SVGs or source from Noun Project with attribution.

### Component styling

#### Cards

```
┌─────────────────────────────────┐
│  Card title                     │
│  ─────────────                  │
│  Content                        │
└─────────────────────────────────┘
```

- Background: `bg-zinc-900`
- Border: `border border-zinc-800`
- Radius: `rounded-lg` (8px)
- Padding: `p-4` or `p-6` depending on density
- Hover (if interactive): `border-zinc-700`

#### Buttons

**Primary (action):**
```tsx
<button className="
  h-9 px-4 rounded-md
  bg-[#1B5E20] hover:bg-[#2E7D32]
  text-white text-sm font-medium
  transition-colors
  focus-visible:ring-2 focus-visible:ring-[#1B5E20] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
">
```

**Secondary:**
```tsx
<button className="
  h-9 px-4 rounded-md
  bg-zinc-800 hover:bg-zinc-700
  text-zinc-200 text-sm font-medium
  border border-zinc-700
  transition-colors
">
```

**Ghost:**
```tsx
<button className="
  h-9 px-3 rounded-md
  text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800
  text-sm font-medium
  transition-colors
">
```

**Danger:**
```tsx
<button className="
  h-9 px-4 rounded-md
  bg-red-900/20 hover:bg-red-900/40
  text-red-400 hover:text-red-300
  border border-red-900/50
  text-sm font-medium
">
```

Heights: 7 (h-7) for small, 9 (h-9) for default, 10 (h-10) for large.

#### Inputs

```tsx
<input className="
  h-9 px-3 rounded-md
  bg-zinc-900 border border-zinc-800
  text-zinc-100 placeholder:text-zinc-600
  focus:border-[#1B5E20] focus:ring-1 focus:ring-[#1B5E20]
  transition-colors
" />
```

#### Badges

Grading badges use semantic colors with subtle backgrounds:

```tsx
// Sahih (green)
<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-900">
  sahih
</span>

// Hasan (amber)
<span className="... bg-amber-950/60 text-amber-400 border-amber-900">hasan</span>

// Daif (red)
<span className="... bg-red-950/60 text-red-400 border-red-900">daif</span>

// Mawdu (dark red)
<span className="... bg-red-950/80 text-red-300 border-red-900">mawdu</span>

// UNVERIFIED (prominent red)
<span className="... bg-red-950 text-red-300 border-red-800 font-semibold uppercase tracking-wide">
  unverified
</span>
```

The UNVERIFIED badge should be **visually loud** — this is a safety feature, not a decoration.

#### Modals

- Backdrop: `bg-black/60 backdrop-blur-sm`
- Content: `bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl`
- Max-width varies by purpose (sm: 400, md: 500, lg: 700, xl: 900)
- Animation: fade in backdrop, slide-up + fade content (use `@radix-ui/react-dialog` animations)

#### Toasts

Use `sonner` library (already typical in shadcn).

- Success: green accent
- Error: red accent
- Info: blue accent
- Position: bottom-right
- Duration: 4s default, 10s for errors

---

## Copy tone

### Voice attributes

- **Direct** — say what the thing does
- **Respectful** — treat the user as intelligent
- **Quiet confidence** — no hype, no exclamation marks unless genuinely warranted
- **Islamic adab** — sensitive to religious context, uses correct honorifics, never flippant about sacred content
- **Plain English** — prefer common words over jargon, even technical jargon

### Voice avoid-list

Never use:
- "Unleash", "dive deep", "unlock", "supercharge", "game-changer"
- "Let's be honest..." / "Let's face it..."
- "In this article / In this post" (we're not writing an article)
- "It's important to note that..."
- "I hope this helps!"
- Overly friendly onboarding tone ("Hey there, friend!")
- Em dashes — use parentheses or commas
- Multiple exclamation points anywhere
- Emoji in UI text (a few are OK in notification toasts if context-appropriate)

### Copy examples

**Button labels:**
- ✅ "Save draft" / ❌ "Save your draft now!"
- ✅ "Schedule" / ❌ "Schedule it!"
- ✅ "Publish" / ❌ "Publish & share!"

**Empty states:**
- ✅ "No drafts yet. Start one with New post."
- ❌ "Oh no! It looks like you don't have any drafts yet. Why not create your first?"

**Error messages:**
- ✅ "Couldn't save. Check your connection and try again."
- ❌ "Oops! Something went wrong. We're looking into it."

**Help text:**
- ✅ "The AI will not generate hadith reference numbers. You'll always be asked to verify on sunnah.com before publishing."
- ❌ "Our cutting-edge AI is trained to respect Islamic authenticity by never making up hadith! 🚀"

### Islamic-specific copy rules

- **Honorifics:** SAW after the Prophet's name, RA after sahabah, AS after prophets. In UI labels, use them consistently: "Abu Bakr (RA)" not "Abu Bakr".
- **Arabic transliteration:** use standard conventions. "Hadith" not "Hadeeth". "Quran" not "Qur'an" (simpler, accessible), but use "Qur'an" in more formal long-form content.
- **Sacred phrases:** When showing Quran verses in UI chrome (not user content), include the verse reference and full Arabic where possible. When truncating Arabic, do so on word boundaries never mid-word.
- **Salutations:** "As-salamu alaykum" is appropriate in emails from the team. Avoid in app UI (feels performative).

---

## Mode-specific considerations

### AI assistant copy

The AI output must follow voice rules automatically via system prompts. Additionally, when the AI assistant fails or declines:

- Cap exceeded: "You've used your AI budget for this month. You can still copy this context to Claude.ai."
- Quality check fails: "This draft has signs of AI voice. Try: [list of issues]."
- Hadith ref requested: "The AI won't generate hadith reference numbers. Open the hadith library to browse."

### Error copy

Errors should answer three questions:
1. What happened?
2. Why?
3. What can I do?

Examples:
- "Post failed to publish on LinkedIn. Your token has expired. Reconnect LinkedIn to retry."
- "Hadith lookup timed out. Sunnah.com may be down. Try again in a minute."
- "Video render failed. File was corrupted. Upload again."

---

## Design principles

### 1. Trust through consistency

The app is about Islamic content where authenticity matters. Visual consistency reinforces trustworthiness. Never skimp on polish for hadith/Quran UI. A shaky hadith badge implementation communicates "this product doesn't care."

### 2. Prefer reduction over addition

If a feature needs three tutorials to explain, it's the wrong feature. If a UI needs a tooltip on every element, it's the wrong UI.

### 3. Respect the content

Arabic text deserves proper rendering. Never break Arabic words across lines. Never substitute Latin characters for missing Arabic glyphs. Test every screen with long Arabic passages.

### 4. Loading states matter

No spinners-of-death. Every data fetch has a skeleton. Every action has optimistic UI where reasonable. Every long-running job has progress feedback.

### 5. Respect limitations

- Arabic is RTL. Even though V10 is English-first, text-direction support for Arabic content must be correct.
- Users on poor connections: design for 3G. Loading should degrade gracefully.
- Users on small screens: every critical flow must work on 375px wide.

---

## Quick reference — common component choices

| Need | Use |
|---|---|
| Modal | `@radix-ui/react-dialog` (via shadcn) |
| Dropdown | `@radix-ui/react-dropdown-menu` |
| Tooltip | `@radix-ui/react-tooltip` |
| Tabs | `@radix-ui/react-tabs` |
| Command palette | `cmdk` |
| Toast | `sonner` |
| Date picker | `react-day-picker` |
| Rich text editor | `@tiptap/react` |
| Drag and drop | `@dnd-kit/core` |
| Charts | `recharts` |
| Form handling | `react-hook-form` + `zod` validation |
| Auth UI | custom (not Supabase UI kit — too inflexible) |

Every component added to `components/ui/` should be owned code (shadcn pattern), not a dependency. Customize freely.

---

## Brand checklist per screen

Every screen shipped should pass:

- [ ] Uses palette tokens, no raw hex colors
- [ ] Uses type scale classes, no ad-hoc font sizes
- [ ] Active/hover/focus states on all interactive elements
- [ ] Empty state designed (not just absent content)
- [ ] Loading state designed (skeleton, not spinner)
- [ ] Error state designed (useful message + recovery action)
- [ ] Copy passes voice rules (no avoid-list phrases)
- [ ] Works at 375px viewport width
- [ ] Arabic text renders correctly if present
- [ ] Accessible: keyboard nav works, focus visible, aria labels on icon buttons

This is the bar. Every PR review checks against it.
