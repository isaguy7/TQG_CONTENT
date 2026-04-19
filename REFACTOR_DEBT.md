# Refactor Debt

Tracking of structural issues deferred from initial implementation. Each
entry has: date identified, description, why deferred, severity, proposed
resolution path.

Complements [`CLEANUP_DEBT.md`](./CLEANUP_DEBT.md) (schema + infrastructure
debt). This file is for code-structure debt.

## Active debt

### Files over 500 lines

Identified 2026-04-18 during V10 M1 §1 inventory. Large files are harder to
review, test, and refactor safely. Split candidates into logical components
as their relevant sections land.

| Lines | Path | Planned split in |
|------:|------|------------------|
|  774  | `src/app/(app)/clips/new/page.tsx` | M3 (clip creator rewrite) |
|  744  | `src/components/TranscribeWorkflow.tsx` | M3 (clip creator rewrite) |
|  675  | `src/app/(app)/content/[id]/page.tsx` | **§5 (Tiptap editor rewrite — full replace)** |
|  659  | `src/lib/captions.ts` | M3 (clip creator rewrite) |
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
| `src/app/(app)/queue/page.tsx` | 136, 186 | render batches, batch results | M3 clip creator |
| `src/app/(app)/clips/new/page.tsx` | 368, 387, 491, 568, 665, 754 | recitations, platforms, matches, clips, backgrounds, results | M3 clip creator |
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
| `src/components/StockBackgrounds.tsx` | 234, 282 | quick flattened, results | M3 clip creator |

Roughly 55 candidate sites across 26 files.

**Not candidates** (excluded per §1 step 8 spec): `.map()` over static
constants (platform lists, nav items, enum arrays), computed-always-present
derived data with guarantees, and library internals.

## Resolved debt

_empty — populate as items close_
