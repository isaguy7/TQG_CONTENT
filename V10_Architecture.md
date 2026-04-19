# V10 Architecture

Foundation document. Every milestone references this. Every DB migration goes through here first.

---

## Tech stack (locked)

| Layer | Tool | Why |
|---|---|---|
| Frontend framework | Next.js 14 App Router | Already in use, server components help perf |
| Styling | Tailwind CSS | Already in use |
| Component library | shadcn/ui | Already in use, customizable, owned code |
| State management | React Server Components + Zustand (client only) | RSC for server state, Zustand for local UI state |
| Database | Supabase Postgres | Already in use, includes auth + storage + realtime |
| Auth | Supabase Auth | OAuth + email, already configured |
| Storage | Supabase Storage | Images, video thumbnails, rendered clips |
| AI | Anthropic Claude API (server-side) | Claude Opus 4.x for complex, Sonnet for fast/cheap |
| Video | WhisperX + ffmpeg + NVENC (local, via Electron) | Free, GPU-accelerated |
| Scheduling (M2) | Inngest or Trigger.dev | Proven durable cron, retry built in |
| Billing (M4) | Stripe | Industry standard |
| Email (M4) | Resend | Good DX, integrates with Next.js |
| Hosting | Vercel | Already deployed |
| Error tracking | Sentry | Free tier, essential |
| Analytics | PostHog | Free tier, product + error analytics |

---

## Directory structure

Reorganize to this shape during M1. Current structure is flat and will not scale.

```
tqg-content-studio/
├── app/
│   ├── (auth)/                    # auth pages, no sidebar
│   │   ├── login/
│   │   ├── signup/
│   │   └── callback/
│   ├── (app)/                     # authenticated app, with sidebar
│   │   ├── layout.tsx             # sidebar + top nav
│   │   ├── posts/                 # main kanban + editor
│   │   │   ├── page.tsx           # kanban view
│   │   │   ├── [id]/
│   │   │   │   └── edit/page.tsx  # editor
│   │   │   └── new/page.tsx
│   │   ├── calendar/
│   │   ├── figures/               # figure library browser
│   │   ├── hadith/                # hadith library browser
│   │   ├── quran/                 # quran browser with tafsir
│   │   ├── clips/                 # video clip creator
│   │   ├── analytics/             # M2+
│   │   ├── settings/
│   │   │   ├── account/
│   │   │   ├── connections/       # OAuth management
│   │   │   ├── team/              # M4
│   │   │   ├── billing/           # M4
│   │   │   └── help/              # feature explainers
│   │   └── admin/                 # M3+ user approval, admin tools
│   ├── (marketing)/               # M4 public pages
│   │   ├── page.tsx               # landing
│   │   ├── pricing/
│   │   └── about/
│   └── api/
│       ├── posts/
│       ├── ai/                    # AI routes
│       │   ├── hooks/
│       │   ├── assistant/
│       │   └── slop-check/
│       ├── platforms/             # per-platform API routes
│       │   ├── linkedin/
│       │   ├── x/
│       │   ├── facebook/
│       │   └── instagram/
│       ├── publish/               # scheduling + posting engine (M2)
│       ├── media/                 # image/video processing
│       ├── render/                # render helper integration (M3)
│       ├── billing/               # Stripe webhooks (M4)
│       └── webhooks/
├── components/
│   ├── ui/                        # shadcn primitives
│   ├── editor/                    # post editor components
│   ├── kanban/                    # kanban view
│   ├── calendar/
│   ├── figures/
│   ├── hadith/
│   ├── quran/
│   ├── clips/
│   ├── ai-assistant/              # right sidebar
│   ├── platform-connectors/       # OAuth UI
│   ├── layout/                    # sidebar, top nav
│   └── shared/                    # generic reusable
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # browser client
│   │   ├── server.ts              # server client
│   │   └── admin.ts               # service role (server only)
│   ├── anthropic/
│   │   ├── client.ts
│   │   ├── prompts/               # system prompts as TS constants
│   │   └── usage-tracker.ts
│   ├── platforms/
│   │   ├── linkedin/
│   │   ├── x/
│   │   ├── facebook/
│   │   └── instagram/
│   │   # each has: auth.ts, post.ts, fetch.ts, types.ts
│   ├── publish/
│   │   ├── scheduler.ts           # M2
│   │   ├── queue.ts
│   │   └── retry.ts
│   ├── hadith/
│   │   ├── search.ts
│   │   ├── gradings.ts
│   │   └── verification.ts
│   ├── quran/
│   │   ├── search.ts
│   │   └── tafsir.ts
│   └── utils/
├── supabase/
│   ├── migrations/                # numbered SQL migrations
│   │   ├── 20260418000001_v10_post_status.sql
│   │   ├── 20260418000002_v10_platforms_array.sql
│   │   └── ...
│   └── seed/                      # seed data scripts
│       ├── figures.ts
│       ├── hook_angles.ts
│       └── themes.ts
├── types/                         # shared TypeScript types
├── scripts/                       # one-off scripts (import tafsir, etc)
└── public/
```

**Rules:**
- Every API route gets an `actions.ts` alternative using Server Actions where possible. Prefer Server Actions for mutations inside the app, API routes for external-facing endpoints.
- `lib/platforms/*` is the ONLY place platform APIs are called. Components/routes never import platform SDKs directly.
- `lib/supabase/admin.ts` is server-only. Importing it from a client component should error at build time.
- No file over 500 lines. Refactor before adding.

---

## DB schema — complete V10 target state

Below is every table, its purpose, and whether it exists now or needs to be created/migrated. All migrations are documented in the relevant milestone doc.

### Core

```sql
-- USERS & ORGS (M4 for orgs; user_profiles exists now)
user_profiles (
  id UUID PK REFERENCES auth.users,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT CHECK (role IN ('pending', 'member', 'admin')) DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users,
  timezone TEXT DEFAULT 'UTC',
  preferences JSONB DEFAULT '{}'::jsonb,  -- UI prefs, defaults
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- M4: organizations for teams
organizations (
  id UUID PK,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT CHECK (plan IN ('free', 'creator', 'team', 'org')) DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  owner_id UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- M4: membership + roles
organization_members (
  organization_id UUID REFERENCES organizations ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'editor', 'viewer')) NOT NULL,
  invited_by UUID REFERENCES auth.users,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
)
```

### Posts

```sql
-- M1: redesigned from current schema
posts (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations,  -- nullable until M4
  
  -- Core
  title TEXT,  -- internal working title
  status TEXT CHECK (status IN ('idea', 'draft', 'scheduled', 'published', 'failed', 'archived')) DEFAULT 'draft',
  content TEXT,  -- the actual post body
  content_html TEXT,  -- rich text if editor supports
  
  -- Platform targeting
  platforms TEXT[] DEFAULT ARRAY[]::TEXT[],  -- ['linkedin', 'x', 'facebook']
  platform_variants JSONB DEFAULT '{}'::jsonb,  -- per-platform content overrides
  
  -- Context
  figure_id UUID REFERENCES islamic_figures,
  hadith_refs UUID[] DEFAULT ARRAY[]::UUID[],  -- references to hadith_verifications
  quran_refs TEXT[] DEFAULT ARRAY[]::TEXT[],  -- format: 'surah:ayah[-endAyah]'
  
  -- Media
  images TEXT[] DEFAULT ARRAY[]::TEXT[],  -- supabase storage URLs
  video_id UUID REFERENCES video_projects,
  
  -- Hook tracking
  hook_category TEXT,  -- contrast | provocative | scene | purpose | refusal | dua | scale | loss | character
  hook_text TEXT,
  hooks_generated JSONB,  -- the batch of hooks that was generated, for A/B reference
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  
  -- Draft history (M1)
  version INT DEFAULT 1,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

-- M1: post version history (auto-save)
post_versions (
  id UUID PK DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts ON DELETE CASCADE,
  version INT NOT NULL,
  content TEXT,
  content_html TEXT,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  saved_by UUID REFERENCES auth.users,
  UNIQUE(post_id, version)
);

-- M2: the actual publishing queue (separate from posts)
-- One post → N publish_jobs (one per platform)
publish_jobs (
  id UUID PK DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,  -- which OAuth connection
  content TEXT NOT NULL,  -- final rendered content for this platform
  media_urls TEXT[],
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('queued', 'processing', 'published', 'failed', 'cancelled')),
  attempts INT DEFAULT 0,
  last_error TEXT,
  external_post_id TEXT,  -- provider's ID after successful publish
  external_url TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_publish_jobs_scheduled ON publish_jobs(status, scheduled_for) WHERE status IN ('queued', 'processing');
```

### Islamic knowledge base

```sql
-- Already exists, keep as-is
islamic_figures (
  id UUID PK,
  name TEXT NOT NULL,
  arabic_name TEXT,
  kunya TEXT,
  category TEXT,  -- sahabah, prophets, scholars, wives_of_prophet, etc
  short_bio TEXT,
  full_bio TEXT,
  birth_year INT,  -- Hijri or CE, denote in metadata
  death_year INT,
  era_metadata JSONB,
  posts_written INT DEFAULT 0,
  -- last_posted_at is DEPRECATED in V10, replaced by per-platform tracking
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction tables exist
figure_themes (figure_id, theme TEXT, PRIMARY KEY (figure_id, theme));
figure_hook_angles (figure_id, angle TEXT, category TEXT, PRIMARY KEY (figure_id, angle));

-- M1: per-platform figure posting history (replaces last_posted_at on figures)
figure_post_history (
  figure_id UUID REFERENCES islamic_figures ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  platform TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  post_id UUID REFERENCES posts ON DELETE SET NULL,
  PRIMARY KEY (figure_id, user_id, platform, posted_at)
);

CREATE INDEX idx_figure_history_lookup 
  ON figure_post_history(figure_id, user_id, platform, posted_at DESC);
```

### Hadith

```sql
-- Already exists with 29,685 rows. Extend with grading.
hadith_verifications (
  id UUID PK,
  collection TEXT NOT NULL,  -- bukhari, muslim, tirmidhi, etc
  book_number INT,
  book_name TEXT,
  hadith_number TEXT,  -- can be '1' or '1.2' for sub-hadith
  
  -- Content
  arabic TEXT,
  english TEXT,
  urdu TEXT,  -- optional
  
  -- Metadata
  narrator TEXT,
  sunnah_com_url TEXT NOT NULL,
  
  -- M1: grading fields (migrate in)
  grading TEXT CHECK (grading IN ('sahih', 'hasan', 'daif', 'mawdu', 'unknown')),
  grading_source TEXT,  -- 'Darussalam' | 'al-Albani' | 'Shuaib Arnaut' | etc
  secondary_gradings JSONB,  -- array of {grading, source, notes} for hadith with multiple graders
  
  -- M1: verification (per-user, separate from grading)
  -- This table does NOT track verification. See hadith_user_verifications below.
  
  -- Search
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', COALESCE(english, '') || ' ' || COALESCE(narrator, ''))) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hadith_search ON hadith_verifications USING GIN(search_vector);
CREATE INDEX idx_hadith_collection ON hadith_verifications(collection, hadith_number);
CREATE INDEX idx_hadith_grading ON hadith_verifications(grading);

-- M1: per-user verification (user confirmed they read the hadith on sunnah.com)
hadith_user_verifications (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  hadith_id UUID REFERENCES hadith_verifications ON DELETE CASCADE,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, hadith_id)
);

-- M1: recently viewed (separate from verified)
hadith_recently_viewed (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  hadith_id UUID REFERENCES hadith_verifications ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, hadith_id)
);

CREATE INDEX idx_hadith_recent ON hadith_recently_viewed(user_id, viewed_at DESC);
```

### Quran

```sql
-- Exist already
surahs (number INT PK, name_arabic, name_english, revelation_place, total_ayahs);
quran_cache (id, surah_number, ayah_number, arabic, translation_saheeh, ...);

-- M1: additional translations
quran_translations (
  surah_number INT,
  ayah_number INT,
  translator TEXT,  -- 'saheeh_international', 'pickthall', 'yusuf_ali'
  text TEXT NOT NULL,
  PRIMARY KEY (surah_number, ayah_number, translator)
);

-- M1: tafsirs (new — multi-source)
quran_tafsirs (
  id UUID PK DEFAULT gen_random_uuid(),
  surah_number INT NOT NULL,
  ayah_number INT NOT NULL,  -- for multi-ayah tafsirs, repeat this row per covered ayah
  source TEXT NOT NULL,  -- 'ibn_kathir', 'tabari', 'qurtubi', 'maarif_ul_quran'
  language TEXT DEFAULT 'en',
  text TEXT NOT NULL,
  ayah_range TEXT,  -- original range e.g. '2:255-256' if grouped
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(surah_number, ayah_number, source, language)
);

CREATE INDEX idx_tafsir_lookup ON quran_tafsirs(surah_number, ayah_number, source);
```

### Platform connections

```sql
-- Exists, extend in M1
oauth_connections (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  platform TEXT NOT NULL,  -- linkedin, x, facebook, instagram
  account_id TEXT NOT NULL,  -- provider's user/page/account id
  account_type TEXT,  -- 'personal', 'company_page', 'business_account'
  
  -- M1: link company pages to personal account
  parent_connection_id UUID REFERENCES oauth_connections ON DELETE CASCADE,
  
  -- Display
  display_name TEXT,
  avatar_url TEXT,
  handle TEXT,  -- @username where applicable
  
  -- Tokens
  access_token TEXT,  -- encrypted server-side
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  
  -- Metadata
  provider_metadata JSONB,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  
  UNIQUE(user_id, platform, account_id)
);

CREATE INDEX idx_oauth_user_platform ON oauth_connections(user_id, platform);
CREATE INDEX idx_oauth_parent ON oauth_connections(parent_connection_id);
```

### External post tracking

```sql
-- M1: backfilled posts from platform APIs (source of truth for calendar)
external_posts (
  id UUID PK DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  
  content TEXT,
  media_urls TEXT[],
  posted_at TIMESTAMPTZ NOT NULL,
  
  -- Metrics (refreshed periodically)
  metrics JSONB,
  metrics_updated_at TIMESTAMPTZ,
  
  -- Linkage back to in-app post if we can match
  matched_post_id UUID REFERENCES posts ON DELETE SET NULL,
  
  -- Raw payload for debugging
  raw JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(platform, account_id, external_id)
);

CREATE INDEX idx_external_posts_time ON external_posts(user_id, posted_at DESC);
CREATE INDEX idx_external_posts_platform ON external_posts(platform, posted_at DESC);

-- M1: backfill state per connection
backfill_progress (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
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
```

### Video

```sql
-- Exists, refined in M3
video_projects (
  id UUID PK,
  user_id UUID REFERENCES auth.users,
  project_type TEXT CHECK (project_type IN ('short_clip', 'long_edit', 'batch_clip')),
  source_url TEXT,  -- YouTube URL or upload URL
  source_metadata JSONB,
  
  -- M3: transcription preferences
  transcription_source TEXT CHECK (transcription_source IN ('captions', 'whisperx', 'hybrid')),
  transcription_data JSONB,
  
  -- M3: Quran matching for long-edits
  quran_matches JSONB,  -- [{start_time, end_time, surah, ayah}]
  
  output_url TEXT,  -- final rendered video
  thumbnail_url TEXT,
  duration_seconds INT,
  
  status TEXT CHECK (status IN ('idle', 'downloading', 'transcribing', 'rendering', 'complete', 'failed')),
  progress INT DEFAULT 0,
  error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- M3: batch of clips (short_clip batches)
clip_batch (
  id UUID PK,
  user_id UUID REFERENCES auth.users,
  name TEXT,
  clips JSONB,  -- [{surah, ayah, status, video_url}]
  style_preset JSONB,  -- background, font, watermark choices
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- M3: render job queue (Electron helper pulls from this)
render_jobs (
  id UUID PK,
  user_id UUID REFERENCES auth.users,
  video_project_id UUID REFERENCES video_projects,
  batch_id UUID REFERENCES clip_batch,
  job_type TEXT CHECK (job_type IN ('short_clip', 'long_edit')),
  input JSONB NOT NULL,
  status TEXT CHECK (status IN ('queued', 'claimed', 'running', 'complete', 'failed')),
  progress INT DEFAULT 0,
  output_url TEXT,
  error TEXT,
  claimed_by TEXT,  -- device id
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- M3: render helper device pairing
device_pairings (
  code TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  device_name TEXT,
  device_id TEXT,  -- set after pairing
  token TEXT,  -- issued after successful pair
  paired_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Content calendar & analytics

```sql
-- M1: content calendar (derived, mostly a view over posts + external_posts)
-- Probably doesn't need its own table. Use views.
CREATE VIEW content_calendar_v AS
SELECT 
  'scheduled' AS source, 
  id, user_id, platforms, scheduled_for AS event_time,
  content AS preview_text, status
FROM posts WHERE status = 'scheduled'
UNION ALL
SELECT 
  'published_external' AS source,
  id, user_id, ARRAY[platform], posted_at AS event_time,
  content AS preview_text, 'published' AS status
FROM external_posts;

-- M1: hook performance tracking (derived, but materialize for speed)
-- Aggregates external_posts metrics by hook_category from matched posts
CREATE MATERIALIZED VIEW hook_performance AS
SELECT
  p.user_id,
  p.hook_category,
  COUNT(*) AS post_count,
  AVG((ep.metrics->>'impressions')::INT) AS avg_impressions,
  AVG((ep.metrics->>'engagement_rate')::FLOAT) AS avg_engagement
FROM posts p
JOIN external_posts ep ON ep.matched_post_id = p.id
WHERE p.hook_category IS NOT NULL
GROUP BY p.user_id, p.hook_category;

-- Refresh nightly via cron
```

### Usage & billing

```sql
-- Exists
api_usage (
  id UUID PK,
  user_id UUID REFERENCES auth.users,
  feature TEXT,  -- 'hook_generation', 'assistant_draft', 'slop_check', etc
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_usd NUMERIC(10, 6),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_user_time ON api_usage(user_id, created_at DESC);

-- M4: usage limits per plan
plan_limits (
  plan TEXT PRIMARY KEY,
  posts_per_month INT,
  ai_cost_cap_monthly_usd NUMERIC(10, 2),
  platform_connections_max INT,
  video_minutes_per_month INT,
  team_members_max INT,
  features TEXT[]  -- feature flags per plan
);

-- M4: Stripe subscriptions (minimal — Stripe is source of truth)
subscriptions (
  id UUID PK,
  user_id UUID REFERENCES auth.users,
  organization_id UUID REFERENCES organizations,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT,
  status TEXT,  -- active, past_due, cancelled
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Auth model

### Current (keep, extend)
- Supabase Auth with email + OAuth (Google, LinkedIn, X)
- `user_profiles` table with `role` (`pending | member | admin`)
- Pending users can sign up but see "awaiting approval" screen
- Admin approves via admin UI (built in M3)

### M4 additions
- Organizations: users belong to 0..N orgs
- Active org context in session (stored in JWT claim or cookie)
- Invite flow (email → signup → auto-join org)
- Role checks: `owner > admin > editor > viewer`
  - Owner: billing, delete org
  - Admin: invite/remove members, manage integrations
  - Editor: create/edit/publish posts
  - Viewer: read-only

### RLS strategy

Every table with `user_id` has RLS:
```sql
CREATE POLICY "user_owns_row" ON <table>
  FOR ALL USING (user_id = auth.uid());
```

Every table with `organization_id` (M4):
```sql
CREATE POLICY "org_member_can_access" ON <table>
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );
```

Role-restricted operations use `auth.jwt() ->> 'role'` checks.

Public-read tables (figures, hadith, quran): no RLS restrictions on SELECT, only admins can INSERT/UPDATE.

---

## AI architecture

### Client wrapper

```typescript
// lib/anthropic/client.ts
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeClient {
  private client: Anthropic;
  
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  
  async complete(params: {
    userId: string;
    feature: string;  // for usage tracking
    systemPrompt: string;
    messages: Anthropic.MessageParam[];
    model?: 'opus' | 'sonnet' | 'haiku';
    maxTokens?: number;
  }): Promise<{ text: string; usage: UsageRecord }> {
    // 1. Check user's monthly cap
    const capOk = await checkUserCap(params.userId);
    if (!capOk) throw new CapExceededError();
    
    // 2. Map model name to actual string
    const model = {
      opus: 'claude-opus-4-7',
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-haiku-4-5-20251001'
    }[params.model || 'sonnet'];
    
    // 3. Call API
    const response = await this.client.messages.create({
      model,
      max_tokens: params.maxTokens || 4096,
      system: params.systemPrompt,
      messages: params.messages
    });
    
    // 4. Record usage
    const usage = await recordUsage({
      userId: params.userId,
      feature: params.feature,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    });
    
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('\n');
    
    return { text, usage };
  }
}
```

### Model selection

- **Haiku 4.5:** slop checks, hashtag suggestions, quick summaries (fast + cheap)
- **Sonnet 4.6:** hook generation, draft editing, platform conversion (main workhorse)
- **Opus 4.7:** full-draft generation with figure context, long-form creative (quality-first)

### Prompt library

Store as TS constants in `lib/anthropic/prompts/`:
- `hooks.ts` — hook generation for all 9 categories
- `draft.ts` — full draft from scratch
- `edit.ts` — edit current post actions (tighten, stronger hook, etc.)
- `slop-check.ts` — anti-slop detection
- `convert.ts` — LinkedIn → X / Facebook / Instagram conversion
- `system-base.ts` — shared system prompt rules (never generate hadith refs, Isa's voice, etc.)

Never inline prompts in routes. Always import from library.

### Usage caps

- Free tier: $2/month AI budget per user (soft limit)
- Creator tier: $15/month AI budget per user
- Team tier: shared $50/month per org
- Hard cap: 2x soft limit triggers cutoff

When cap hit: UI shows "Copy to Claude.ai" fallback buttons everywhere AI was used.

---

## Platform integration pattern

Every platform lives in `lib/platforms/<name>/` with:

```
lib/platforms/linkedin/
├── auth.ts        # OAuth init, callback handling, token refresh
├── post.ts        # Publishing (text, image, video)
├── fetch.ts       # Fetch existing posts for backfill
├── types.ts       # TypeScript types for this platform
└── pages.ts       # LinkedIn-specific: company page management
```

All platforms implement a common interface:

```typescript
// lib/platforms/types.ts
export interface PlatformAdapter {
  auth: {
    getAuthUrl(state: string): string;
    handleCallback(code: string): Promise<ConnectionData>;
    refreshToken(refreshToken: string): Promise<TokenData>;
  };
  post: {
    publish(connection: Connection, content: PostContent): Promise<PublishResult>;
    schedule?(connection: Connection, content: PostContent, when: Date): Promise<ScheduleResult>;
  };
  fetch: {
    getPosts(connection: Connection, options: FetchOptions): Promise<ExternalPost[]>;
    getMetrics(connection: Connection, postId: string): Promise<Metrics>;
  };
}
```

This lets us swap platforms or add new ones without touching the rest of the app.

---

## Supabase Edge Functions

Use Edge Functions for:
- OAuth callbacks (need server-side token exchange)
- Webhook receivers (Stripe, platform webhooks)
- Backfill jobs (long-running, don't want serverless timeouts on Vercel)
- Scheduled cron (via `pg_cron` + Edge Function calls)

Edge Functions in:
```
supabase/functions/
├── oauth-callback/
├── backfill-linkedin/
├── backfill-x/
├── publish-post/      # M2: cron-triggered
├── refresh-metrics/   # M2: nightly
├── stripe-webhook/    # M4
└── cron/              # cron entry points
```

---

## Environment variables

Document all env vars in `.env.example`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # server only

# Anthropic
ANTHROPIC_API_KEY=  # server only

# Platform OAuth (server only)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
X_CLIENT_ID=
X_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

# Third-party APIs
QURAN_COM_API_BASE=https://api.quran.com/api/v4
SUNNAH_COM_API_BASE=...

# Billing (M4)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Email (M4)
RESEND_API_KEY=

# Observability
SENTRY_DSN=
POSTHOG_KEY=

# App
NEXT_PUBLIC_APP_URL=https://...
```

---

## Security

### Token storage
- Platform OAuth tokens: encrypt at rest using Supabase Vault or pgcrypto. Never store plaintext.
- Service role key: never in client bundles. Enforce via build-time check.
- Anthropic API key: server-side only.

### RLS everywhere
- Default deny. Explicit allow per table.
- Test every policy with integration tests.

### Rate limiting
- Per-user rate limits on all API routes (Upstash Redis or Supabase + counter).
- IP-based rate limits on auth endpoints.
- Stricter limits on AI endpoints.

### Input validation
- Zod schemas for every API route body.
- Sanitize content before posting to platforms (some platforms reject specific characters).
- Max content length validation per platform.

### Content security
- User-uploaded images: scan for NSFW via a moderation API before accepting.
- Platform tokens: rotate on suspicious activity detection.

---

## Observability

### Sentry
- Wrap all API routes with Sentry.
- Tag errors with user_id, feature, organization_id.
- Alert on 5xx rate > 1%.

### PostHog
- Track key events: `post_created`, `post_published`, `ai_feature_used`, `figure_selected`, etc.
- Funnels: signup → first_post_created → first_post_published
- Feature flags for gradual rollouts

### Logs
- Structured logging (JSON) for all server code.
- Log retention: 30 days minimum.

### Metrics dashboards (M4 admin)
- DAU, WAU, MAU
- Posts created vs published (conversion)
- AI cost per user, per feature, total
- Platform API error rates
- Queue depth for scheduled posts

---

## Performance targets

- Page TTFB: <300ms
- Page LCP: <1.5s
- Editor keystroke to render: <16ms (60fps)
- Calendar load (90 days): <800ms
- Hook generation: <5s (shows loading state)
- Search-as-you-type (hadith): <200ms per keystroke

Budget:
- JS bundle: <300KB gzipped per route
- Images: WebP + responsive srcset
- Fonts: max 2 families, preloaded

---

## Testing strategy

### M1
- Vitest for lib/ functions (prompts, platform adapters, utils)
- Playwright for critical flows: signup → create post → publish
- Type safety as primary line of defense

### M2+
- API route integration tests (Vitest + msw)
- Database migration tests (run migrations on test DB, assert schema)
- Scheduling engine reliability tests (time travel, retries)

### M4
- Load tests (k6 or similar) on auth endpoints, AI endpoints, scheduling
- End-to-end billing flow tests (Stripe test mode)

---

## Migration discipline

Every schema change:
1. Written as numbered migration in `supabase/migrations/`
2. Never mutate an existing migration — write a new one
3. Include down-migration where feasible
4. Test on dev Supabase branch before merging to main
5. Mark in the relevant milestone doc

Example filename: `20260420000001_v10_add_grading_to_hadith.sql`

Use `supabase db push` in development, GitHub Actions in CI.
