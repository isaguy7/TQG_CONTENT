# V10 M1 — Implementation Plan

Companion to `V10_M1_Writer.md`. This file is the *how*, not the *what*.
Spec section numbers in parentheses link to V10_M1_Writer.md.

**Scope:** Ship the Writer — app replaces Claude.ai for TQG drafting.
**Duration:** 8 weekends, ~48–64 focused hours.
**Ships:** Kanban + Tiptap editor + figure library + hadith/Quran pickers + AI assistant + real calendar.
**Still manual in M1:** Copy-paste to Typefully. Auto-publishing is M2.

**Locked decisions (from pre-plan Q&A + Apr 18 product direction):**
- Status migration: `drafting/review/ready → draft`; then `idea → draft → scheduled/published` as single forward path.
- Kanban: move to `/posts`, redirect `/content` → `/posts`.
- Editor: full Tiptap rewrite, no incremental textarea retention.
- AI sidebar: full rebuild per spec; existing `AiAssistantDrawer` chat replaced.
- Figure seed: scaffold idempotent seed script only (NO junction tables — `islamic_figures.themes text[]` and `hook_angles jsonb` already embedded). Defer 55 figures of content to `V10_Figure_Seed_Data.json` (TBD).
- Model IDs: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. Pricing values need verification before launch.
- **Multi-tenancy: FULL UI in M1.** `organizations` + `organization_members` tables; every user-scoped table gets `organization_id`; invite flow with email; role management (owner/admin/editor/viewer); org switcher; per-user usage attribution. **~10 hours of work untestable until second TQG user joins.**
- **Onboarding wizard in M1.** New users get welcome → create org → connect platform → pick figure categories → guided first post → land in kanban.
- **Platform integration: adapter pattern with Typefully bridge.** Typefully = active adapter in M1. LinkedIn + X = dormant skeletons that activate via env flags when APIs approved. Direct posting IS the long-term product; Typefully is transitional.
- **No LinkedIn OAuth in M1.** Old app deleted, Community Management-only app pending review. Email sign-in only. All LinkedIn data flows through Typefully.
- Product naming: keep "TQG Content Studio" through M1. Use template vars (`{{product_name}}`) in user-facing strings — never hardcode for easy rebrand.

**Schema reality (from Supabase MCP audit, Apr 18 2026):**
- `islamic_figures` has `themes text[]` and `hook_angles jsonb` as columns directly. **No junction tables.** Plan's original §6 scaffold was wrong.
- 29,685 hadith live in **`hadith_corpus`**, NOT `hadith_verifications`.
- `hadith_verifications` has 2 rows and is **already the per-user verification table** (has `verified`, `verification_notes`, `verified_at`). Plan's proposed `hadith_user_verifications` is redundant — reuse this.
- `posts.platform` is `TEXT` (singular), not `TEXT[]`. `platform_versions` exists as JSONB.
- Reference table is **`surah_metadata`**, not `surahs`.
- `tafsir_cache` exists with 1 row — effectively empty. Reuse or rename when importing tafsirs.
- `content_revisions` has 0 rows — sunset is trivial (nothing to migrate).
- **🚨 RLS DISABLED on all 18 public tables.** `oauth_connections.access_token/refresh_token` exposed via API. App works today only because queries use service-role admin client. Needs immediate remediation.

---

## Section-by-section plan

### Section 0 — Onboarding wizard + org creation (spec: new, not in V10_M1_Writer.md)

**Goal:** First-run experience for new users + full multi-tenancy workspace UI.

**Current state:** No onboarding. User hits blank app. Single-user implicit.

**Gap:** Sign-up flow, org creation, invite flow, role UI, sample data seeding, guided first post.

**Note:** Schema for this is created in §1 (multi-tenancy migration). This section builds the UI on top.

**Build order:** §0 builds *after* §1 foundation is solid, *before* §2 post model. Approximately W1 late + W2 early. Scaffolding lives alongside §1 but full wizard UI waits until other components exist to showcase (so parts of §0 may land in W8 — see weekend plan).

**Steps:**

**§0.1 — Sign-up & org creation flow**
1. `src/app/(auth)/signup/page.tsx` — email + password form. Existing email auth extended.
2. On sign-up: create `organizations` row + add user as `owner` in `organization_members`. Default org name = "{email_local_part}'s workspace" (e.g. "shuaybisakhan's workspace"). User can rename in settings.
3. `src/app/(app)/onboarding/page.tsx` — wizard host.
4. Wizard step 1: Welcome. One sentence pitch. "Let's set up your workspace."
5. Wizard step 2: Org name + slug (pre-filled, editable).
6. Wizard step 3: Platform connection — Typefully API key input OR "I'll connect later" button. Validate key on submit.
7. Wizard step 4: Figure category selection — checkboxes for Prophets / Sahabah / Women / Scholars. Store preference in `user_profiles.figure_category_prefs JSONB`.
8. Wizard step 5: Guided first post — pick figure (pre-filtered by selected categories) → hook category dropdown → "Generate 3 hooks" (calls `/api/ai/hooks` with `count=3`) → pick one → inserts into draft → land in kanban with draft visible.

**§0.2 — Invite flow**
1. `src/app/(app)/settings/team/page.tsx` — member list + invite form.
2. Invite form: email input + role dropdown → creates `organization_invites` row → sends email via Resend.
3. `src/app/(auth)/invite/[token]/page.tsx` — accept invite landing page. If user logged out → sign up, auto-accept on completion. If logged in → confirm + add to org.
4. Invite expiry: 7 days. Expired invites show friendly "this invite expired, ask {inviter} for a new one" message.
5. Resend integration: `src/lib/email/client.ts` — wraps Resend SDK. Template: `src/lib/email/templates/invite.tsx` (React Email). Env: `RESEND_API_KEY`.

**§0.3 — Role management**
1. Member list shows avatar + name + role + joined date + actions menu.
2. Role change: dropdown. Blocked: demoting the last owner. Confirm dialog for role decreases.
3. Remove member: confirm dialog. Blocks removing self (must use Leave Workspace).
4. Leave workspace action: confirms, removes self from `organization_members`. If user was sole owner, must transfer ownership first.
5. Transfer ownership flow: select another member → confirms → swaps roles atomically.

**§0.4 — Org switcher**
1. `src/components/OrgSwitcher.tsx` — dropdown in top nav (or bottom-left sidebar, aligned with existing account stack UI).
2. Shows current org name + avatar (initials on gradient).
3. Click → dropdown of all user's orgs + "Create new workspace" action.
4. On switch: update `user_profiles.active_organization_id` + localStorage `tqg.active_org_id`. Reload data (use react-query invalidation).
5. Route guard: every `(app)` route checks `useActiveOrg()` returns a value; redirect to `/onboarding` if not.

**§0.5 — Sample data seeding**
1. On new org creation: insert 3-5 example posts with `is_sample=true` flag in `posts.metadata JSONB`.
2. Sample posts use figures from selected categories. Simple static templates like "Example: write about {figure.name}'s {trait}".
3. Sample posts show in Ideas column with subtle "Sample" badge. User can dismiss (hard-delete, not soft-delete).
4. Add column migration: `ALTER TABLE posts ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb`.

**§0.6 — Per-user usage attribution**
1. `api_usage` already exists (per memory). Add `organization_id` column + FK. Backfill from user's active org.
2. `/settings/ai` shows: total cost this month + per-user breakdown (when org has >1 member).
3. Cap enforcement: org-level cap. Optional per-user sub-cap (admin sets in `organization_members.usage_cap_usd`).
4. `recordUsage()` in `src/lib/anthropic/usage-tracker.ts` writes both `user_id` + `organization_id`.

**Verification:**
- Sign up with new email → wizard triggers → complete → land in kanban with 3-5 sample drafts.
- Invite teammate to existing org → receives email → clicks link → joins org with correct role.
- Owner demotes self → blocked with "transfer ownership first" message.
- Switch orgs → data visibly changes (different posts, figures, etc.). Reload → still on new org.
- Per-user cost shows correct split in `/settings/ai` when two users have both used AI.

> ❓ DECIDE: Default org slug — auto-generated from email (`shuaybisakhan-workspace`) or user-chosen? Recommend auto-generated + editable in settings.
> ❓ DECIDE: Invite email sender address — `noreply@tqg-content.vercel.app` or `hello@thequrangroup.com`? Latter needs domain verification in Resend.
> ❓ DECIDE: Transfer-ownership UI — inline dropdown or separate modal with double confirmation? Recommend modal for destructive action gravity.
> ❓ DECIDE: Sample posts — static templates or LLM-generated per figure (uses API budget)? Recommend static for M1.

---

### Section 1 — Foundation (spec §1)

**Goal:** Reorganise repo, establish migration discipline, kill the white-screen crash class.

**Current state:** `src/app/` flat, no route groups. `src/lib/` has supabase helpers in unknown shape (needs inventory at start). 3 migrations exist: `20260416000001_initial_schema.sql`, `20260416000002_publish_gate.sql`, `20260417000001_hadith_corpus.sql`. No root error boundary. Raw `.map()` calls present in components.

**Gap:** Route groups, shared clients, SafeList, error boundary, baseline migration export.

**Steps:**
1. ✅ DONE (commits `eb958ed` + `a024699` on `claude/implement-writer-app-tieYL`) — `src/lib/supabase/*` consolidation. 49 imports migrated, 3 old flat files dropped, `server-only` wired into `admin.ts`.
2. ✅ DONE (commits `57410f4` + `f37c888`) — route groups `(auth)` + `(app)`. All routes moved, URLs unchanged, builds clean.
3. Export current DB schema as `supabase/migrations/20260420000000_v10_baseline.sql` via `supabase db dump --schema-only`. Do NOT rename existing migrations — append-only.
4. **🚨 RLS remediation migration** `20260420000010_v10_enable_rls.sql`:
   - Enable RLS on all 18 public tables with temporary service-role-only policies. This locks down anon-key attack surface without breaking current queries (all go through service role).
   - Template per table:
     ```sql
     ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;
     CREATE POLICY "service_role_all" ON public.{table} 
       FOR ALL TO service_role USING (true) WITH CHECK (true);
     ```
   - Shared reference tables (`hadith_corpus`, `quran_cache`, `islamic_figures`, `surah_metadata`, `figure_hadith_refs`, `figure_quran_refs`, `tafsir_cache`) additionally get:
     ```sql
     CREATE POLICY "authenticated_read" ON public.{table} 
       FOR SELECT TO authenticated USING (true);
     ```
   - `oauth_connections` gets NO authenticated policy (service-role-only) — contains tokens.
   - After this migration: run `get_advisors(type=security)` again; expect zero `rls_disabled_in_public` errors.
   - Move `pg_trgm` extension out of public schema (fixes WARN-level advisor).
   - Verify app still works end-to-end — all queries should succeed because they use service-role admin client.
5. **Multi-tenancy schema migration** `20260420000050_v10_multitenancy.sql`:
   - `organizations` table: `id`, `name`, `slug` (url-safe, unique), `created_at`, `owner_id` (FK to `auth.users`), `deleted_at`.
   - `organization_members` table: `organization_id`, `user_id`, `role` CHECK `('owner','admin','editor','viewer')`, `joined_at`, `invited_by`. PK: `(organization_id, user_id)`.
   - `organization_invites` table: `id`, `organization_id`, `email`, `role`, `token` (unique), `invited_by`, `expires_at`, `accepted_at`, `created_at`.
   - `user_profiles` adds `active_organization_id UUID`.
   - Create default org "The Quran Group" for Isa (user_id `a004cb71-f78a-4f2a-8342-dea9be6a8c8a`). Seed Isa as `owner`. Set `user_profiles.active_organization_id`.
   - RLS policies on all three new tables using `organization_members` membership check.
6. Create barrel modules: `src/lib/{platforms,anthropic,hadith,quran}/index.ts`.
7. `src/lib/org/` — helpers: `useActiveOrg()` hook, `withOrg()` RLS policy template, `requireRole(role)` route guard, `getActiveOrgId()` server-side.
8. Add `src/app/error.tsx` error boundary at root (not `(app)/error.tsx` — root catches across route groups). No Sentry in M1.
9. Add `src/components/shared/SafeList.tsx`. Grep `.map(` in components receiving Supabase data → wrap each.
10. `REFACTOR_DEBT.md` — list files >500 lines; skip editor page (gets rewritten in §5).

**Critical migration rule:** every subsequent migration adds `organization_id` to its new tables. Every RLS policy uses `auth.uid() IN (SELECT user_id FROM organization_members WHERE organization_id = {table}.organization_id)`. Forgetting this breaks the tenant boundary.

**Supabase MCP checkpoints:** after step 4 and step 5, call `get_advisors(security)` to confirm advisories dropped. After step 5, call `list_tables(schemas=['public'], verbose=true)` to verify new tables exist with expected columns.

**Verification:**
- `npm run build` clean.
- All existing app flows work post-reorg + post-RLS.
- Supabase MCP `get_advisors(security)` returns zero `rls_disabled_in_public` errors.
- Default org "The Quran Group" exists in `organizations`.
- Isa is owner in `organization_members`.
- `user_profiles.active_organization_id` set for Isa.
- Trigger deliberate error in a list component → recovery UI, not white screen.

> ✅ RESOLVED: Sentry deferred to M2.
> ✅ RESOLVED: Supabase consolidation via extend-then-move (done).
> ✅ RESOLVED: Route groups (done).
> ❓ DECIDE: `pg_trgm` move — target schema `extensions` (Supabase convention) or custom? Default to `extensions`.

---

### Section 2 — Post data model (spec §2)

**Goal:** Migrate post status model, add versioning + platform variants.

**Current state:** `posts.status` values are `idea/drafting/review/ready/scheduled/published`. `content_revisions` table exists. Columns the spec wants to drop (`quality_score`, `readiness`, `review_status`, platform-specific status columns) may or may not all exist — migration must be `IF EXISTS`-guarded.

**Gap:** Status value collapse, drop obsolete columns, add `platforms`/`platform_variants`/`hook_*`/`version`/`title`/`content_html`/`archived_at`, new `post_versions` table, sunset `content_revisions`.

**Steps:**
1. Migration `20260420000100_v10_post_status_model.sql`:
   - Drop status CHECK constraint.
   - `UPDATE posts SET status = 'draft' WHERE status IN ('drafting','review','ready')`.
   - Re-add CHECK with new values: `idea/draft/scheduled/published/failed/archived`.
   - All `DROP COLUMN IF EXISTS` for obsolete cols (spec §2.1) — most won't exist, safe no-op.
   - Add new columns per spec §2.1 that don't already exist. **Already exist:** `hooks_generated` (jsonb), `platform_versions` (jsonb), `performance` (jsonb), `deleted_at`, `labels`, `topic_tags`. **Add:** `platforms TEXT[]` (array, separate from existing singular `platform`), `hook_category`, `hook_text`, `version`, `title`, `content_html`, `archived_at`.
   - Migrate existing singular `posts.platform` into `platforms` array: `UPDATE posts SET platforms = ARRAY[platform] WHERE platforms IS NULL OR platforms = '{}'`.
   - Keep `posts.platform` column for one release (deprecated comment). Drop in M2 after new array proves stable.
   - **Add `organization_id UUID NOT NULL` with FK to `organizations(id)`. Backfill from `user_profiles.active_organization_id` for existing rows (all 7 rows go to Isa's default org).**
   - Add indexes per spec; add `idx_posts_org_status ON posts(organization_id, status)`.
   - **Update RLS:** drop temporary service-role-only policy, add real policies using `organization_members` membership check. Template:
     ```sql
     DROP POLICY "service_role_all" ON public.posts;
     CREATE POLICY "org_members_select" ON public.posts FOR SELECT TO authenticated
       USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
     CREATE POLICY "org_editors_write" ON public.posts FOR INSERT TO authenticated
       WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin','editor')));
     -- Similar for UPDATE, DELETE.
     ```
2. Migration `20260420000101_v10_post_versions.sql` — new table per spec §2.2.
3. Migration `20260420000102_v10_content_revisions_sunset.sql` — copy `content_revisions` rows into `post_versions` (map columns), then `ALTER TABLE content_revisions RENAME TO _deprecated_content_revisions`. Drop in M2 after 1 release of stability.
4. Generate `src/types/post.ts` from spec §2.3. Update all TS references.
5. Spec §2.4 grep-and-delete: `quality_score`, `quality_label`, `readiness`, `review_status`, `Suggestions`, `SuggestionPanel`, `belowOptimal`, `isReady`. Many will already be gone when §5 editor rewrite lands; do this pass after §5.

**Verification:** Apply migrations on dev branch; confirm no rows lost in status collapse (`SELECT count(*) FROM posts GROUP BY status` before/after). Build passes with new types.

> ❓ DECIDE: Existing `content_revisions` — map its columns to `post_versions` now, or leave data stranded in `_deprecated_content_revisions`? First is safer for version history continuity.
> ❓ DECIDE: Backfill `platforms = ARRAY['linkedin']` for all existing posts correct? Any X-only or FB-only historical posts?

---

### Section 3 — Sidebar & layout polish (spec §3)

**Goal:** Remove green bar, keep icon glow, simplify top nav, add right-sidebar toggle.

**Current state:** Sidebar active state uses green `before:` pseudo-bar. Top nav includes Suggestions button + platform status pills. No right-sidebar toggle.

**Gap:** CSS surgery on sidebar, remove Suggestions UI, add collapse toggles with localStorage.

**Steps:**
1. Edit sidebar component — remove `before:` bar, keep `shadow-[0_0_14px_rgba(27,94,32,0.5)]` glow on icon bg.
2. Remove Suggestions button + platform status pills from top nav.
3. Right-sidebar toggle button in editor header, wire to `tqg.ai_sidebar_open` + `tqg.context_panel_open` localStorage keys.
4. Test every nav item (Posts/Calendar/Figures/Hadith/Clips/Settings) — no bar, glow present.

**Verification:** Click through all nav items; toggle sidebar; refresh → state persists.

---

### Section 4 — Kanban view (spec §4)

**Goal:** Four-column kanban at `/posts`, redirect `/content` → `/posts`.

**Current state:** Flat posts list with status filter dropdown at `/content`. No drag-and-drop.

**Gap:** Route move, full kanban with DnD, per-column filters, empty states.

**Steps:**
1. Install `@dnd-kit/core` + `@dnd-kit/sortable`.
2. Create `src/app/(app)/posts/page.tsx` as four-column layout.
3. Redirect `/content` → `/posts` via `src/app/(app)/content/page.tsx` `redirect('/posts')`.
4. `src/components/kanban/{PostCard,KanbanColumn}.tsx` per spec §4.2.
5. Drag-end handlers: ideas↔drafts updates status only; drafts→scheduled opens date modal; archive is separate action (not a column).
6. Filter state in URL params via `useSearchParams` for shareable links.
7. Empty state components per spec §4.5.

**Verification:** 0/1/100 posts per column render without errors. Drag ideas→drafts updates DB. Reload preserves filter from URL. Visit `/content` → redirected to `/posts`.

> ❓ DECIDE: Drag-to-published in M1 — set `published_at = now()` (manual-paste workflow per spec) or block with "Publishing comes in M2"? Former is more useful short-term, creates inaccurate data if user forgets to paste.

---

### Section 5 — Editor core (spec §5)

**Goal:** Full Tiptap rewrite with auto-save, version history, platform variants, mentions/hashtags.

**Current state:** 675-line textarea page. Manual save. No versioning UI. No platform variants. No marks.

**Gap:** Complete editor rewrite — single biggest M1 lift after backfill.

**Steps:**
1. Install: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-character-count`, `@tiptap/extension-link`.
2. `src/components/editor/PostEditor.tsx` — StarterKit minus headings, Placeholder, CharacterCount, Link.
3. Custom marks: `MentionHighlight`, `HashtagHighlight` via `Mark.create()` with regex input rules.
4. `src/components/editor/useAutoSave.ts` — 3s debounce, status state, creates `post_versions` row on each save. Cap 50 versions per post via DB trigger on insert (delete oldest when count > 50).
5. Save status indicator top-right: "Saved 2s ago" / "Saving…" / "Save failed".
6. Version history dialog — timeline, click preview, Restore button.
7. Platform picker chip row — LinkedIn/X/Facebook only. Instagram excluded (M3 clip creator).
8. Platform variant tabs below editor when >1 platform selected. Store in `platform_variants` JSONB.
9. Per-platform character counts in status bar.
10. Mentions: plain `@` for M1 (no autocomplete, store as text). Hashtags: curated list + figure tags.
11. Buttons: Save draft / Schedule / Copy-for-Typefully.
12. Migrate existing textarea content on first open: treat plain text as single Tiptap paragraph. No lossy conversions.

**Verification:** Type 50 words, wait 3s → "Saved". Close/reopen tab → content preserved. Edit 10x, open version history, restore v3 → editor reverts. Toggle LinkedIn+X → variant tabs appear. Open pre-V10 post → content migrates cleanly.

> ❓ DECIDE: Version cap via DB trigger or app-level prune? Trigger is simpler, cron scales better. Trigger wins for M1.
> ❓ DECIDE: `content_html` column — store Tiptap HTML or Tiptap JSON? JSON roundtrips cleaner, HTML is portable. Spec says HTML; recommend HTML + keep JSON in a `content_json` column for future-proofing.

---

### Section 6 — Figure library (spec §6)

**Goal:** Expand 15 → 70 figures (content deferred), ship library page + picker.

**Current state:** 15 figures in `islamic_figures` + `figure_themes` + `figure_hook_angles` junction tables.

**Gap:** Content for 55 more figures (deferred), library UI, picker component, avatar fallback.

**Steps:**
1. `supabase/seed/figures.ts` — idempotent upsert script reading from `supabase/seed/data/figures.json`.
2. `supabase/seed/data/figures.json` — export current 15 figures as starter; header comment points to future `V10_Figure_Seed_Data.json`.
3. `supabase/seed/data/README.md` — document shape + append process, reference spec §6.2.
4. `src/app/(app)/figures/page.tsx` — card grid, category filter pills, search. Reads from `islamic_figures` + `figure_post_history` for "last posted" data.
5. `src/components/figures/FigureAvatar.tsx` — initials on green gradient fallback.
6. `src/components/figures/FigurePicker.tsx` — editor integration; search + grouped by category + last-posted inline.
7. `src/app/(app)/figures/[id]/page.tsx` — bio, themes, hook angles, past posts list.

**Verification:** Library loads with 15 cards; filter by category works; search by name + kunya works. Click card → detail page. From editor, figure picker dropdown opens, type "Abu" → "Abu Bakr" matches.

> ❓ DECIDE: Draft 55-figure JSON in Claude.ai now (in parallel with build), or push as dedicated content sprint post-M1? Affects whether M1 ships with 15 or 70.
> ❓ DECIDE: `figures/[id]/edit` admin UI, or direct Supabase editing until M2?

---

### Section 7 — Hadith system (spec §7)

**Goal:** Grading column, user verification tracking, library + picker, UNVERIFIED enforcement.

**Current state (verified via MCP):** 29,685 hadith in **`hadith_corpus`** (NOT `hadith_verifications`). `hadith_corpus` has `collection`, `collection_name`, `hadith_number`, `arabic_text`, `english_text`, `narrator`, `grade` (text, unparsed), `sunnah_com_url`, `in_book_reference`. **`hadith_verifications` already exists with 2 rows** — has `reference_text`, `sunnah_com_url`, `narrator`, `arabic_text`, `translation_en`, `grade`, `verified` (bool, default true), `verification_notes`, `verified_at`. This is already effectively the per-user verification table. `post_hadith_refs` junction already exists (empty).

**Gap:** Canonicalize grading on `hadith_corpus` (add enum column), add user-scoped tracking on `hadith_verifications` (make `verified` user-specific via `user_id` + organization_id column), library page, picker, UNVERIFIED blocks scheduling.

**Steps:**
1. Migration `20260420000200_v10_hadith_grading.sql` — canonicalize `hadith_corpus.grade`:
   - Add `grading TEXT CHECK (grading IN ('sahih','hasan','daif','mawdu','unknown'))` defaulting to 'unknown'.
   - Backfill from existing `grade` text column: `UPDATE hadith_corpus SET grading = CASE WHEN lower(grade) LIKE '%sahih%' THEN 'sahih' WHEN lower(grade) LIKE '%hasan%' THEN 'hasan' WHEN lower(grade) LIKE '%da''if%' OR lower(grade) LIKE '%weak%' THEN 'daif' WHEN lower(grade) LIKE '%mawdu%' THEN 'mawdu' ELSE 'unknown' END`.
   - Add `grading_source TEXT`, `secondary_gradings JSONB`.
   - Add `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(english_text,'') || ' ' || coalesce(narrator,'') || ' ' || coalesce(collection,''))) STORED`.
   - Add indexes: `idx_hadith_corpus_grading`, `idx_hadith_corpus_search USING GIN(search_vector)`.
2. Migration `20260420000201_v10_hadith_user_scope.sql` — adapt `hadith_verifications` to user-scoped:
   - Add `user_id UUID REFERENCES auth.users(id)`, `organization_id UUID REFERENCES organizations(id)`, `hadith_corpus_id UUID REFERENCES hadith_corpus(id)`.
   - Existing 2 rows: backfill `user_id=a004cb71-f78a-4f2a-8342-dea9be6a8c8a` (Isa), `organization_id=<Isa's default org>`, `hadith_corpus_id` matched via `sunnah_com_url`.
   - Add `hadith_recently_viewed` table (user-scoped, no org — personal browsing history): `user_id`, `hadith_corpus_id`, `viewed_at`, PK `(user_id, hadith_corpus_id)`.
   - RLS: user can see only own rows.
3. `src/app/(app)/hadith/page.tsx` with tsvector search on `hadith_corpus.search_vector`, collection filter (from `hadith_corpus.collection`), grading filter (from `hadith_corpus.grading`), recently viewed section.
4. `src/components/hadith/HadithPicker.tsx` — slide-in editor panel.
5. UNVERIFIED enforcement — two layers:
   - **DB trigger** on `posts` status transition: reject if any `post_hadith_refs.hadith_id` not joined to a `hadith_verifications` row where `hadith_verifications.user_id = posts.user_id` AND `verified = true`. Bulletproof.
   - **App-level**: disable Schedule button, tooltip explains why.
6. System prompt: hard-coded "NEVER generate hadith reference numbers" in `ISLAMIC_VOICE_RULES` (spec §9.4).
7. Integration test: attempt schedule with unverified hadith → asserts failure.
8. `scripts/sync-hadith-gradings.ts` — skeleton only; sunnah.com API integration deferred.

**NOTE:** The plan's original `hadith_user_verifications` table is redundant — the existing `hadith_verifications` table IS the user-verification table with the right columns. We just add `user_id` + `organization_id` + `hadith_corpus_id` to link it properly.

**Verification:** Search "intentions" → Bukhari #1 appears. Click "Use in post" → editor gets text + UNVERIFIED chip. Try schedule → blocked with clear message. Mark verified → chip gone → schedule succeeds.

> ✅ RESOLVED: Grading column is `hadith_corpus.grade` (text, unparsed). Backfill via CASE expression on lowercased substring match.
> ❓ DECIDE: Existing 2 rows in `hadith_verifications` — do they have `sunnah_com_url` that matches `hadith_corpus.sunnah_com_url`? If not, backfill `hadith_corpus_id` will fail and need manual matching.
> ❓ DECIDE: DB trigger error messages are generic ("new row violates…"). Accept that and show friendly UI error, or wrap in a PL/pgSQL function that raises with typed error codes? Recommend PL/pgSQL wrapper.

---

### Section 8 — Quran + tafsir (spec §8)

**Goal:** Multi-translation viewer + multi-tafsir panel + editor picker.

**Current state (verified via MCP):** 6,236 ayahs in `quran_cache` (Uthmani + simple Arabic + single English translation). 114 rows in **`surah_metadata`** (not `surahs` as plan said earlier). `tafsir_cache` exists with 1 row — effectively empty, can be reused or renamed.

**Gap:** Translations table, tafsirs table, import scripts, browser page, picker.

**Steps:**
1. Migration `20260420000300_v10_quran_translations.sql` — new `quran_translations` table per spec §8.1. Multi-translator support. Copy existing `quran_cache.translation_en` into this table as `translator='saheeh_int'` (default).
2. Migration `20260420000301_v10_tafsirs.sql` — expand existing `tafsir_cache` table OR create new `quran_tafsirs` (decide based on schema fit). Existing `tafsir_cache` has: `surah`, `ayah`, `tafsir_slug`, `content`, `author`, `group_verse`, `fetched_at`. Spec §8.2 wants: `surah_number`, `ayah_number`, `source`, `language`, `text`, `ayah_range`. Mostly compatible — rename columns + add `language DEFAULT 'en'`. Keep table name `tafsir_cache` or rename to `quran_tafsirs` (naming clarity).
3. `scripts/import-quran-translations.ts` — 114 surahs × 3 translators via alquran.cloud. Idempotent.
4. `scripts/import-tafsirs.ts` — quran.com API; start Ibn Kathir + Maarif-ul-Quran + Tafsir Sa'di. ~19k rows.
5. `src/app/(app)/quran/page.tsx` — three-pane layout reading from `surah_metadata` + `quran_cache` + `quran_translations` + `tafsir_cache`.
6. `src/components/quran/QuranPicker.tsx` — editor integration.
7. "Use in post" → pushes to `posts.quran_refs` jsonb on current post (already exists as `jsonb` default `[]`).
8. `quran_cache` — keep as-is (it has `verse_key`, `text_uthmani`, `text_simple`, `normalized`, `words_json`, `translation_en`). Don't deprecate; the new translations table complements it.

**Verification:** Open Quran page, Al-Fatihah renders, switch translator → text updates. Click ayah 1:1 → Ibn Kathir tafsir. Switch tafsir source → text updates. Pick 2:255 from editor → appears in `quran_refs`.

> ❓ DECIDE: Import Tabari/Qurtubi as Arabic-only now or skip until translated? Adds ~12k rows, limited immediate value.
> ❓ DECIDE: Rename `tafsir_cache` → `quran_tafsirs` for clarity, or keep existing name? Rename is cleaner but requires updating imports. Recommend rename.
> ❓ DECIDE: Existing 1 row in `tafsir_cache` — preserve or discard? Likely test data, safe to discard.

---

### Section 9 — AI assistant (spec §9)

**Goal:** Right-sidebar AI with Draft + Edit modes, figure-aware prompts, cost tracking, Copy-to-Claude fallback.

**Current state:** `AiAssistantDrawer` is a freeform chat. Existing `/api/hooks` + `/api/platform-convert` routes work (per memory). `api_usage` table exists. UI buries AI functionality.

**Gap:** Full UI rebuild per spec, two modes, quick actions, slop check, cost dashboard, graceful cap.

**Model IDs (locked):** `claude-opus-4-7` for full drafts; `claude-sonnet-4-6` for hooks + edits; `claude-haiku-4-5-20251001` for slop checks.

**Steps:**
1. Replace `AiAssistantDrawer` with `src/components/ai-assistant/AssistantSidebar.tsx` — Draft/Edit tab toggle.
2. `src/lib/anthropic/client.ts` — SDK wrapper handling usage recording + cap check + graceful fallback.
3. `src/lib/anthropic/prompts/{system-base,hooks,draft,edit,slop-check}.ts` per spec §9.4. Hardcode hadith-reference rule in `system-base`.
4. API routes: `/api/ai/hooks`, `/api/ai/draft`, `/api/ai/edit`, `/api/ai/slop-check`. `/api/ai/convert` → M2.
5. Migrate or wrap existing `/api/hooks` and `/api/platform-convert`: redirect to new routes or keep as internal callees of new ones.
6. `src/lib/anthropic/usage-tracker.ts` per spec §9.6. **VERIFY pricing numbers before launch** — values in spec are placeholders.
7. Cost display in sidebar footer. Full breakdown at `/settings/ai`.
8. Edit mode word-level diff via `diff` npm package.
9. Cap hit → all generate buttons become "Copy to Claude.ai" with formatted clipboard payload.
10. Hook performance integration (§15): stub interface now, wire real data when §15 lands.

**Verification:** Generate 10 hooks → 10 cards; click one → inserts text + sets `hook_category`. Edit mode "Tighten" → diff renders → Accept replaces content. Set cap $0.01, generate → Copy-to-Claude fallback. `api_usage` row per call with cost.

> ❓ DECIDE: Streaming responses or wait-and-render? Spec silent. Streaming better UX, more complex; recommend wait-and-render for M1.
> ❓ DECIDE: Plan tier — hardcode Isa as `creator` tier ($15/mo cap) for M1, or build plan assignment UI?
> ❓ DECIDE: Slop check — inline-as-you-type (noisy, distracting) or on-demand button (cleaner)? Recommend on-demand.

---

### Section 10 — LinkedIn multi-account OAuth (spec §10)

**Goal:** Personal + company page connections, stacked avatar UI, add/remove pages.

**Current state:** Single LinkedIn OIDC connection. Scopes OIDC-only — no org scopes. `oauth_connections.account_type` column exists (per memory). No `parent_connection_id`.

**Gap:** Scope expansion (requires user re-consent), pages API routes, parent FK, stacked UI.

**Steps:**
1. **External:** In LinkedIn developer console, enable `w_organization_social` + `r_organization_social` + `w_member_social` + `r_member_social` for the TQG app. **Submit for LinkedIn review if required — potentially blocks entire section.**
2. Update Supabase LinkedIn provider scope list.
3. Migration `20260420000400_v10_oauth_parent.sql` — `parent_connection_id` column + index.
4. Reconnect banner in `/settings/connections`: "Reconnect LinkedIn to enable company pages." Condition: scopes missing.
5. `/api/platforms/linkedin/pages` GET (fetch admined orgs), `POST activate`, `DELETE [id]`.
6. `src/components/platform-connectors/AccountStack.tsx` — stacked avatars, click-switch, right-click remove.
7. "Add LinkedIn page" dialog — lists admined orgs, checkbox, activate.
8. Active account state: localStorage + `user_profiles.active_connection_id` (add if absent).

**Verification:** Reconnect with new scopes → Connections page confirms. Open Add Page → TQG page listed. Activate → stack shows TQG. Switch active → editor "posting as" label updates.

> ❓ DECIDE: LinkedIn org scopes approval — check current TQG app status. **This blocks Section 10 entirely if not approved.** Start the review now in parallel with other work.
> ❓ DECIDE: `user_profiles.active_connection_id` — add column or localStorage-only? Recommend column for cross-device consistency.
> ❓ DECIDE: Existing single LinkedIn connection — assume `account_type='personal'` or migrate to set it?

---

### Section 11 — X OAuth polish (spec §11)

**Goal:** Multi-account X, token refresh, reconnect on expiry.

**Current state:** Single X OAuth 2.0 (TQG, account_id `2038556285415698432`). Uses `linkIdentity()`. No refresh job. No expiry UI.

**Gap:** Second X connection flow, refresh-before-expiry job, expired-token error handling.

**Steps:**
1. "Add X account" button triggers full OAuth dance; `account_id` disambiguates rows.
2. Edge Function cron: every 10min, find X connections with `expires_at < now() + 10min`, refresh via refresh_token, update row.
3. Platform API call middleware: catch 401 → mark stale → typed error → UI "Reconnect X" banner.
4. Per-account status badge: connected/expired/error.

**Verification:** Connect second X account → stack shows two. Manually expire token → next API call triggers reconnect banner. Let refresh job run → `expires_at` extends.

> ❓ DECIDE: Edge Function cron vs `pg_cron`? Edge Function simpler + external. `pg_cron` in-DB + cheaper. Recommend `pg_cron` if available on Supabase free tier.

---

### Section 12 — Platform backfill (spec §12)

**Goal:** Fetch real post history from LinkedIn + X APIs, match to internal posts.

**Current state:** No `external_posts` table. Calendar shows phantom internal posts that may never have actually published.

**Gap:** New tables, fetch libs, orchestration function, three triggers, matching.

**Steps:**
1. Migration `20260420000500_v10_external_posts.sql` — `external_posts` + `backfill_progress`.
2. `src/lib/platforms/linkedin/fetch.ts` per spec §12.2. URN switches on `account_type`.
3. `src/lib/platforms/x/fetch.ts` per spec §12.3. Include `public_metrics`.
4. `supabase/functions/backfill/index.ts` orchestrator per spec §12.4.
5. Trigger 1: on connect success → first page sync (instant calendar feedback) + queue 5 more pages background.
6. Trigger 2: `/api/backfill/fetch-older` for lazy-load.
7. Trigger 3: nightly cron fetches posts since `newest_fetched_at`.
8. Matching per spec §12.6 — 10-min time window + 85% text similarity. Use `pg_trgm` extension for fuzzy match.

**Verification:** Connect LinkedIn → calendar within 5s shows last 50 real posts. Scroll 3 months back → lazy loads. Nightly cron → new posts appear without reconnect.

> ❓ DECIDE: LinkedIn API rate limits unknown — check before finalising page sizes. Personal vs org endpoints differ.
> ❓ DECIDE: `pg_trgm` extension for similarity — available on Supabase free tier? If not, use Levenshtein via JS (slower).
> ❓ DECIDE: Post-backfill cleanup — `posts` with `status='published'` that don't match any `external_post` after backfill completes: DELETE, mark `failed`, or leave? This is how phantoms get purged. **Destructive decision — recommend mark `failed` for one release, then DELETE.**

---

### Section 13 — Calendar view (spec §13)

**Goal:** Real-data monthly calendar replaces phantom-filled current view.

**Current state:** Calendar shows scheduled + published internal posts, many phantom.

**Gap:** Query switch, lazy pagination, performance card, day drawer.

**Steps:**
1. Rewrite calendar data hook: past → `external_posts`; today → union; future → `posts` where `status='scheduled'`.
2. Query scoped visible month ± 1 via react-query cache key `['calendar', year, month]`.
3. Lazy-load trigger when navigating older than `backfill_progress.oldest_fetched_at` → calls `/api/backfill/fetch-older`.
4. Performance card top of page — aggregates from `external_posts.metrics` last 14 days.
5. Day-click drawer per spec §13.6.
6. Filter dropdowns: accounts, platforms.

**Verification:** Open calendar → past month real data only, future shows scheduled only, no phantoms. Navigate 6 months back → skeleton → lazy-loads → fills. Click Apr 17 → drawer with real posts + metrics.

---

### Section 14 — Figure gap tracking (spec §14)

**Goal:** Per-platform warnings when drafting about a recent figure.

**Current state:** `islamic_figures.last_posted_at` is a single scalar, not per-platform. No history table.

**Gap:** New `figure_post_history` table, population trigger, gap query, banner, library card coloring.

**Steps:**
1. Migration `20260420000600_v10_figure_history.sql` — new table + backfill from existing posts (spec §14.1).
2. Hook into internal publish + external backfill match → insert into `figure_post_history`.
3. `src/lib/figures/gap.ts` — `getFigureGap(figureId, userId, platform)`.
4. `<GapWarning>` in editor — red ≤3d / amber 4-7d / none ≥8d.
5. Figure library card — per-platform dots (LI/X/FB) with gap colour.
6. Mark `islamic_figures.last_posted_at` as deprecated (comment); drop in M2.

**Verification:** Post Abu Bakr to LinkedIn today. New post → Abu Bakr + LinkedIn → red warning. Swap FB → no warning.

---

### Section 15 — Hook performance tracking (spec §15)

**Goal:** Track hook-category → impressions, feed into hook generation.

**Current state:** No hook categorisation on historical posts. No aggregate view.

**Gap:** Materialized view, refresh, prompt integration, analytics page.

**Steps:**
1. Migration `20260420000700_v10_hook_performance.sql` — materialized view per spec §15.1.
2. `pg_cron` nightly `REFRESH MATERIALIZED VIEW CONCURRENTLY hook_performance`.
3. `src/lib/ai/performance.ts` — `getHookPerformance(userId, figureId)` returns per-category averages.
4. Integrate into `prompts/hooks.ts` — pass perf data, prompt weights suggestions.
5. `/analytics` page — table: category, posts, avg impressions, best post. Expanded in M2.

**Verification:** Categorise 20 past posts (manual or backfill), refresh view, `/analytics` renders. Generate hooks for figure with history → output skews toward better categories.

> ❓ DECIDE: Historical post categorisation — manual (time-consuming), LLM-based backfill (AI cost), or forward-only (takes months)? Recommend forward-only + volunteer to manually tag 20 recent posts for immediate signal.

---

### Section 16 — Command palette (spec §16)

**Goal:** Cmd+K global nav.

**Current state:** None.

**Gap:** `cmdk` install, palette component, root layout wire.

**Steps:**
1. `npm install cmdk`.
2. `src/components/CommandPalette.tsx` per spec §16.1 with global keydown listener (⌘K / ctrl+K).
3. Data sources: recent posts, all figures, hadith (debounced server search), surahs, nav targets (Calendar/Figures/Settings), actions (New post, Toggle sidebar, Switch account).
4. Include in `src/app/(app)/layout.tsx` so Cmd+K works on every page.

**Verification:** ⌘K opens palette anywhere in app. Type "abu" → Abu Bakr figure result. Type "calendar" → nav target. Enter → navigates.

---

### Section 17 — Settings / help center (spec §17)

**Goal:** Settings sub-routes + 8 help MDX pages.

**Current state:** Settings minimal (per memory — some OAuth display exists).

**Gap:** New routes + MDX rendering.

**Steps:**
1. Routes: `/settings/{account,connections,ai,preferences,help,admin}`. Admin visible only to `user_profiles.role='admin'` (M3+).
2. Install `next-mdx-remote` + `contentlayer` (or just bundled MDX via Next.js built-in).
3. Write 8 MDX help pages per spec §17.2 in `content/help/*.mdx`:
   - what-is-kanban.mdx
   - how-to-write-first-post.mdx
   - how-ai-assistant-works.mdx
   - red-unverified-badges.mdx **(critical — explains hadith safety rule)**
   - connect-linkedin-company-page.mdx
   - figure-warning-colors.mdx
   - how-autosave-works.mdx
   - how-to-use-cmdk.mdx
4. Shared help page layout — title, 1-sentence summary, explanation, screenshots (placeholders OK for M1), "Still stuck?" mailto.
5. Link into Help from sidebar foot + from help icon in top nav.

**Verification:** `/settings/help` loads list of 8 pages. Click each → renders with layout. Screenshot placeholders visible but non-blocking.

> ❓ DECIDE: Screenshots — generate from real app now (polish risk if UI keeps changing) or placeholders until M1 ships?
> ❓ DECIDE: Contact email on "Still stuck?" link — support@thequrangroup.com exists? Use shuaybisakhan@ as fallback?

---

## Reconciliation appendix — spec vs current repo

### Conflict 1: Columns to DROP that may not exist

- **Spec says (§2.1):** `DROP COLUMN IF EXISTS quality_score, quality_label, readiness, review_status, linkedin_status, x_status, facebook_status, instagram_status`.
- **Repo has:** Unknown — some or none. Current `posts.status` uses different value set, so per-platform status columns may never have been added.
- **Resolution:** All DROPs already `IF EXISTS` in spec SQL — no action needed beyond following spec as written. Safe.
- **Migration path:** Included in `20260420000100_v10_post_status_model.sql` (Section 2).

### Conflict 2: Post status value collapse

- **Spec says (§2.1):** Status values `idea/draft/scheduled/published/failed/archived`.
- **Repo has:** `idea/drafting/review/ready/scheduled/published`.
- **Resolution:** Collapse `drafting/review/ready → draft`. Lose granularity (quality-gate states go away with Section 2.4 cleanup). Keep `idea/scheduled/published`. Add new `failed/archived`.
- **Migration path:** Drop CHECK → UPDATE status values → re-add CHECK with new enum. Part of §2 migration. **Recommended: add a `previous_status` column for one release cycle to preserve archaeological data, drop in M2.**

### Conflict 3: content_revisions vs post_versions

- **Spec says (§2.2):** New `post_versions` table, schema defined.
- **Repo has:** Existing `content_revisions` table (pre-V10 versioning).
- **Resolution:** Copy existing rows into `post_versions` (map columns), rename `content_revisions → _deprecated_content_revisions`. Drop in M2 after stability.
- **Migration path:** `20260420000102_v10_content_revisions_sunset.sql` — `INSERT INTO post_versions SELECT (mapped columns) FROM content_revisions; ALTER TABLE content_revisions RENAME TO _deprecated_content_revisions`.

### Conflict 4: textarea vs Tiptap

- **Spec says (§5):** Tiptap with StarterKit + Placeholder + CharacterCount + Link + custom MentionHighlight/HashtagHighlight marks.
- **Repo has:** 675-line plain `<textarea>` page.
- **Resolution:** Full rewrite per spec (locked decision). No incremental textarea retention.
- **Refactor path:** New `PostEditor` component replaces current page body. Existing posts: on first open, wrap plain-text `content` in a single Tiptap paragraph — lossless.

### Conflict 5: Claude model IDs + pricing

- **Spec says (§9.6):** Pricing table with placeholder numbers. Uses model strings without explicit locking.
- **Repo target:** Per Isa's environment: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`.
- **Resolution:** Lock to those three IDs. Treat pricing values as unverified placeholders — **pre-launch task: fetch current prices from docs.claude.com and update `usage-tracker.ts`.**
- **Refactor path:** Hardcode model constants in `src/lib/anthropic/client.ts`. Pricing in `usage-tracker.ts` marked `// TODO: verify`.

### Conflict 6: 15 figures vs 70 figures

- **Spec says (§6.1):** 70 figures across Prophets (25) / Sahabah (25) / Women (8) / Scholars (12).
- **Repo has:** 15 figures seeded.
- **Resolution:** Scaffold seed infrastructure in M1 (migrations, junction tables, idempotent upsert script, JSON file shape). Defer content creation for 55 additional figures to a separate content sprint.
- **Refactor path:** `supabase/seed/data/figures.json` — export current 15 as starter, add header comment pointing to `V10_Figure_Seed_Data.json` (TBD). Script stays idempotent — when full JSON arrives, re-running seeds the rest.

### Conflict 7: Spec assumes direct LinkedIn + X APIs, M1 uses Typefully bridge

- **Spec says (§10-§12):** Build LinkedIn multi-account OAuth, X OAuth polish, platform-specific backfill with text-similarity matching.
- **Decided:** LinkedIn Community Management API gated behind 1-4 week review after old app was deleted. Typefully v2 API handles LinkedIn + X posting, scheduling, and metrics for M1. Direct APIs become M2 work.
- **Resolution:** Adapter pattern — `TypefullyAdapter` is active in M1; `LinkedInAdapter` and `XAdapter` are dormant skeletons with full TypeScript signatures but bodies throw `NotImplementedError`. Environment flags (`NEXT_PUBLIC_LINKEDIN_MODE`, `NEXT_PUBLIC_X_MODE`) pick the adapter. Flipping flags in M2 activates direct integration without app rewrite.
- **Refactor path:** `src/lib/platforms/{types,registry,typefully,linkedin,x}/` — Typefully files fully implemented, LinkedIn+X skeleton files with stub methods. OAuth callback routes for LinkedIn+X exist as 503 stubs. `external_posts.source TEXT NOT NULL DEFAULT 'typefully'` column distinguishes Typefully-sourced vs direct-sourced data.

### Conflict 8: Spec is implicitly single-tenant, M1 is multi-tenant

- **Spec says (§1-§17):** All RLS policies based on `auth.uid() = user_id`. No organization concept. Everything scoped to individual users.
- **Decided:** Full multi-tenancy in M1 — `organizations` + `organization_members` + `organization_invites` tables, every user-scoped table gets `organization_id`, full invite + role UI.
- **Resolution:** Multi-tenancy schema added in §1 before any other table migrations. Every §2+ migration includes `organization_id`. RLS policies switch from `user_id = auth.uid()` to `organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())`. Shared reference tables (figures, hadith, Quran) stay user-agnostic — no `organization_id`.
- **Migration path:** `20260420000050_v10_multitenancy.sql` creates the three new tables + backfills default org "The Quran Group" for Isa. Every subsequent `v10_*` migration adds `organization_id` to its target tables with NOT NULL constraint + backfill from `user_profiles.active_organization_id`.
- **Honest tradeoff:** Isa acknowledged ~10 hours of weekend work untestable until second TQG user joins. Accepted as tech debt against imagined users.

### Conflict 9: Plan schema assumptions vs DB reality (discovered via MCP audit, Apr 18)

- **Plan assumed:** Junction tables `figure_themes` + `figure_hook_angles`; hadith in `hadith_verifications` (29,685 rows); new `hadith_user_verifications` table; `posts.platforms` array; reference table named `surahs`; separate new `quran_tafsirs` table.
- **Repo actually has:** `islamic_figures.themes text[]` + `hook_angles jsonb` (no junctions); 29,685 hadith in `hadith_corpus`; `hadith_verifications` (2 rows) is already the per-user table with right columns; `posts.platform TEXT` (singular); `surah_metadata` (not `surahs`); `tafsir_cache` (exists, 1 row, reusable).
- **Resolution:** Plan patched in-place. Section 6 drops junction scaffold. Section 7 reuses `hadith_verifications` + adapts it rather than creating parallel table. Section 2 adds `platforms` array alongside existing `platform`, keeps both for one release. Section 8 uses `surah_metadata` + reuses `tafsir_cache`.
- **Root cause of mismatch:** Prior memory updates described the DB aspirationally — what was planned to exist — rather than verified state. This is why live DB audit (via Supabase MCP) should happen before writing migrations, not after.

### Conflict 10: Critical RLS gap (discovered via MCP advisor, Apr 18)

- **Spec says:** Plan §1 step 3 (multi-tenancy migration) adds RLS to new tables only.
- **Repo reality:** RLS is DISABLED on all 18 existing public tables. `oauth_connections.access_token` + `refresh_token` exposed via PostgREST to anyone with anon key. App works today because all queries use service-role admin client (bypasses RLS).
- **Resolution:** New §1 step 4 (`20260420000010_v10_enable_rls.sql`) enables RLS on all existing tables with service-role-only policies (non-breaking because current queries use service role) BEFORE multi-tenancy migration runs. Shared reference tables (hadith_corpus, quran_cache, etc.) also get authenticated-read policy. oauth_connections stays service-role-only (tokens).
- **Why critical:** A leaked anon key today = complete data dump of every user's posts, every OAuth token, every verified hadith. The app is one env var leak from a full breach. This is the single most important thing to fix before anything else.

---

## Dependencies graph

Hard dependencies (X cannot start until Y is shipped):

- **Section 0 (Onboarding/multi-tenancy UI)** → §0.1 signup blocks app access for new users but scaffolds alongside §1. §0.2-0.6 spread across all 8 weekends, land in W8.
- **Section 1 (Foundation + multi-tenancy schema)** → blocks everything. Do first. Multi-tenancy schema blocks all subsequent table migrations.
- **Section 2 (Post model)** → blocks 4 (kanban reads new status), 5 (editor writes new columns), 9 (AI uses `hooks_generated`), 13 (calendar reads new status), 14 (figure history FK to posts), 15 (hook_category for aggregation).
- **Section 7 schema audit** → blocks its own migration. Must inspect actual grading column before writing SQL.
- **Section 10 (LinkedIn scope approval)** → blocks 12's LinkedIn backfill (can't fetch org posts without `r_organization_social`).
- **Section 12 (Backfill)** → blocks 13 (calendar needs `external_posts`), 14 (gap tracking needs matched external posts for accuracy), 15 (hook perf needs `external_posts.metrics`).
- **Section 5 (Editor)** → blocks 9 (AI sidebar lives next to editor), 6 (figure picker is in editor), 7 (hadith picker is in editor), 8 (quran picker is in editor).

Soft dependencies (can run parallel, easier if sequenced):

- 3 (sidebar polish) — runs anytime.
- 16 (Cmd+K) — runs after 4, 5, 6, 7 exist (otherwise empty palette).
- 17 (help center) — runs last; screenshots depend on UI being stable.

**Critical path:** 1 → 2 → 5 → 9 → (11 start LinkedIn approval async, continues in background) → 6 → 7 → 8 → 10 → 12 → 13 → 14 → 15 → 4 → 3 → 16 → 17.

**Revised weekend plan (accounts for multi-tenancy + onboarding):**

Total estimate: **68–84 hours** (up from 48–64). Plan assumes ~10 hrs/weekend available.

- **W1:** §1 Foundation incl. multi-tenancy schema + §0.1 sign-up/org creation + §3 sidebar polish. **Full weekend.**
- **W2:** §2 Post model (with org_id) + §5 Tiptap scaffold (editor skeleton, core extensions). **Full weekend.**
- **W3:** §5 Tiptap finish — auto-save, version history, platform variants, mentions/hashtags. **Full weekend, biggest single lift.**
- **W4:** §6 Figure library + §7 Hadith system.
- **W5:** §8 Quran + §9 AI assistant (with per-user/per-org usage attribution).
- **W6:** §10-12 Platform layer — `PlatformAdapter` interface + Typefully active adapter + LinkedIn/X skeletons + webhook endpoint.
- **W7:** §13 Calendar + §14 Figure gaps + §15 Hook performance.
- **W8:** §0.2-0.6 Onboarding wizard completion + §0.3 role management + §0.4 org switcher + §4 Kanban + §16 Cmd+K + §17 Help center.

**If slipping:** descope §16 (Cmd+K) first, then §17 (help center copy — can be placeholder), then §15 (hook perf — can ship read-only table), then §0.5 (sample data — can seed manually).

**Never descope:** §1 multi-tenancy schema (core foundation), §0.1 sign-up flow (can't have users without it), §7 hadith UNVERIFIED enforcement (product integrity), §2 status migration (unblocks everything).

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tiptap migration takes >1 weekend | High | Medium | Timebox to 1 weekend; if overrunning, ship minimal Tiptap (no custom marks, no per-platform variants) and backfill in M2. |
| 70-figure content doesn't happen | Very High | Low | Scaffold is sufficient — M1 ships with 15. Mark as post-M1 content sprint. |
| Hadith `authority_grade` column doesn't exist / is shaped differently | High | Medium | Do schema audit (§7 step 1) before writing any hadith migration. Have backup plan: ship all `unknown` + sunnah.com sync in M2. |
| LinkedIn org scope approval delayed/denied | Medium | High — blocks §10 | Submit review now, in parallel with §1–9 work. If denied, fall back to personal-only multi-account (X already supports multi). |
| Platform API rate limits force slower backfill | Medium | Medium | Design `backfill_progress` with pause/resume from day 1. Already spec'd. |
| Phantom post cleanup data-loss | Medium | High | Mark `status='failed'` for one release (not DELETE). Preserve rows for rollback. |
| `pg_trgm` not available on free tier | Low | Low | Fallback to JS Levenshtein. ~100ms per match on short post content — fine. |
| DB trigger error messages are ugly for UNVERIFIED hadith | High | Low | Wrap in PL/pgSQL function with typed error codes. Catch in app layer, show friendly message. |
| Existing AI routes (`/api/hooks`, `/api/platform-convert`) break during §9 rewrite | Medium | Medium | Keep old routes behind feature flag until new ones verified. Cut over in single commit. |
| Auto-save races with server writes | Medium | Medium | Per-save version number — reject writes with stale version. Prompt user "reload? you have a newer version in another tab". |
| Multi-tenancy UI untestable until second user | High | Low (acknowledged) | Accept as tech debt. Invite a TQG dev team member ASAP for basic smoke test. |
| RLS policy bug leaks data between orgs | Low | **Critical** | Integration tests for every table: create two orgs, verify org-A user cannot SELECT/UPDATE/DELETE org-B data via any route. Add to CI. |
| Invite email deliverability | Medium | Medium | Use Resend with verified sending domain. Have fallback "copy invite link" button if email doesn't arrive. |
| Org switcher causes data race (stale cache across orgs) | Medium | Medium | Use react-query cache key `[orgId, ...resource]` everywhere. Invalidate on switch. Full page reload as fallback. |
| Sample data survives in production for real users | Low | Low | `is_sample` flag + dismiss UI; optional: auto-delete samples older than 30 days. |
| Per-user usage cap edge cases (user at sub-cap, org at org-cap) | Medium | Low | Org-cap is hard; user sub-cap shows warning. If confused, single cap for M1 (org-level only). |
| RLS remediation breaks a query path that uses anon client | Low | Medium | Grep for anon-client usage before migration. Currently all go through service-role admin client per audit. Run full click-through after migration. |
| `hadith_verifications` 2 existing rows don't match `hadith_corpus` by `sunnah_com_url` | Medium | Low | Manual mapping if backfill fails. Only 2 rows to fix by hand. |
| Moving `pg_trgm` out of public breaks any query using it | Low | Low | Queries reference it via function name, not schema-qualified. Moving shouldn't break callers, but verify with full-text search test. |

---

## Top 3 decisions blocking Section 1 continuation

Steps 1-2 of §1 are complete (Supabase consolidation + route groups on `claude/implement-writer-app-tieYL`). The remaining blockers:

1. **Greenlight RLS remediation migration first.** This is the new §1 step 4 and the single most important fix on the whole plan. Without it, a leaked anon key is a full data breach. Takes ~30 min to write + apply + verify. Non-breaking (all queries use service role anyway). Must land before multi-tenancy migration.
2. **Default org slug format** — auto-generated from email (`shuaybisakhan-workspace`) or prompt on signup? Recommend auto-generated + editable in settings. Affects §1 step 5 multi-tenancy migration.
3. **Resend account + sending domain** — §0.2 invite email needs this. Sign up for Resend now (free tier), verify `thequrangroup.com` domain (DNS setup ~1 hour). If deferred: invite flow uses "copy link" fallback in M1.

**Non-blocking but time-sensitive:**
- LinkedIn Community Management API review pending. Check status weekly. If approved before W8, can activate LinkedInAdapter as a stretch goal. If not, M2 activation.
- Second TQG user invite — invite Ahmad or another dev team member as soon as §0.2-0.3 ships (end of W8). Without a second user, multi-tenancy is purely hypothetical.
- `hadith_verifications` backfill audit — check if existing 2 rows have `sunnah_com_url` values that match `hadith_corpus.sunnah_com_url`. If yes, §7 migration is clean. If no, need manual mapping.

