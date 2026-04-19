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

### Files over 500 lines

Identified 2026-04-18 during V10 M1 §1 inventory. Large files are harder to
review, test, and refactor safely. Split candidates into logical components
as their relevant sections land.

| Lines | Path | Planned split in |
|------:|------|------------------|
|  675  | `src/app/(app)/content/[id]/page.tsx` | **§5 (Tiptap editor rewrite — full replace)** |
|  595  | `src/components/FigureContextPanel.tsx` | §6 (figure library) |
|  592  | `src/lib/claude-api.ts` | §9 (AI assistant full rebuild) |
|  586  | `src/components/HadithPanel.tsx` | §7 (hadith system) |
|  586  | `src/components/FigureRefsPanel.tsx` | §6 (figure library) |
|  586  | `src/app/(app)/content/page.tsx` | §4 (kanban at `/posts`) |

The 675-line editor page is **intentionally excluded** from preemptive
splitting — §5 rewrites it to Tiptap wholesale (W2-W3), so any partial
split is wasted work.

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

_empty — populate as items close_
