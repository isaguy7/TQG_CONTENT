# V10 Milestone 1 — The Writer

**Goal:** App replaces Claude.ai for drafting. Every TQG post from the end of M1 onwards is written in the app.
**Target duration:** 8 weekends (~48-64 focused hours)
**Ships:** a fully usable writing tool with the Islamic knowledge base, AI assistant, and real calendar. Still copy-paste to Typefully for scheduling — that gets fixed in M2.

---

## M1 sections & build order

Do sections in order. Each section commits separately. After each section, deploy to Vercel and click through the changed screens to verify.

1. **Foundation** — directory reorg, migrations framework, shared clients
2. **Post data model** — kanban schema, versioning, platform array
3. **Sidebar & layout polish** — fix the green bar, remove suggestions, clean nav
4. **Kanban view** — drafts/ideas/scheduled/published tabs
5. **Editor core** — post editor, auto-save, platform picker, version history
6. **Figure library** — expanded to 50+ figures, browser page, picker component
7. **Hadith system** — grading migration, picker with filters, recently viewed, UNVERIFIED flag
8. **Quran + tafsir** — multi-translation, multi-tafsir viewer, picker for posts
9. **AI assistant** — right sidebar, two modes, figure-aware, slop checks, cost tracking
10. **LinkedIn multi-account OAuth** — personal + company pages, stacked avatars
11. **X OAuth polish** — multi-account for X where supported
12. **Platform backfill** — fetch real posts from LinkedIn + X APIs
13. **Calendar view** — real data, lazy pagination, remove phantoms
14. **Figure gap tracking** — per-platform warnings
15. **Hook performance tracking** — category tagging, aggregate view
16. **Command palette** — Cmd+K global nav
17. **Settings / help center** — explain every feature

---

## Section 1 — Foundation

### 1.1 Directory reorganization

Move the codebase to the structure in `V10_Architecture.md`. Do this incrementally:

1. Create `app/(auth)/` and `app/(app)/` route groups. Move existing routes.
2. Create `lib/platforms/`, `lib/anthropic/`, `lib/hadith/`, `lib/quran/`.
3. Split any file currently >500 lines. Create a list in `REFACTOR_DEBT.md` of files still needing split.
4. Update all imports.

Verification: `npm run build` passes, all existing flows still work.

### 1.2 Migration framework

Ensure `supabase/migrations/` is set up with proper numbered migrations. Current DB state should be captured as a baseline migration `20260101000000_baseline.sql` (export via `supabase db dump`).

All V10 migrations prefix: `20260420XXXXXX_v10_*.sql`

### 1.3 Shared clients

Create these core files:

**`lib/supabase/client.ts`** (browser):
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      auth: { detectSessionInUrl: false, flowType: 'pkce' }
    }
  );
}
```

**`lib/supabase/server.ts`** (server components):
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => 
            cookieStore.set(name, value, options));
        }
      }
    }
  );
}
```

**`lib/supabase/admin.ts`** (service role, server only, imported sparingly):
```typescript
import 'server-only';  // build error if imported client-side
import { createClient } from '@supabase/supabase-js';

export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
```

**`lib/anthropic/client.ts`** — per architecture doc.

### 1.4 Error boundaries

Add a root error boundary at `app/(app)/error.tsx`:
```tsx
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-zinc-200">Something went wrong</h2>
        <p className="mt-2 text-zinc-400">{error.message}</p>
        <Button onClick={reset} className="mt-4">Try again</Button>
      </div>
    </div>
  );
}
```

This specifically fixes the unhandled `.map()` crash that started this whole V9/V10 conversation — any uncaught error now shows a recovery UI instead of a white screen.

### 1.5 Defensive list rendering

Create `components/shared/SafeList.tsx`:
```tsx
export function SafeList<T>({ 
  data, 
  loading, 
  error, 
  empty, 
  children 
}: {
  data: T[] | undefined | null;
  loading?: boolean;
  error?: Error | null;
  empty?: React.ReactNode;
  children: (item: T) => React.ReactNode;
}) {
  if (loading) return <ListSkeleton />;
  if (error) return <ErrorState message={error.message} />;
  if (!data?.length) return <>{empty ?? <EmptyState />}</>;
  return <>{data.map(children)}</>;
}
```

Mandate: every list of Supabase data uses SafeList or equivalent guard. No raw `data.map()` in components.

---

## Section 2 — Post data model

### 2.1 Migration

`supabase/migrations/20260420000100_v10_post_status_model.sql`:

```sql
-- Add new status column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status TEXT
  CHECK (status IN ('idea', 'draft', 'scheduled', 'published', 'failed', 'archived'))
  DEFAULT 'draft';

-- Backfill
UPDATE posts SET status = CASE
  WHEN published_at IS NOT NULL THEN 'published'
  WHEN scheduled_for IS NOT NULL THEN 'scheduled'
  WHEN content IS NULL OR content = '' THEN 'idea'
  ELSE 'draft'
END WHERE status IS NULL OR status = 'draft';

-- Drop deprecated columns
ALTER TABLE posts DROP COLUMN IF EXISTS linkedin_status;
ALTER TABLE posts DROP COLUMN IF EXISTS x_status;
ALTER TABLE posts DROP COLUMN IF EXISTS facebook_status;
ALTER TABLE posts DROP COLUMN IF EXISTS instagram_status;
ALTER TABLE posts DROP COLUMN IF EXISTS review_status;
ALTER TABLE posts DROP COLUMN IF EXISTS readiness;
ALTER TABLE posts DROP COLUMN IF EXISTS quality_score;
ALTER TABLE posts DROP COLUMN IF EXISTS quality_label;

-- New columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE posts ADD COLUMN IF NOT EXISTS platform_variants JSONB DEFAULT '{}'::jsonb;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hook_category TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hook_text TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hooks_generated JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_html TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Backfill platforms from old data if possible (guess from platform_versions if existed)
UPDATE posts SET platforms = ARRAY['linkedin'] WHERE platforms = '{}' OR platforms IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_status ON posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_posts_figure ON posts(figure_id) WHERE figure_id IS NOT NULL;
```

### 2.2 Post versions table

`supabase/migrations/20260420000101_v10_post_versions.sql`:

```sql
CREATE TABLE IF NOT EXISTS post_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  version INT NOT NULL,
  content TEXT,
  content_html TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  saved_by UUID REFERENCES auth.users(id),
  UNIQUE(post_id, version)
);

CREATE INDEX idx_post_versions_post ON post_versions(post_id, saved_at DESC);

ALTER TABLE post_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_version" ON post_versions
  FOR ALL USING (
    post_id IN (SELECT id FROM posts WHERE user_id = auth.uid())
  );
```

### 2.3 TypeScript types

`types/post.ts`:
```typescript
export type PostStatus = 'idea' | 'draft' | 'scheduled' | 'published' | 'failed' | 'archived';
export type Platform = 'linkedin' | 'x' | 'facebook' | 'instagram';
export type HookCategory = 
  | 'contrast' | 'provocative' | 'scene' | 'purpose' 
  | 'refusal' | 'dua' | 'scale' | 'loss' | 'character';

export interface Post {
  id: string;
  user_id: string;
  title: string | null;
  status: PostStatus;
  content: string | null;
  content_html: string | null;
  platforms: Platform[];
  platform_variants: Record<Platform, Partial<{ content: string; media: string[] }>>;
  figure_id: string | null;
  hadith_refs: string[];
  quran_refs: string[];
  images: string[];
  video_id: string | null;
  hook_category: HookCategory | null;
  hook_text: string | null;
  hooks_generated: HookBatch | null;
  scheduled_for: string | null;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
```

### 2.4 Clean up obsolete code

Delete/archive:
- Any component referencing `quality_score`, `readiness`, `review_status`
- Any "Below optimal / Optimal" UI strings
- Any "General draft" / "Untitled draft" auto-creation logic
- The "Suggestions" feature in its entirety (component, route, state)

Grep for: `quality_score`, `quality_label`, `readiness`, `review_status`, `suggestions`, `belowOptimal`, `isReady`, `Suggestions`, `SuggestionPanel`.

---

## Section 3 — Sidebar & layout polish

### 3.1 Fix the green bar (not the glow)

Find sidebar active-item rendering. Typically:

```tsx
// BEFORE (bad — has bar)
<Link href={href} className={cn(
  "relative flex items-center gap-3 rounded-lg px-3 py-2",
  isActive && "bg-zinc-800 text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-8 before:w-1 before:bg-[#1B5E20] before:rounded-r"
)}>
```

```tsx
// AFTER (good — no bar, keep icon glow)
<Link href={href} className={cn(
  "relative flex items-center gap-3 rounded-lg px-3 py-2",
  isActive && "bg-zinc-800/60 text-white"
)}>
  <div className={cn(
    "flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800",
    isActive && "bg-zinc-800 shadow-[0_0_14px_rgba(27,94,32,0.5)]"
  )}>
    <Icon className={cn("h-4 w-4", isActive ? "text-[#1B5E20]" : "text-zinc-400")} />
  </div>
  <span>{label}</span>
</Link>
```

The glow stays. The left bar is gone. Test at every nav item (Posts, Calendar, Figures, Hadith, Clips, Settings).

### 3.2 Top nav simplification

Top bar should show:
- Left: current page title (breadcrumb-style)
- Right: active profile avatar(s), settings gear

Remove if present: "Suggestions" button, platform "status" pills in the header.

### 3.3 Right sidebar toggle

Add a collapse toggle at the top-right of the editor area. When toggled:
- Open: editor takes 60% width, AI sidebar 360px, right context panel 240px (if needed)
- Closed: editor takes 100% width minus left sidebar

State persists in localStorage (`tqg.ai_sidebar_open`, `tqg.context_panel_open`).

---

## Section 4 — Kanban view

### 4.1 Page structure

`app/(app)/posts/page.tsx` renders four-column kanban:

```
┌─────────────────────────────────────────────────────────────┐
│ My posts                                    [+ New post]    │
│                                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ Ideas    │ │ Drafts   │ │Scheduled │ │Published │       │
│ │   (3)    │ │   (5)    │ │   (2)    │ │   (47)   │       │
│ ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤       │
│ │ [card]   │ │ [card]   │ │ [card]   │ │ [card]   │       │
│ │ [card]   │ │ [card]   │ │ [card]   │ │ [card]   │       │
│ │ [card]   │ │ [card]   │ │          │ │ [card]   │       │
│ │          │ │ [card]   │ │          │ │ ...      │       │
│ │          │ │ [card]   │ │          │ │          │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

Each column:
- Header: name + count + filter icon (opens filter popover)
- Scrollable card list
- Cards show: figure avatar (if any), first line of content, platforms (icons), time info (created / scheduled / published)

### 4.2 Card component

```tsx
// components/kanban/PostCard.tsx
<div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 hover:border-zinc-700 cursor-pointer">
  <div className="flex items-start gap-2">
    {figure && <FigureAvatar figure={figure} size="sm" />}
    <div className="flex-1 min-w-0">
      <div className="line-clamp-2 text-sm text-zinc-200">
        {post.content || post.title || 'Untitled idea'}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
        <PlatformIcons platforms={post.platforms} />
        <span className="ml-auto">{formatRelative(post.updated_at)}</span>
      </div>
    </div>
  </div>
</div>
```

### 4.3 Drag-and-drop between columns

Use `@dnd-kit/core`. Dropping:
- Ideas → Drafts: just changes status
- Drafts → Scheduled: opens schedule modal (date picker)
- Drafts → Published: confirms "Publish now" (M2 actual publishing; M1 just sets `published_at = now()` for manual-paste workflow)
- Scheduled → Drafts: "Unschedule" (clears `scheduled_for`)
- Any → Archive (separate action, not a column): archives via `archived_at`

### 4.4 Filtering

Per column, filter by:
- Figure
- Platform
- Date range
- Hook category

Store filter state in URL params so sharing a link preserves filters.

### 4.5 Empty states

Each column gets an empty state with an icon + short message:
- Ideas empty: "Capture ideas here. They don't need a draft yet."
- Drafts empty: "No drafts in progress. Start one from an idea or hit New post."
- Scheduled empty: "Nothing scheduled yet."
- Published empty: "Your published posts will appear here."

---

## Section 5 — Editor core

### 5.1 Editor page layout

`app/(app)/posts/[id]/edit/page.tsx`:

```
┌─────────────────────────────────────────────────────────────┐
│ [← Back]   Post title          Status badge    [⚙] [✨]    │
├─────────────────────────────────┬───────────────────────────┤
│                                 │                           │
│  Figure: [Abu Bakr (RA) ▾]     │   AI Assistant            │
│  Platforms: [LI] [X] [FB]       │   (collapsible)           │
│                                 │                           │
│  ┌───────────────────────────┐  │   [Draft][Edit current]   │
│  │                           │  │                           │
│  │  Editor (Tiptap)          │  │   Topic: _________        │
│  │                           │  │   Figure: Abu Bakr (RA)   │
│  │                           │  │   ☐ Include a hadith      │
│  │                           │  │                           │
│  │                           │  │   [Generate 10 hooks]     │
│  │                           │  │   [Full draft]            │
│  │                           │  │                           │
│  └───────────────────────────┘  │   ─── Output ───          │
│                                 │                           │
│  Hadith: 0    Quran: 0    ↻    │   ...                     │
│                                 │                           │
│  [Save draft]   [Schedule]      │                           │
│                                 │                           │
└─────────────────────────────────┴───────────────────────────┘
```

The `[⚙]` opens post settings (figure, platforms, hook category tagging). The `[✨]` toggles the AI sidebar.

### 5.2 Text editor

Use **Tiptap** with these extensions:
- `StarterKit` (minus the heading plugins, we don't need H1/H2 in posts)
- `Placeholder` ("start writing...")
- `CharacterCount` (show per-platform counts: LI 3000, X 280, FB 63206, IG 2200)
- `Link` (for @mentions rendered as links)
- Custom mark: `MentionHighlight` for `@username` detection
- Custom mark: `HashtagHighlight` for `#tag` detection

### 5.3 Auto-save

Auto-save logic:

```typescript
// components/editor/useAutoSave.ts
export function useAutoSave(postId: string, content: string, html: string) {
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const lastSaved = useRef<string>(content);
  
  useEffect(() => {
    if (content === lastSaved.current) return;
    
    setStatus('saving');
    const timeout = setTimeout(async () => {
      try {
        await savePost(postId, { content, content_html: html });
        await createVersion(postId, { content, content_html: html });
        lastSaved.current = content;
        setStatus('saved');
      } catch (e) {
        setStatus('error');
      }
    }, 3000);  // 3s debounce
    
    return () => clearTimeout(timeout);
  }, [postId, content, html]);
  
  return status;
}
```

Show save status in the top-right corner: "Saved 2s ago" / "Saving..." / "Save failed — retry".

Version history: every auto-save creates a row in `post_versions`. Cap at last 50 versions per post. Garbage collect older versions via a nightly cron.

### 5.4 Version history UI

Accessible from post settings menu: "Version history" opens a dialog showing timeline of versions. Click a version → preview + "Restore this version" button.

### 5.5 Platform picker

Horizontal chip row above editor:
```tsx
<div className="flex items-center gap-2">
  {(['linkedin', 'x', 'facebook'] as Platform[]).map(p => (
    <PlatformChip
      key={p}
      platform={p}
      active={post.platforms.includes(p)}
      onToggle={() => togglePlatform(p)}
    />
  ))}
</div>
```

Instagram is NOT in this picker. Instagram is Reels-only, handled in clip creator (M3).

### 5.6 Per-platform variants

When multiple platforms selected, below the main editor show tabs:
```
[ Master draft ]  [ LinkedIn ]  [ X ]  [ Facebook ]
```

Default: all platforms use the master draft.
Click a platform tab → edit that version separately. Changes there override the master for that platform.

Stored in `platform_variants` JSONB:
```json
{
  "linkedin": { "content": "Longer LinkedIn version..." },
  "x": { "content": "Shorter X version under 280 chars" }
}
```

### 5.7 Mentions and hashtags

**Mentions (`@`):**
- On `@` keystroke, show popover with matching profiles
- For LinkedIn: search company connections via API (scope `r_basicprofile`). For V10, simpler — allow plain `@Name` freely, no autocomplete required. Store as plain text.
- For X: allow any handle matching `/^@[A-Za-z0-9_]{1,15}$/`, no autocomplete
- Render mentions highlighted blue in editor

**Hashtags (`#`):**
- On `#` keystroke, suggest from curated list + figure-specific tags
- Highlighted blue in editor
- Counter per platform: LinkedIn no limit, X warn >2, Facebook no limit

Implement via Tiptap marks with regex-based detection on keystroke.

### 5.8 Save and schedule

Below editor, two buttons:
- **Save draft** — keeps status as `draft`
- **Schedule** — opens datetime picker → on confirm, sets `scheduled_for` and status to `scheduled`. In M1 this is the working target; actual publishing happens in M2, so the modal also says "This is a scheduling reminder. Copy to Typefully to actually publish for now."

For the M1 workflow, also add:
- **Copy for Typefully** button — copies content formatted for Typefully paste (handles line breaks, strips mentions to plain text, etc.)

---

## Section 6 — Figure library

### 6.1 Expansion: 50+ figures seeded

Current DB has 15 figures. M1 target: **70 figures** with full theme/angle/event data.

Categories to cover:

**Prophets (mentioned in Quran) — 25 figures**
Adam, Idris, Nuh, Hud, Salih, Ibrahim, Lut, Ismail, Ishaq, Yaqub, Yusuf, Shu'aib, Ayyub, Dhul-Kifl, Musa, Harun, Dawud, Sulayman, Ilyas, Al-Yasa', Yunus, Zakariya, Yahya, Isa, Muhammad (SAW)

**Sahabah (the 10 promised + key others) — 25 figures**
Abu Bakr, Umar, Uthman, Ali, Talha, Zubayr, Abdur Rahman ibn Auf, Sa'd ibn Abi Waqqas, Sa'id ibn Zayd, Abu Ubaidah ibn al-Jarrah, Bilal, Salman al-Farsi, Abu Dharr al-Ghifari, Mu'adh ibn Jabal, Ammar ibn Yasir, Khalid ibn al-Walid, Abu Hurairah, Abdullah ibn Mas'ud, Abdullah ibn Abbas, Abdullah ibn Umar, Anas ibn Malik, Hudhayfah ibn al-Yaman, Usamah ibn Zayd, Miqdad ibn Aswad, Zayd ibn Thabit

**Women of the Prophet's (SAW) household — 8 figures**
Khadijah, Aisha, Fatimah, Hafsah, Umm Salamah, Zaynab bint Jahsh, Safiyyah, Maymunah

**Scholars — 12 figures**
Abu Hanifa, Malik, Shafi'i, Ahmad ibn Hanbal, Bukhari, Muslim, Tirmidhi, Ibn Taymiyyah, Ibn Qayyim, Ibn Kathir, al-Ghazali, Salahuddin al-Ayyubi

### 6.2 Seed data shape

Each figure in seed file:
```typescript
{
  name: "Abu Bakr as-Siddiq",
  arabic_name: "أبو بكر الصديق",
  kunya: "Abu Bakr",
  category: "sahabah",
  short_bio: "First caliph and closest companion of the Prophet (SAW). Known for his truthfulness, wealth given in charity, and steadfast faith.",
  birth_year: { value: 573, era: "CE" },
  death_year: { value: 634, era: "CE" },
  themes: [
    "truthfulness", "sincerity", "generosity", "steadfastness", 
    "leadership", "companionship", "wealth-in-charity", "unwavering-faith",
    "support-of-the-prophet"
  ],
  hook_angles: [
    { angle: "He gave everything he owned. Everything.", category: "scale" },
    { angle: "The one who believed without hesitation", category: "contrast" },
    { angle: "A companion chosen in the cave", category: "scene" },
    { angle: "When everyone doubted, he didn't", category: "contrast" }
  ],
  notable_events: [
    "Hijra (cave of Thawr)",
    "Battle of the Apostasy (Riddah wars)",
    "Compilation of Quran (first initiative)",
    "Giving all wealth for Tabuk"
  ],
  source_references: [
    "Bukhari 3615 (cave of Thawr narration)",
    "Tirmidhi 3668 (on his generosity)"
  ]
}
```

Create seed script `supabase/seed/figures.ts` that:
1. Reads a JSON file `supabase/seed/data/figures.json`
2. Upserts into `islamic_figures`
3. Inserts into `figure_themes` and `figure_hook_angles` junction tables

Source data: you'll need to write these. I recommend using Claude.ai (via conversation, not the app's AI) to draft them for your review. Each figure takes ~10 minutes to verify. 70 figures = ~12 hours of work. Spread across 2-3 sessions.

Or: I can prepare a starter JSON of 30 high-priority figures in a separate file on request. Ask for `V10_Figure_Seed_Data.json` when ready.

### 6.3 Figure library page

`app/(app)/figures/page.tsx`:

```
┌─────────────────────────────────────────────────────────────┐
│ Figures                            [Search...]  [+ Add]     │
│                                                             │
│ Filter by: [All] [Prophets] [Sahabah] [Women] [Scholars]   │
│                                                             │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐│
│ │  [img]  │ │  [img]  │ │  [img]  │ │  [img]  │ │  [img]  ││
│ │ Abu Bakr│ │  Umar   │ │  Ali    │ │Khadijah │ │ Bilal   ││
│ │ 5d ago  │ │ 12d ago │ │ never   │ │ 3d ago  │ │ 2w ago  ││
│ │ 7 posts │ │ 4 posts │ │ 0 posts │ │ 5 posts │ │ 3 posts ││
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Card shows:
- Figure image (simple colored circle with initials if no image)
- Name
- Days since last post about them (color-coded: red ≤3d, amber 4-7d, zinc ≥8d)
- Total posts written about them

Click → figure detail page showing bio, themes, hook angles, past posts.

### 6.4 Figure picker (in editor)

Dropdown button in editor header. On click opens:
- Search bar
- Grouped by category
- Each figure shows last-posted info
- Click to select

Once selected, the editor header shows `Figure: Abu Bakr (RA) [change] [last: 5d ago on LinkedIn]`.

### 6.5 No images? Use initials.

Don't block on images. Create a `FigureAvatar` component that renders:
```tsx
<div className="rounded-full bg-gradient-to-br from-[#1B5E20] to-[#0D3811] flex items-center justify-center text-white font-medium">
  {initials(figure.name)}
</div>
```

Later, you can add images to seed data. In V10 M1, initials are acceptable.

---

## Section 7 — Hadith system

### 7.1 Grading migration

`supabase/migrations/20260420000200_v10_hadith_grading.sql`:

```sql
ALTER TABLE hadith_verifications 
  ADD COLUMN IF NOT EXISTS grading TEXT 
  CHECK (grading IN ('sahih', 'hasan', 'daif', 'mawdu', 'unknown'));

ALTER TABLE hadith_verifications 
  ADD COLUMN IF NOT EXISTS grading_source TEXT;

ALTER TABLE hadith_verifications 
  ADD COLUMN IF NOT EXISTS secondary_gradings JSONB;

-- Populate gradings from existing data
-- sunnah.com data typically has 'grade' field or similar in raw
-- Parse based on whatever column currently holds this info

-- Example: if original data had an 'authority_grade' text column
UPDATE hadith_verifications
SET 
  grading = CASE
    WHEN lower(authority_grade) LIKE '%sahih%' OR lower(authority_grade) LIKE '%sound%' THEN 'sahih'
    WHEN lower(authority_grade) LIKE '%hasan%' OR lower(authority_grade) LIKE '%good%' THEN 'hasan'
    WHEN lower(authority_grade) LIKE '%da''if%' OR lower(authority_grade) LIKE '%weak%' THEN 'daif'
    WHEN lower(authority_grade) LIKE '%mawdu%' OR lower(authority_grade) LIKE '%fabric%' THEN 'mawdu'
    ELSE 'unknown'
  END,
  grading_source = authority_grade_source
WHERE grading IS NULL;

CREATE INDEX IF NOT EXISTS idx_hadith_grading ON hadith_verifications(grading);

-- Text search
ALTER TABLE hadith_verifications
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', 
      COALESCE(english, '') || ' ' || 
      COALESCE(narrator, '') || ' ' || 
      COALESCE(collection, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_hadith_search ON hadith_verifications USING GIN(search_vector);
```

Write the backfill SQL tailored to your actual column names. If the original data didn't include gradings, leave as 'unknown' and plan to enrich from sunnah.com API.

### 7.2 User verification tracking

`supabase/migrations/20260420000201_v10_hadith_verifications.sql`:

```sql
CREATE TABLE IF NOT EXISTS hadith_user_verifications (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  hadith_id UUID REFERENCES hadith_verifications(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  PRIMARY KEY (user_id, hadith_id)
);

ALTER TABLE hadith_user_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_verification" ON hadith_user_verifications
  FOR ALL USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS hadith_recently_viewed (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  hadith_id UUID REFERENCES hadith_verifications(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, hadith_id)
);

CREATE INDEX idx_hadith_recent ON hadith_recently_viewed(user_id, viewed_at DESC);

ALTER TABLE hadith_recently_viewed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_recent" ON hadith_recently_viewed
  FOR ALL USING (user_id = auth.uid());
```

### 7.3 Hadith library page

`app/(app)/hadith/page.tsx`:

```
┌─────────────────────────────────────────────────────────────┐
│ Hadith library                    [Search hadith...]        │
│                                                             │
│ Collections: [All] [Bukhari] [Muslim] [Tirmidhi] [+7 more] │
│ Grading: [All] [Sahih] [Hasan] [Daif]                      │
│                                                             │
│ ── Recently viewed (10) ──                                 │
│ • "Actions are judged by intentions..." Bukhari #1         │
│ • "None of you truly believes..." Bukhari #13              │
│ ...                                                         │
│                                                             │
│ ── Search results ──                                        │
│ [sahih] Bukhari #6018                                       │
│   "Whoever believes in Allah and the Last Day should       │
│    speak good or remain silent..."                          │
│   Narrator: Abu Hurairah                                    │
│   [Verify on sunnah.com ↗]  [Use in post]                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Search logic:
- Full-text search on `search_vector`
- Filter by collection (multi-select)
- Filter by grading (multi-select)
- Sort: relevance by default, can toggle to "most recently verified by you"

Each result card shows:
- Grading badge (color: green sahih, yellow hasan, red daif, dark red mawdu, grey unknown)
- UNVERIFIED badge if user hasn't personally verified this hadith
- Collection + hadith number
- English text (truncate to 200 chars, click to expand)
- Narrator
- Link to sunnah.com
- "Mark as verified" button
- "Use in post" button (opens post picker or creates new post with hadith attached)

### 7.4 Hadith picker (in editor)

Right-side slide-in panel from editor. Similar to library page but:
- More compact
- "Recently viewed" defaults to top
- Clicking a hadith adds it to current post (`hadith_refs` array + inserts content into editor)

When hadith inserted, show inline UNVERIFIED chip in editor next to the hadith text. Chip disappears once user marks it verified.

### 7.5 The non-negotiable rules (reinforced)

The app must enforce these structurally:

1. **Never generate hadith reference numbers from AI.** System prompt rule in all AI calls.
2. **Every hadith in editor shows UNVERIFIED until user marks verified.**
3. **Status transition to 'scheduled' or 'published' is BLOCKED if unverified hadith present.**
4. **Grading and verification are SEPARATE.** A sahih hadith from Bukhari is still UNVERIFIED until the user has personally checked it on sunnah.com.

Write a test that attempts to schedule a post with unverified hadith — assert it fails.

### 7.6 Sunnah.com data sync

As a background task (not M1 critical path): build a script that periodically re-syncs hadith data from sunnah.com to pick up new gradings, corrections, etc.

Create `scripts/sync-hadith-gradings.ts`:
```typescript
// Fetches from sunnah.com API, updates grading/grading_source on our hadith_verifications
// Run manually for now, cron later
```

---

## Section 8 — Quran + tafsir

### 8.1 Translations migration

`supabase/migrations/20260420000300_v10_quran_translations.sql`:

```sql
CREATE TABLE IF NOT EXISTS quran_translations (
  surah_number INT NOT NULL,
  ayah_number INT NOT NULL,
  translator TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (surah_number, ayah_number, translator)
);

CREATE INDEX idx_quran_translations_lookup 
  ON quran_translations(surah_number, ayah_number);
```

Populate with Saheeh International, Pickthall, Yusuf Ali from alquran.cloud API.

Script: `scripts/import-quran-translations.ts`
- Iterates 114 surahs
- For each translator, fetches full surah
- Bulk inserts

### 8.2 Tafsirs migration

```sql
CREATE TABLE IF NOT EXISTS quran_tafsirs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surah_number INT NOT NULL,
  ayah_number INT NOT NULL,
  source TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  text TEXT NOT NULL,
  ayah_range TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(surah_number, ayah_number, source, language)
);

CREATE INDEX idx_tafsir_lookup ON quran_tafsirs(surah_number, ayah_number, source);
```

### 8.3 Tafsir import

Use quran.com API (`https://api.quran.com/api/v4`) which has:
- Tafsir Ibn Kathir (English, abridged)
- Tafsir Tabari (Arabic, may need translation)
- Tafsir Qurtubi (Arabic)
- Maarif-ul-Quran (English)
- Tafsir Sa'di (English)

Endpoint: `GET /tafsirs/{tafsir_id}/by_ayah/{surah}:{ayah}`

List of available tafsirs: `GET /resources/tafsirs`

Script: `scripts/import-tafsirs.ts`
- Start with Ibn Kathir (English) since it's most commonly referenced
- Add Maarif-ul-Quran and Tafsir Sa'di (both English)
- For Tabari/Qurtubi: if only Arabic available, store Arabic text, plan for translation later

Run this as a one-time seed. 6,236 ayahs × 3 English tafsirs = ~19,000 rows. Totally fine for Supabase.

### 8.4 Quran browser page

`app/(app)/quran/page.tsx`:

Three-pane view:
```
┌──────────┬──────────────────────────┬──────────────────────┐
│ Surah    │ Surah content            │ Tafsir panel         │
│ list     │                          │                      │
│          │ Al-Fatihah (1)           │ Source: [Ibn Kathir ▾│
│ 1. Al-   │                          │                      │
│    Fatih │ بِسْمِ اللَّهِ ...            │ On 1:1 -             │
│ 2. Al-   │ In the name of Allah...  │                      │
│    Baqara│ (Saheeh Int'l)           │ "Ibn Kathir writes:  │
│ 3. Al-   │ [1:1] ☆ Bookmark          │ ..."                 │
│    Imran │                          │                      │
│ ...      │ الرَّحْمَٰنِ الرَّحِيمِ          │                      │
│          │ The Entirely Merciful... │                      │
│          │ (Saheeh Int'l)           │                      │
│          │ [1:2] ☆                   │                      │
│          │                          │                      │
└──────────┴──────────────────────────┴──────────────────────┘
```

Top of main pane: translator selector. Top of right pane: tafsir source selector.

Click any ayah → right pane shows tafsir for that ayah.

"Use in post" button on each ayah → adds to current post's `quran_refs`.

### 8.5 Quran picker (in editor)

Similar to hadith picker but for ayahs. Supports:
- Search by English word (searches across all translations)
- Search by surah/ayah reference
- Multi-select (for posts referencing multiple ayahs)

---

## Section 9 — AI assistant

### 9.1 Right sidebar structure

`components/ai-assistant/AssistantSidebar.tsx`:

```
┌──────────────────────────────────┐
│ ✨ AI Assistant          [×]    │
├──────────────────────────────────┤
│ [ Draft ] [ Edit current ]       │
├──────────────────────────────────┤
│ (mode-specific content)          │
│                                  │
│                                  │
│                                  │
│                                  │
├──────────────────────────────────┤
│ Cost this month: $3.42 / $15.00  │
└──────────────────────────────────┘
```

### 9.2 Draft mode

```
Mode: Draft

Topic (optional):
┌──────────────────────────┐
│                          │
└──────────────────────────┘

Figure: Abu Bakr (RA)   [change]

☐ Include a hadith
   [Browse hadith →] (opens inline)

Hook category: [Auto ▾]

[ Generate 10 hooks ]
[ Full draft ]

─── Output ───

(renders hooks as clickable cards, or a draft as formatted preview)
```

Behavior:
- "Generate 10 hooks" → calls `/api/ai/hooks` with figure + topic context
- Each hook is a card with [Use this hook] button → sets `post.hook_text`, `post.hook_category`, inserts into editor
- "Full draft" → calls `/api/ai/draft` with full context → renders as preview with [Insert into editor] / [Replace editor content] / [Regenerate]

### 9.3 Edit current mode

```
Mode: Edit current

Quick actions:
[Tighten]    [Stronger hook]
[Fade ending] [Remove AI phrases]
[More conversational]

Custom instruction:
┌──────────────────────────┐
│                          │
└──────────────────────────┘
[ Apply ]

─── Output ───

(shows diff: red strikethrough for removed, green for added)
[Accept]  [Reject]  [Try again]
```

Behavior:
- Quick actions send preset prompts with current editor content
- Custom instruction sends user-provided transformation instruction
- Output shown as word-level diff
- Accept → replaces editor content
- Reject → keeps original
- Try again → re-runs with same instruction

### 9.4 System prompts

`lib/anthropic/prompts/system-base.ts`:
```typescript
export const ISLAMIC_VOICE_RULES = `
You are helping a Muslim content creator (Isa / The Quran Group) write Islamic content for LinkedIn and X.

ABSOLUTE RULES (never violate):
- NEVER generate hadith reference numbers or book citations. Describe hadith content only. End any hadith mention with "[verify on sunnah.com]".
- Use proper honorifics: (SAW) for the Prophet Muhammad, (RA) for sahabah, (AS) for other prophets.
- Use the Prophet's (SAW) actual words when possible, not paraphrases of hadith.

VOICE RULES:
- Drop into a scene — no setup like "Today I want to talk about..."
- One thread per post — single idea, followed through
- Never narrate irony — let it land without pointing at it
- Lowercase is deliberate and acceptable
- Fade endings — don't wrap up with a bow, don't moralize
- No em dashes (—)
- No AI phrases: "it's important to note", "in this article", "dive deep", "unpack", "unleash", "game-changer", "synergy", etc.
- One CTA max per post, often zero
- Reads like talking to a friend, not a broadcast

If the user has provided a figure context, use that figure's actual life events and character traits.
`;
```

`lib/anthropic/prompts/hooks.ts`:
```typescript
export function hookGenerationPrompt(params: {
  figure?: Figure;
  topic?: string;
  platform: 'linkedin' | 'x';
  count: number;
}) {
  return `Generate ${params.count} opening hooks for a post about ${params.figure?.name ?? params.topic}.

Hook categories to cover (mix of these):
- contrast: sets up a tension or surprise
- provocative: mild shock or challenge to assumption
- scene: drops reader into a specific moment
- purpose: starts with a why
- refusal: "they told him X. he refused."
- dua: starts with a supplication
- scale: size/magnitude of an action
- loss: something given up
- character: a trait revealed through action

${params.figure ? `Figure context:
Themes: ${params.figure.themes.join(', ')}
Known hook angles:
${params.figure.hook_angles.map(h => `- ${h.angle}`).join('\n')}
Notable events: ${params.figure.notable_events.join(', ')}` : ''}

${params.topic ? `Topic: ${params.topic}` : ''}

Platform: ${params.platform} (${params.platform === 'x' ? 'keep hooks under 200 chars' : 'keep hooks under 300 chars'})

Return JSON:
{
  "hooks": [
    { "text": "...", "category": "contrast|provocative|..." },
    ...
  ]
}

No preamble. No markdown. Pure JSON only.
`;
}
```

Equivalent for `draft.ts`, `edit.ts`, `slop-check.ts`, `convert.ts` (last one for M2).

### 9.5 API routes

**`/api/ai/hooks`** (POST):
```typescript
// Body: { post_id?, figure_id?, topic?, platform, count }
// Returns: { hooks: HookBatch }
export async function POST(req: Request) {
  const { user } = await requireAuth();
  const body = await req.json();
  
  // Load figure if figure_id provided
  const figure = body.figure_id ? await getFigure(body.figure_id) : undefined;
  
  const prompt = hookGenerationPrompt({ ...body, figure });
  
  const client = new ClaudeClient();
  const result = await client.complete({
    userId: user.id,
    feature: 'hook_generation',
    systemPrompt: ISLAMIC_VOICE_RULES,
    messages: [{ role: 'user', content: prompt }],
    model: 'sonnet',
    maxTokens: 2000
  });
  
  const parsed = safeParseJSON(result.text);
  
  // If a post_id was given, store the generated batch
  if (body.post_id) {
    await saveHooksToPost(body.post_id, parsed.hooks);
  }
  
  return NextResponse.json({ hooks: parsed.hooks });
}
```

**`/api/ai/draft`** — similar pattern, calls Opus for higher quality.

**`/api/ai/edit`** — takes current content + instruction, returns modified content.

**`/api/ai/slop-check`** — given content, returns list of slop issues (em dashes, AI phrases, etc.) with positions for highlighting in editor.

### 9.6 Usage tracking & caps

`lib/anthropic/usage-tracker.ts`:
```typescript
const CAPS = {
  free: 2.00,      // $2/mo
  creator: 15.00,  // $15/mo
  team: 50.00      // $50/mo shared
};

export async function checkUserCap(userId: string): Promise<boolean> {
  const usage = await getCurrentMonthUsage(userId);
  const plan = await getUserPlan(userId);
  return usage < CAPS[plan];
}

export async function recordUsage(params: {
  userId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<UsageRecord> {
  const pricing = {
    'claude-opus-4-7': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-5-20251001': { input: 1 / 1_000_000, output: 5 / 1_000_000 }
  };
  
  const p = pricing[params.model as keyof typeof pricing];
  const cost = (params.inputTokens * p.input) + (params.outputTokens * p.output);
  
  await adminClient.from('api_usage').insert({
    user_id: params.userId,
    feature: params.feature,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_usd: cost
  });
  
  return { cost };
}
```

Pricing numbers above are placeholders — update with real Anthropic pricing before launch.

### 9.7 Graceful degradation

If user hits cap:
- All AI buttons become "Copy to Claude.ai" buttons
- Clicking copies a formatted prompt (figure context + topic) to clipboard
- Toast: "You've hit your AI limit for this month. Copy to Claude.ai instead."

Settings shows usage + option to upgrade (M4).

---

## Section 10 — LinkedIn multi-account OAuth

### 10.1 Scope update

In Supabase auth provider config for LinkedIn, update scopes to include:
```
openid profile email w_member_social r_member_social w_organization_social r_organization_social
```

The `w_organization_social` scope is required to post as a company page. The `r_` variants let us fetch pages and posts.

**Users already connected without these scopes will need to reconnect.** Add a banner on Settings → Connections: "Reconnect LinkedIn to enable company pages."

### 10.2 Pages fetch route

`app/api/platforms/linkedin/pages/route.ts`:
```typescript
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  
  // Get the personal LinkedIn connection
  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('platform', 'linkedin')
    .eq('account_type', 'personal')
    .single();
  
  if (!connection) {
    return NextResponse.json({ error: 'no_personal_connection' }, { status: 400 });
  }
  
  // Fetch org ACLs
  const res = await fetch(
    'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,logoV2(original~:playableStreams))))',
    {
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        'LinkedIn-Version': '202405',
        'X-Restli-Protocol-Version': '2.0.0'
      }
    }
  );
  
  if (!res.ok) {
    return NextResponse.json({ error: 'linkedin_api_error', status: res.status }, { status: 500 });
  }
  
  const data = await res.json();
  const pages = (data.elements ?? []).map((el: any) => {
    const org = el['organization~'];
    const logoUrl = org.logoV2?.['original~']?.elements?.[0]?.identifiers?.[0]?.identifier;
    return {
      urn: `urn:li:organization:${org.id}`,
      id: String(org.id),
      name: org.localizedName,
      logo_url: logoUrl
    };
  });
  
  return NextResponse.json({ pages });
}
```

### 10.3 Page activation route

`app/api/platforms/linkedin/pages/activate/route.ts`:
```typescript
export async function POST(req: Request) {
  const { user } = await requireAuth();
  const { page_id, page_urn, name, logo_url } = await req.json();
  
  // Get parent (personal) connection
  const { data: parent } = await supabase
    .from('oauth_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('platform', 'linkedin')
    .eq('account_type', 'personal')
    .single();
  
  if (!parent) return NextResponse.json({ error: 'no_parent' }, { status: 400 });
  
  // Insert company page row
  const { data, error } = await supabase
    .from('oauth_connections')
    .insert({
      user_id: user.id,
      platform: 'linkedin',
      account_id: page_id,
      account_type: 'company_page',
      parent_connection_id: parent.id,
      display_name: name,
      avatar_url: logo_url,
      provider_metadata: { urn: page_urn }
    })
    .select()
    .single();
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connection: data });
}
```

### 10.4 Page removal route

`app/api/platforms/linkedin/pages/[id]/route.ts` DELETE — removes the company page connection. Does not affect the parent personal connection.

### 10.5 Parent connection migration

`supabase/migrations/20260420000400_v10_oauth_parent.sql`:
```sql
ALTER TABLE oauth_connections 
  ADD COLUMN IF NOT EXISTS parent_connection_id UUID 
  REFERENCES oauth_connections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_oauth_parent ON oauth_connections(parent_connection_id);
```

### 10.6 UI — stacked avatar pile

`components/platform-connectors/AccountStack.tsx`:

Show at bottom-left of sidebar, above the sign-out / settings area:

```
┌─────────────────┐
│  [Active acct]  │ ← highlighted, slightly larger
│   ┌─┐┌─┐┌─┐     │
│   │A││B││C│     │ ← other accounts, fanned
│   └─┘└─┘└─┘     │
│  [+ Add page]   │
└─────────────────┘
```

```tsx
export function AccountStack() {
  const { accounts, activeAccount, setActive } = useAccounts();
  
  return (
    <div className="flex items-center">
      {/* Active account — larger, front */}
      <Avatar
        src={activeAccount.avatar_url}
        name={activeAccount.display_name}
        size="lg"
        className="ring-2 ring-[#1B5E20]"
      />
      
      {/* Other accounts — smaller, overlapping */}
      <div className="flex -ml-2">
        {accounts
          .filter(a => a.id !== activeAccount.id)
          .map((acc, i) => (
            <Avatar
              key={acc.id}
              src={acc.avatar_url}
              name={acc.display_name}
              size="sm"
              className={cn(
                "ring-2 ring-zinc-950 cursor-pointer hover:scale-110 transition",
                i > 0 && "-ml-3"  // stack overlap
              )}
              onClick={() => setActive(acc.id)}
              title={`Switch to ${acc.display_name}`}
            />
          ))}
      </div>
      
      <button 
        onClick={() => openAddPageDialog()}
        className="ml-2 h-8 w-8 rounded-full border-2 border-dashed border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
      >
        +
      </button>
    </div>
  );
}
```

Click on another avatar → switches active account context (used for "post as" + calendar filtering + analytics filtering).

Right-click on an avatar → context menu: `[Set as active] [Remove account]`.

Active account is stored in:
- localStorage (immediate UI response)
- `user_profiles.active_connection_id` (persists across devices)

### 10.7 Add page dialog

Modal: "Add LinkedIn page"
- Fetches `/api/platforms/linkedin/pages`
- Lists pages user admins that aren't already added
- Checkbox next to each
- "Add selected pages" button
- Shows progress as each is activated

### 10.8 X multi-account

X OAuth 2.0 supports multiple accounts but each requires a separate OAuth flow. No "pages" concept — just personal accounts.

For V10, let user connect multiple X accounts (personal + TQG). Each gets its own OAuth dance. Store with different `account_id`.

The "Add X account" button in Settings → Connections triggers a full OAuth flow, receives a new connection row.

---

## Section 11 — X OAuth polish

Existing X OAuth works per your memory. This section is about:
- Ensure multi-account works (different `account_id` per add)
- Handle token refresh (X tokens expire)
- Graceful errors when token invalid (show "Reconnect" prompt)

Implement:
- Background task that refreshes X tokens 10 min before expiry
- When a post fails due to invalid token, auto-trigger reconnect prompt
- Settings page shows per-account status: connected / expired / error

---

## Section 12 — Platform backfill

### 12.1 External posts migration

`supabase/migrations/20260420000500_v10_external_posts.sql`:

```sql
CREATE TABLE IF NOT EXISTS external_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  content TEXT,
  media_urls TEXT[],
  posted_at TIMESTAMPTZ NOT NULL,
  metrics JSONB,
  metrics_updated_at TIMESTAMPTZ,
  matched_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  raw JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, account_id, external_id)
);

CREATE INDEX idx_external_posts_user_time ON external_posts(user_id, posted_at DESC);
CREATE INDEX idx_external_posts_platform_time ON external_posts(platform, posted_at DESC);
CREATE INDEX idx_external_posts_account_time ON external_posts(account_id, posted_at DESC);

ALTER TABLE external_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_external" ON external_posts
  FOR ALL USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS backfill_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  oldest_fetched_at TIMESTAMPTZ,
  newest_fetched_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  is_complete BOOLEAN DEFAULT FALSE,
  error_count INT DEFAULT 0,
  last_error TEXT,
  PRIMARY KEY (user_id, platform, account_id)
);

ALTER TABLE backfill_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_progress" ON backfill_progress
  FOR ALL USING (user_id = auth.uid());
```

### 12.2 LinkedIn backfill

`lib/platforms/linkedin/fetch.ts`:

```typescript
export async function fetchLinkedInPosts(params: {
  connection: OAuthConnection;
  before?: Date;  // cursor
  pageSize?: number;
}): Promise<{ posts: ExternalPost[]; hasMore: boolean; oldestDate: Date | null }> {
  const { connection, before, pageSize = 50 } = params;
  
  // URN depends on account type
  const authorUrn = connection.account_type === 'personal'
    ? `urn:li:person:${connection.account_id}`
    : `urn:li:organization:${connection.account_id}`;
  
  const url = new URL('https://api.linkedin.com/v2/ugcPosts');
  url.searchParams.set('q', 'authors');
  url.searchParams.set('authors', `List(${authorUrn})`);
  url.searchParams.set('count', String(pageSize));
  url.searchParams.set('sortBy', 'LAST_MODIFIED');
  
  if (before) {
    url.searchParams.set('end', String(before.getTime()));
  }
  
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      'LinkedIn-Version': '202405',
      'X-Restli-Protocol-Version': '2.0.0'
    }
  });
  
  if (!res.ok) {
    throw new Error(`LinkedIn API error: ${res.status}`);
  }
  
  const data = await res.json();
  
  const posts: ExternalPost[] = data.elements.map((el: any) => ({
    external_id: el.id,
    content: el.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text ?? '',
    posted_at: new Date(el.created.time),
    media_urls: extractMediaUrls(el),
    raw: el
  }));
  
  return {
    posts,
    hasMore: (data.paging?.count ?? 0) === pageSize,
    oldestDate: posts.length > 0 ? posts[posts.length - 1].posted_at : null
  };
}
```

### 12.3 X backfill

`lib/platforms/x/fetch.ts`:

```typescript
export async function fetchXPosts(params: {
  connection: OAuthConnection;
  paginationToken?: string;
  pageSize?: number;
}): Promise<{ posts: ExternalPost[]; nextToken: string | null; oldestDate: Date | null }> {
  const { connection, paginationToken, pageSize = 100 } = params;
  
  const url = new URL(`https://api.twitter.com/2/users/${connection.account_id}/tweets`);
  url.searchParams.set('max_results', String(Math.min(100, pageSize)));
  url.searchParams.set('tweet.fields', 'public_metrics,created_at,attachments,entities');
  url.searchParams.set('expansions', 'attachments.media_keys');
  url.searchParams.set('media.fields', 'url,preview_image_url,type');
  if (paginationToken) url.searchParams.set('pagination_token', paginationToken);
  
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${connection.access_token}` }
  });
  
  if (!res.ok) throw new Error(`X API error: ${res.status}`);
  
  const data = await res.json();
  
  const posts: ExternalPost[] = (data.data ?? []).map((tweet: any) => ({
    external_id: tweet.id,
    content: tweet.text,
    posted_at: new Date(tweet.created_at),
    media_urls: extractXMedia(tweet, data.includes),
    metrics: {
      impressions: tweet.public_metrics.impression_count,
      likes: tweet.public_metrics.like_count,
      retweets: tweet.public_metrics.retweet_count,
      replies: tweet.public_metrics.reply_count
    },
    raw: tweet
  }));
  
  return {
    posts,
    nextToken: data.meta?.next_token ?? null,
    oldestDate: posts.length > 0 ? posts[posts.length - 1].posted_at : null
  };
}
```

### 12.4 Backfill orchestration

`supabase/functions/backfill/index.ts` (Edge Function):

```typescript
// Called by: initial-backfill endpoint (on connect), lazy-load endpoint (on calendar navigation), cron (nightly sync)
export async function backfillConnection(params: {
  userId: string;
  platform: 'linkedin' | 'x';
  accountId: string;
  pages?: number;  // limit pages per run
}) {
  const { userId, platform, accountId, pages = 5 } = params;
  
  const connection = await getConnection(userId, platform, accountId);
  const progress = await getOrCreateProgress(userId, platform, accountId);
  
  let cursor = progress.oldest_fetched_at;
  let pagesDone = 0;
  
  while (pagesDone < pages) {
    const result = platform === 'linkedin'
      ? await fetchLinkedInPosts({ connection, before: cursor ?? undefined })
      : await fetchXPosts({ connection, paginationToken: cursor ?? undefined });
    
    if (result.posts.length === 0) {
      await markProgressComplete(userId, platform, accountId);
      break;
    }
    
    // Upsert posts
    await upsertExternalPosts(userId, platform, accountId, result.posts);
    
    // Update progress
    cursor = result.oldestDate;
    await updateProgress(userId, platform, accountId, {
      oldest_fetched_at: cursor,
      last_sync_at: new Date()
    });
    
    if (!('nextToken' in result ? result.nextToken : result.hasMore)) {
      await markProgressComplete(userId, platform, accountId);
      break;
    }
    
    pagesDone++;
  }
}
```

### 12.5 Trigger backfill

Three triggers:

1. **On connect success:** run first page immediately (for instant calendar feedback), queue background job for 5 more pages.

2. **Lazy-load on calendar navigation:** when user scrolls to a month older than `oldest_fetched_at`, call `/api/backfill/fetch-older` which runs 1 page of backfill.

3. **Nightly sync:** cron job that fetches NEW posts for all connections (posts posted since `newest_fetched_at`).

### 12.6 Post matching

When external post comes in, try to match to an in-app post:

```typescript
async function matchExternalToInternal(external: ExternalPost, userId: string) {
  // Match by content similarity + time window
  const { data: candidates } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'published')
    .gte('published_at', new Date(external.posted_at.getTime() - 10 * 60 * 1000))  // 10min before
    .lte('published_at', new Date(external.posted_at.getTime() + 10 * 60 * 1000)); // 10min after
  
  const match = candidates?.find(p => {
    const similarity = textSimilarity(p.content, external.content);
    return similarity > 0.85;  // 85% similar
  });
  
  if (match) {
    await supabase
      .from('external_posts')
      .update({ matched_post_id: match.id })
      .eq('external_id', external.external_id);
  }
}
```

---

## Section 13 — Calendar view

### 13.1 Calendar page

`app/(app)/calendar/page.tsx`:

Monthly view (default), week view toggle.

```
┌──────────────────────────────────────────────────────────┐
│ Calendar                  [Month ▾]  [< Apr 2026 >]     │
│                                                          │
│ Filter: [All accounts ▾]  [All platforms ▾]             │
│                                                          │
│ Mon    Tue    Wed    Thu    Fri    Sat    Sun          │
│  1      2      3      4      5      6      7           │
│         [LI]   [X]                                       │
│  8      9      10     11     12     13     14          │
│                [LI]                [LI][X]              │
│ 15     16     17     18     19     20     21          │
│ [X]    [LI]          [LI]                              │
│ 22     23     24     25     26     27     28          │
│ [LI]   [X]    [LI]          [X]   [LI]                 │
│ 29     30                                               │
│ [LI]   [X]                                              │
└──────────────────────────────────────────────────────────┘
```

Each cell shows platform icons for posts on that day.

Click a day → popover shows posts for that day with preview + metrics.

### 13.2 Data source

Query strategy:
- Past dates: `external_posts` only (real posts from platforms)
- Today: union of `external_posts` (already posted today) + `posts` where `status='scheduled'` and scheduled_for is today
- Future dates: `posts` where `status='scheduled'`

This removes phantoms because phantom posts aren't in `external_posts`.

### 13.3 Initial load performance

Query only visible month + 1 month before + 1 month after (3 months total).

Use `react-query` or Next.js `cache` for efficient invalidation.

### 13.4 Lazy pagination

When user navigates to a month older than backfill progress:
1. Show skeleton cells
2. Call `/api/backfill/fetch-older?platform=...&account_id=...&before=...`
3. Wait for response
4. Fill in cells with fetched data

Show "Fetching earlier posts..." indicator during load.

### 13.5 Performance card

Top of calendar page, a stats card:

```
┌──────────────────────────────────────────────────────────┐
│  This week                                               │
│                                                          │
│  LinkedIn: 2 originals ✓   3 reposts ✓                  │
│  X:        6 posts         2 video clips                 │
│                                                          │
│  Avg impressions (14d): 2,847  ↑ 12%                    │
│  Best hook category (14d): contrast (4,200 avg)         │
│                                                          │
│  ⚠ No post in 3 days on Facebook                        │
└──────────────────────────────────────────────────────────┘
```

Computed from `external_posts.metrics` aggregated per platform per week.

### 13.6 Click to expand day

Clicking a day opens a side drawer:

```
┌─────────────────────────────────────┐
│ Friday, April 17                    │
│                                     │
│ ── LinkedIn (2) ──                  │
│                                     │
│ ┌────────────────────────────────┐  │
│ │ [9:34 AM - personal]           │  │
│ │ "Abu Bakr gave everything..."  │  │
│ │ 3,240 impressions · 47 reacts  │  │
│ │ [Open on LinkedIn ↗]           │  │
│ └────────────────────────────────┘  │
│                                     │
│ ┌────────────────────────────────┐  │
│ │ [2:15 PM - TQG page]           │  │
│ │ (repost of personal)           │  │
│ │ 520 impressions · 12 reacts    │  │
│ └────────────────────────────────┘  │
│                                     │
│ ── X (3) ──                         │
│ ...                                 │
└─────────────────────────────────────┘
```

---

## Section 14 — Figure gap tracking (per-platform)

### 14.1 Migration

`supabase/migrations/20260420000600_v10_figure_history.sql`:

```sql
CREATE TABLE IF NOT EXISTS figure_post_history (
  figure_id UUID REFERENCES islamic_figures(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  account_id TEXT,
  PRIMARY KEY (figure_id, user_id, platform, posted_at)
);

CREATE INDEX idx_figure_history_lookup 
  ON figure_post_history(figure_id, user_id, platform, posted_at DESC);

-- Deprecate but don't drop yet; backfill from existing posts
INSERT INTO figure_post_history (figure_id, user_id, platform, posted_at, post_id)
SELECT 
  p.figure_id,
  p.user_id,
  unnest(p.platforms) AS platform,
  COALESCE(p.published_at, p.updated_at),
  p.id
FROM posts p
WHERE p.figure_id IS NOT NULL 
  AND p.status = 'published'
ON CONFLICT DO NOTHING;
```

### 14.2 Population trigger

When a post is published (or detected as published via backfill match):
```typescript
async function recordFigurePost(post: Post, platform: Platform, postedAt: Date) {
  if (!post.figure_id) return;
  
  await supabase
    .from('figure_post_history')
    .insert({
      figure_id: post.figure_id,
      user_id: post.user_id,
      platform,
      posted_at: postedAt,
      post_id: post.id
    });
}
```

### 14.3 Gap query

```typescript
async function getFigureGap(params: {
  figureId: string;
  userId: string;
  platform: Platform;
}): Promise<number | null> {
  const { data } = await supabase
    .from('figure_post_history')
    .select('posted_at')
    .eq('figure_id', params.figureId)
    .eq('user_id', params.userId)
    .eq('platform', params.platform)
    .order('posted_at', { ascending: false })
    .limit(1);
  
  if (!data?.length) return null;
  const daysSince = (Date.now() - new Date(data[0].posted_at).getTime()) / (1000 * 60 * 60 * 24);
  return Math.floor(daysSince);
}
```

### 14.4 Warning banner in editor

When figure selected + platforms chosen, check gap for each platform:

```tsx
<GapWarning post={post} />

// Component:
function GapWarning({ post }: { post: Post }) {
  const { data: gaps } = useQuery(['gaps', post.figure_id, post.platforms], () =>
    Promise.all(post.platforms.map(p => getFigureGap({ figureId: post.figure_id!, userId, platform: p })))
  );
  
  const warnings = gaps?.map((gap, i) => ({
    platform: post.platforms[i],
    gap,
    severity: gap === null ? 'none' : gap <= 3 ? 'red' : gap <= 7 ? 'amber' : 'none'
  })).filter(w => w.severity !== 'none');
  
  if (!warnings?.length) return null;
  
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
      {warnings.map(w => (
        <div key={w.platform} className={cn(
          "flex items-center gap-2",
          w.severity === 'red' && "text-red-400",
          w.severity === 'amber' && "text-amber-400"
        )}>
          {w.severity === 'red' ? '🔴' : '🟡'}
          You posted about {figure.name} on {w.platform} {w.gap} day{w.gap !== 1 ? 's' : ''} ago.
        </div>
      ))}
    </div>
  );
}
```

### 14.5 Figure library coloring

Every figure card in the library shows last-posted info per platform:

```
┌─────────────┐
│   [img]     │
│ Abu Bakr    │
│             │
│ LI: 5d      │ ← amber dot
│ X:  never   │ ← zinc
│ FB: 12d     │ ← no warning
└─────────────┘
```

---

## Section 15 — Hook performance tracking

### 15.1 Materialized view

`supabase/migrations/20260420000700_v10_hook_performance.sql`:

```sql
CREATE MATERIALIZED VIEW hook_performance AS
SELECT
  p.user_id,
  p.hook_category,
  p.figure_id,
  COUNT(*) AS post_count,
  AVG((ep.metrics->>'impressions')::INT) AS avg_impressions,
  AVG((ep.metrics->>'likes')::INT) AS avg_likes,
  MAX((ep.metrics->>'impressions')::INT) AS max_impressions
FROM posts p
JOIN external_posts ep ON ep.matched_post_id = p.id
WHERE p.hook_category IS NOT NULL
  AND ep.posted_at > NOW() - INTERVAL '90 days'
GROUP BY p.user_id, p.hook_category, p.figure_id;

CREATE UNIQUE INDEX idx_hook_perf_key 
  ON hook_performance(user_id, hook_category, figure_id);
```

### 15.2 Refresh job

Nightly cron refreshes:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY hook_performance;
```

### 15.3 Use in hook generation

When generating hooks for a post, pass performance data to the prompt:

```typescript
const perf = await getHookPerformance(userId, figureId);
// perf = { contrast: 3200, provocative: 5400, scene: 2100, ... }

const prompt = `
${baseHookPrompt}

The user's historical performance per hook category (avg impressions):
${Object.entries(perf).map(([cat, avg]) => `- ${cat}: ${avg}`).join('\n')}

Weight your suggestions toward better-performing categories, but still provide variety.
`;
```

### 15.4 Analytics view

Simple dashboard on `/analytics` (enhance in M2):
- Table: hook category, posts made, avg impressions, best post
- Highlight top 3 performers
- Show you've underused certain categories

---

## Section 16 — Command palette (Cmd+K)

### 16.1 Component

Use `cmdk` library.

```tsx
// components/CommandPalette.tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  
  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input placeholder="Type a command or search..." />
      <Command.List>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => router.push('/posts/new')}>
            New post
          </Command.Item>
          <Command.Item onSelect={() => router.push('/calendar')}>
            Open calendar
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Figures">
          {figures.map(f => (
            <Command.Item key={f.id} onSelect={() => router.push(`/figures/${f.id}`)}>
              {f.name}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Recent posts">
          {recentPosts.map(p => (
            <Command.Item key={p.id} onSelect={() => router.push(`/posts/${p.id}/edit`)}>
              {p.content?.slice(0, 60) || 'Untitled'}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

Include in root layout so `Cmd+K` works anywhere.

### 16.2 Searchable items

- All posts (by content, figure, status)
- All figures (by name, kunya)
- All hadith (by content, collection)
- All surahs (by name, number)
- Navigation targets (Calendar, Figures, Settings, etc.)
- Actions (New post, Toggle AI sidebar, Switch account, etc.)

---

## Section 17 — Settings / help center

### 17.1 Settings routes

- `/settings/account` — profile, timezone, theme
- `/settings/connections` — OAuth connections with account stack management
- `/settings/ai` — AI usage, cost breakdown, cap progress
- `/settings/preferences` — editor defaults, notification preferences
- `/settings/help` — feature explainers (see 17.2)
- `/settings/admin` — only visible to admin users (M3+)

### 17.2 Help center content

Each feature gets a help page. Written in plain English, with screenshots.

Initial help pages for M1:
- What is the kanban view?
- How do I write my first post?
- How does the AI assistant work?
- What do the red UNVERIFIED badges mean? (critical — explains hadith safety rule)
- How do I connect my LinkedIn company page?
- What do the figure warning colors mean?
- How does auto-save work?
- How do I use Cmd+K?

Store as MDX files in `content/help/*.mdx`. Render with Next.js.

Each help page has:
- Clear title
- 1-sentence summary at top
- 2-3 paragraphs of explanation
- Screenshots (generated from your actual app)
- "Still stuck?" link to contact (support@thequrangroup.com or similar)

---

## M1 shipping checklist

Before declaring M1 done, verify:

### Data integrity
- [ ] All V10 M1 migrations applied to production Supabase
- [ ] No references to `quality_score`, `readiness`, `review_status` anywhere in code
- [ ] `posts.status` has correct values for all existing rows
- [ ] RLS policies on all new tables
- [ ] At least 50 figures seeded with full data

### Functionality
- [ ] Kanban view renders without errors with 0 posts, 1 post, 100 posts
- [ ] Editor auto-saves every 3s without losing keystrokes
- [ ] Version history shows and restores correctly
- [ ] AI assistant generates hooks when API key present
- [ ] AI assistant shows "Copy to Claude" fallback when cap hit
- [ ] Hadith picker search returns results under 200ms
- [ ] UNVERIFIED badge blocks scheduling/publishing
- [ ] LinkedIn OAuth flow works for personal AND company page
- [ ] X OAuth supports 2+ accounts
- [ ] Account stack UI shows correct active avatar
- [ ] Calendar loads visible month in <1s
- [ ] Calendar shows NO phantom posts (test: delete all `posts` with status=published that aren't matched to external_posts)
- [ ] Figure gap warnings show correctly per platform
- [ ] Cmd+K opens palette and all search types work
- [ ] Settings pages all load without 404

### Polish
- [ ] No green vertical bar on active sidebar items
- [ ] Icon glow remains
- [ ] All loading states have skeletons, not spinners
- [ ] All empty states have helpful copy
- [ ] Mobile viewport: sidebar collapses, editor usable

### Documentation
- [ ] Help center has 8 pages at minimum
- [ ] Every API route has inline comments
- [ ] README updated with setup instructions
- [ ] `.env.example` lists all required env vars

### Performance
- [ ] Lighthouse score >90 on editor page
- [ ] JS bundle <300KB for editor route
- [ ] Calendar with 500 external posts renders in <1s

### Safety
- [ ] Attempted publish with unverified hadith is blocked in code, not just UI
- [ ] AI system prompts include the "never generate hadith refs" rule
- [ ] Integration test: ask AI to include a hadith reference, assert it doesn't

---

## M1 → M2 handoff

When M1 complete, you should be able to:
1. Draft a post entirely in the app
2. Use AI assistant to generate hooks, draft, and edit
3. Pull in a hadith (with UNVERIFIED flag) and Quran ayah
4. See a figure warning if you're drafting about someone you just posted about
5. See your real post history in the calendar
6. Copy the final content to Typefully

Before starting M2:
- Use the app for real TQG posting for at least 2 weeks
- Collect issues in a file `M2_Feedback.md`
- Pick what from M2 scope still applies vs what needs adjustment
