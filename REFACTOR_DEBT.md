# Refactor Debt

Tracking of structural issues deferred from initial implementation. Each
entry has: date identified, description, why deferred, severity, proposed
resolution path.

Complements [`CLEANUP_DEBT.md`](./CLEANUP_DEBT.md) (schema + infrastructure
debt). This file is for code-structure debt.

## Archived until M3

Deleted 2026-04-19 to fix Vercel 250 MB serverless function limit. Three
clip/transcribe routes were bundling `.next/cache/webpack` (~251 MB)
into the deployed function and blowing past the limit. Video processing
is explicitly M3 scope per `V10_M1_Plan.md`.

Recoverable from git history at commit **`d039aee`** (HEAD immediately
before deletion on branch `claude/implement-writer-app-tieYL`).

Removed files:
- `src/app/api/clips/*` (7 routes: assets, queue, queue/process, render,
  download-stock, stock-videos, suggestions)
- `src/app/api/transcribe/route.ts`
- `src/app/(app)/clips/page.tsx`, `src/app/(app)/clips/new/page.tsx`
- `src/app/(app)/queue/page.tsx` (100% dependent on `/api/clips/queue*`)
- `src/components/TranscribeWorkflow.tsx` (744 lines)
- `src/components/StockBackgrounds.tsx` (only used by deleted clip pages)
- `src/lib/captions.ts` (659 lines)

Also edited:
- `src/app/(app)/content/new/page.tsx` — removed "From a video URL"
  section and `TranscribeWorkflow` import
- `src/components/Sidebar.tsx` — removed `/clips` and `/queue` nav entries
  (also dropped `Clapperboard` + `PlayCircle` icon imports)
- `src/app/(app)/page.tsx` — removed "New clip batch" + "Transcribe video"
  QuickLinks from the dashboard

Not deleted (orphaned but harmless, tree-shaken from the bundle):
- `src/lib/whisper.ts`, `src/lib/ffmpeg.ts`, `src/lib/ytdlp.ts`,
  `src/lib/kill-tree.ts`, `src/lib/clip-renderer.ts`, `src/lib/clip-platforms.ts`,
  `src/lib/clip-themes.ts`, `src/lib/pexels.ts`, `src/lib/subtitles.ts`,
  `src/lib/transcript.ts`, `src/components/TranscriptViewer.tsx`
- `src/lib/local-studio.ts` + `src/components/LocalStudio.tsx` — still
  mounted in `/settings` as the local-render-tunnel URL input. Setting
  is a no-op without the clip routes but the UI doesn't break.

Restore path at M3: `git show d039aee:<path> > <path>` for each file.
Or cherry-pick the inverse of the archival commit.

## Active debt

### Dual-surface /api/hadith routes

Identified 2026-04-21 during V10 §7 commit 2.

Parallel hadith search endpoints exist — same underlying corpus but
different response shapes and intended callers:

- `src/app/api/hadith/search/route.ts` (new, §7 picker) — corpus-only
  fuzzy search over `hadith_corpus` via ILIKE + pg_trgm GIN indexes.
  Auth: requireUser(). Response: `{ results, total, limit, offset, query }`.
  Consumers (as of §7 commit 2): none yet — wires up in commit 3.
- `src/app/api/hadith-corpus/search/route.ts` (legacy) — PostgreSQL
  `websearch` full-text on `english_text` with an ILIKE fallback. No
  auth check. Response: `{ results, total }`. Consumers (3):
  - `src/components/HadithPanel.tsx:338`
  - `src/components/FigureRefsPanel.tsx:381`
  - `src/components/AmbientSuggestions.tsx:101`
  - `src/app/(app)/hadith/page.tsx:39` (limit=0 total-count ping)
- `src/app/api/hadith/sunnah-search/route.ts` (renamed 2026-04-21) —
  live sunnah.com scraping via `searchSunnah()`. Freed up
  `/api/hadith/search` for the §7 picker. One consumer:
  `src/components/HadithPanel.tsx:126`.

**Migration path:** when §9 (AI assistant) lands or a dedicated cleanup
commit before M2, migrate the 3 `hadith-corpus/search` consumers to
the new `/api/hadith/search` and delete the legacy route. The
sunnah.com scraping stays as a separate capability (it's not corpus
search — it queries the live site for hadith not yet ingested). Not
urgent; endpoints don't conflict.

### Hadith AI-suggestion verification flow (deferred to §9)

Identified 2026-04-21 during V10 §7 scope revision. Original §7 spec
included a full UNVERIFIED badge + sunnah.com confirm dialog flow.
Product decision: corpus-picker attachments auto-verify since the user
consciously picks from a 29,685-row library — no AI hallucination
risk, verification toil is overkill. The hallucination risk lives in
§9 when Claude suggests hadith for AI-generated content.

The schema foundation shipped in §7 commit 1
(`20260421100000_v10_hadith_verifications_proper.sql`) already has
`verified` + `verified_at` + `verified_by` columns and the
org-scoping FK. The publish-gate wired in §7 commit 4 already blocks
posts with any `verified=false` refs.

§9 to-do when AI suggestions land:
- Claude-suggested hadith: insert `post_hadith_refs` row with
  `source='ai_suggestion'` (added in §7 commit 3 migration
  `20260421120000_v10_post_hadith_refs_source.sql`) and
  `hadith_verifications` row with `verified=false` (vs the corpus
  picker path which sets both to `'corpus_picker'` / `true`).
- `AttachedHadithPanel` item — render red UNVERIFIED badge when
  `verification.verified === false` OR `ref.source === 'ai_suggestion'`
  (belt + suspenders; either signal alone should trigger the badge).
- `VerifyHadithDialog` component — "Open sunnah.com →" button +
  "I verified — mark VERIFIED" button.
- `POST /api/hadith-verifications/[id]/verify` route — sets
  `verified=true, verified_at=now(), verified_by=auth.user.id`.

No DB migration required at that time — the publish-gate will
naturally refuse to schedule/publish a post with unverified refs, so
§9's AI suggestion path gets safety for free by inserting
`verified=false`.

### §9 cleanup: HadithPanel.tsx 586-line legacy component

Identified 2026-04-21 during V10 §7 commit 3. Pre-V10
`src/components/HadithPanel.tsx` still serves
`/app/(app)/hadith/page.tsx` and exports `SearchCorpus` +
`HadithRecord` + `CorpusRow` consumed by the editor's
`AttachedHadithPanel`. §7 commit 3 keeps the `HadithRecord` type
import alive (Q2 answer 2026-04-21 — migration off legacy was scope
creep) but drops the `SearchCorpus` inline usage in favor of the
new drawer-based `HadithPicker`.

When §9 refactors `/hadith/page.tsx` (likely folded into the AI
assistant's hadith browser) or the standalone hadith browser gets
consolidated into the picker itself, absorb the shared exports at
that time and delete `HadithPanel.tsx`. Also lift `hadith_corpus_id`
through the parent's /api/posts/[id] GET so `AttachedHadithPanel`
can populate a real `attachedCorpusIds` Set for the picker's Attach
button gray-out (currently passes an empty Set — server-side
idempotency absorbs the dupe-attach case).

### Dual-surface /api/figures route

Identified 2026-04-20 during V10 §6 commit 4.

Both `src/app/api/figures/[id]/route.ts` (uuid-keyed) and
`src/app/api/figures/by-slug/[slug]/route.ts` (slug-keyed) exist in
parallel. The commit 4 spec originally called for deleting the `[id]`
route; grepping the codebase revealed 5 consumers still fetching
figures via `post.figure_id` UUID — deleting would cascade into the
editor and the reference panels. Kept both routes instead.

The slug-keyed route is nested under a static `by-slug/` parent
rather than at the `/api/figures/[slug]` URL originally spec'd:
Next.js disallows two different dynamic-segment names (`[id]` and
`[slug]`) as siblings at the same level. Putting the slug route one
level deeper is the minimal-touch fix; alternative would have been
renaming `[id]` + migrating all 5 consumers.

**`[id]` consumers (uuid-keyed):**
- `src/components/FigureContextPanel.tsx` (figure metadata fetch inside
  the editor's right-side context panel)
- `src/components/FigureRefsPanel.tsx` (quran/hadith ref CRUD for the
  figure editor experience)
- `src/components/FigureAvailableRefs.tsx` (available refs dropdown)
- `src/components/QuranBrowser.tsx` (adds verses to a figure)
- `src/app/(app)/content/[id]/page.tsx` (loads figure by
  `post.figure_id` for editor display)

Plus sub-routes under `[id]/hadith/*` and `[id]/quran/*` consumed by
the same set.

**`[slug]` consumer (new):**
- `src/app/(app)/figures/[slug]/page.tsx` (§6 detail page)

**Migration path:** when §7 (hadith picker) and §8 (quran browser)
refactor their figure-attachment flows, swap their uuid fetches to
slug-keyed calls. At that point the `[id]` route and its sub-routes
can be deleted. Not urgent; routes don't conflict and the duplication
is purely read-layer.

### Native browser-dialog call sites

Identified 2026-04-19 during V10 §6 commit 2. `V10_Product_Context.md`
added a UX rule forbidding `window.confirm` / `window.prompt` /
`window.alert`. `ConfirmDialog` + `InputDialog` shipped in
`src/components/shared/` as the replacement primitives; the sites
below still use native dialogs and need migration as their sections
are touched.

| File | Line | Type | Planned migration |
|------|-----:|------|-------------------|
| `src/app/(app)/content/[id]/page.tsx` | 169 | `confirm` (soft delete draft) | §10 cleanup or §5 follow-up |
| `src/app/(app)/content/page.tsx` | 129 | `confirm` | §4 kanban rewrite |
| `src/app/(app)/content/page.tsx` | 163 | `confirm` (permanent delete from trash) | §4 kanban rewrite |
| `src/app/(app)/hadith/page.tsx` | 51 | `confirm` (delete hadith row) | §7 hadith system rewrite |
| `src/components/FigureRefsPanel.tsx` | 165 | `confirm` (remove ayah ref) | §6 later commit / §8 quran rewrite |
| `src/components/FigureRefsPanel.tsx` | 416 | `confirm` (remove hadith ref) | §6 later commit / §7 hadith rewrite |
| `src/components/editor/EditorToolbar.tsx` | 42 | `window.prompt` (link URL) | §5 follow-up — swap `window.prompt` for `InputDialog` |

**First consumer of the new primitives:** §6 commit 5 (figure delete
flow). Migrate the rest opportunistically — no standalone migration
pass needed; they'll get touched as their owning sections rewrite.

### Files over 500 lines

Identified 2026-04-18 during V10 M1 §1 inventory. Large files are harder to
review, test, and refactor safely. Split candidates into logical components
as their relevant sections land.

| Lines | Path | Planned split in |
|------:|------|------------------|
|  595  | `src/components/FigureContextPanel.tsx` | §6 (figure library) |
|  592  | `src/lib/claude-api.ts` | §9 (AI assistant full rebuild) |
|  586  | `src/components/HadithPanel.tsx` | §7 (hadith system) |
|  586  | `src/components/FigureRefsPanel.tsx` | §6 (figure library) |
|  586  | `src/app/(app)/content/page.tsx` | §4 (kanban at `/posts`) |
|  561  | `src/app/(app)/content/[id]/page.tsx` | trimmed from 743 in §5 commit 10; remaining mass is ambient-suggestion + figure-context inline handlers + metadata JSX. Further split during §9 AI rebuild (assistant handlers) or when `ConvertPreviews` + `AmbientSuggestions` get their own section rewrite. |

### SafeList wrapping candidates

Identified 2026-04-19 during V10 M1 §1 step 8. Grep found 134 `.map()`
calls across `src/`; the subset below iterates Supabase-fetched arrays or
nullable props and would benefit from `<SafeList>` wrapping. Only one
site (`src/app/(app)/figures/page.tsx:125`) was wrapped in this pass —
the rest have rich custom empty-state copy (user guidance, action
prompts) that a default `<EmptyState>` would regress, and retrofit
without runtime verification (no `.env.local` in the sandbox) carries
regression risk. Each section rewrite in §2-§10 will naturally migrate
its own sites.

| Path | Line | Lists | Section that will rewrite |
|------|-----:|-------|---------------------------|
| `src/app/(app)/content/page.tsx` | 232, 254 | posts, deleted posts | §4 kanban |
| `src/app/(app)/calendar/page.tsx` | 311, 362, 423 | grid cells, cell items, figures_covered | §13 calendar |
| `src/app/(app)/content/[id]/page.tsx` | 440, 466, 611, 648 | format notes, platforms, attached hadith, available hadith | §5 editor rewrite |
| `src/app/(app)/figures/[id]/page.tsx` | 179 | figure themes | §6 figure library |
| `src/components/HadithPanel.tsx` | 182, 409, 430, 523 | search results × 3, corpus list | §7 hadith system |
| `src/components/FigureContextPanel.tsx` | 310, 347, 387 | hook angles, quran slice, hadith slice | §6 figure library |
| `src/components/FigureRefsPanel.tsx` | 232, 278, 453, 496 | search results, attached refs × 2 | §6 figure library |
| `src/components/FigureAvailableRefs.tsx` | 185, 232 | available quran, available hadith | §6 figure library |
| `src/components/DashboardLive.tsx` | 94 | figure recommendations | §15 dashboard polish |
| `src/components/QuranBrowser.tsx` | 158, 277 | ayah results, figures | §8 quran viewer |
| `src/components/SurahPicker.tsx` | 80 | surahs | §8 quran viewer |
| `src/components/HookGenerator.tsx` | 121 | generated hooks | §9 AI assistant |
| `src/components/AiAssistantDrawer.tsx` | 216, 240 | messages, images | §9 AI assistant (full rebuild) |
| `src/components/ClaudeUsage.tsx` | 89, 108 | by-feature stats, recent calls | §9 AI assistant |
| `src/components/SlopChecker.tsx` | 117 | issues | §9 AI assistant |
| `src/components/ConvertPreviews.tsx` | 160 | conversion targets | §9 AI assistant |
| `src/components/PublishPanel.tsx` | 267, 349, 450 | platforms, linkedin authors, results | §10 LinkedIn OAuth |
| `src/components/LinkedInPages.tsx` | 125 | pages | §10 LinkedIn OAuth |
| `src/components/IntegrationsDetail.tsx` | 124, 324 | details, organizations | §10 LinkedIn OAuth |
| `src/components/TypefullyPush.tsx` | 208 | typefully drafts | §10 platforms |
| `src/components/UserManagement.tsx` | 124 | users | §17 admin |
| `src/components/AmbientSuggestions.tsx` | 156, 187 | hadith hits, quran hits | §7/§8 pickers |
| `src/components/ImagePicker.tsx` | 150 | image search results | §5 editor |

**Not candidates** (excluded per §1 step 8 spec): `.map()` over static
constants (platform lists, nav items, enum arrays), computed-always-present
derived data with guarantees, and library internals.

### Brand palette consistency

Identified 2026-04-19 during V10 M1 §3 sidebar polish. Pre-V10 UI (PR #12
premium overhaul) used emerald + cyan for brand accents. V10 locks
TQG green `#1B5E20` as the sole brand accent color per
`V10_Product_Context.md`.

Resolution: repaint as section rewrites touch each file. Don't
standalone-repaint — natural sweep during §4 kanban, §5 editor rewrite,
§6 figures, §9 AI assistant, etc.

**Excluded from this list:** semantic colors meaning "connected /
verified / success / good usage" — those stay emerald because their
meaning is the green = ok signal, not the brand. Specifically excluded
the connection-status indicators in `ClaudeStatusCard`, `ClaudeUsage`,
`IntegrationsBar`, `IntegrationsDetail`, `LinkedInPages`, `LocalStudio`,
`PublishPanel` success rows, `SlopChecker` "no slop" state, and
`TypefullyPush` "already pushed" badge.

Active drift sites:

| File | Lines | Section that will repaint |
|------|------:|---------------------------|
| `src/app/(app)/calendar/page.tsx` | 234, 276 | §13 calendar |
| `src/app/(app)/content/[id]/page.tsx` | 272, 280, 323 | §5 editor rewrite |
| `src/app/(app)/figures/[id]/page.tsx` | 37 (sahabi tint) | §6 figure library |
| `src/app/(app)/figures/page.tsx` | 33, 43 (sahabi tint) | §6 figure library |
| `src/app/(app)/page.tsx` | 138 | §15 dashboard polish |
| `src/app/(auth)/login/page.tsx` | 122 (info card) | §0 onboarding polish |
| `src/components/AiAssistantDrawer.tsx` | 130, 132, 178, 190, 201, 206, 223, 243, 274, 308, 314 | §9 AI assistant (full rebuild) |
| `src/components/FigureContextPanel.tsx` | 459, 519, 527 | §6 figure library |
| `src/components/FigureRefsPanel.tsx` | 465 | §6 figure library |
| `src/components/HadithPanel.tsx` | 448 (grade label) | §7 hadith system |
| `src/components/PostLabels.tsx` | 17 (label color) | §4 kanban |
| `src/components/PublishPanel.tsx` | 312 (button gradient) | §10 LinkedIn OAuth |
| `src/components/Sidebar.tsx` | 199, 212, 240, 262, 265, 273, 333 (Idea inbox + popover) | §3.4 / §17 admin polish |

Sahabi/figure-type tints (`figures/page.tsx:33,43` and `figures/[id]/page.tsx:37`)
sit on the brand/semantic boundary — emerald is the chosen tint for the
`sahabi` figure type out of a 4-color palette. Treat as a §6 design
decision rather than mechanical repaint.

## Resolved debt

### V10 §5 post editor (2026-04-19)

Replaced the plain `<textarea>` post editor with a full Tiptap-backed
editor. 10 commits across content_json migration, Tiptap scaffold,
toolbar + character counter + variant tabs, autosave + post_versions
history, mentions + hashtags, version history dialog, copy-for-Typefully,
and page shell cleanup.

**Final stats:**
- Bundle on `/content/[id]`: **276 kB first-load JS** (was 127 kB pre-§5,
  +149 kB for Tiptap + ProseMirror + 5 extensions + Tippy)
- `src/app/(app)/content/[id]/page.tsx`: **561 lines** (was 760 pre-§5,
  −199 lines / 26% reduction)
- New components (11 total) in `src/components/editor/`:
  `PostEditor`, `EditorToolbar`, `CharacterCounter`,
  `PlatformVariantTabs`, `AutosaveStatus`, `VersionHistoryDialog`,
  `CopyForTypefullyButton`, `AttachedHadithPanel`,
  `extensions/MentionFigure`, `extensions/MentionSuggestion`,
  `extensions/HashtagMark`
- New hooks: `hooks/usePostEditor`, `hooks/useAutosave`
- New API route: `GET /api/posts/[id]/versions`
- DB schema: `content_json JSONB` added to `posts` + `post_versions`
  (migration `20260419160516_v10_post_content_json`)

Commit sequence on `claude/implement-writer-app-tieYL`:
`00fc5b3` → `a1229b4` → `2d6b235` → `e26bf4b` → `80a7948` → `27ee716` →
`018f85a` → `da9581d` → `0ce94c4` → _commit 10_.
