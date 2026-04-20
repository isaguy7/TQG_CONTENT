# V10 Product Context

Canonical context for TQG Content Studio as a SaaS product. This file is the *why* — it captures product direction, architectural decisions made across multiple sessions, and the rules that future sessions should not relitigate.

**Read this before starting any new chat about TQG Content Studio.** It replaces having to re-argue decisions every session.

Companion docs:
- `V10_M1_Writer.md` — the what (17-section spec for M1)
- `V10_M1_Plan.md` — the how (implementation plan with weekend cadence)
- `V10_Product_Context.md` — this file, the why

---

## Product shape

**One-line pitch:** The content studio for Muslim creators. Where da'wah accounts write, verify, and post — without ever worrying about weak hadith, hallucinated references, or low-effort slop.

**Target user:** Muslim content creators on LinkedIn and X. Initially used by Isa / TQG; positioned for other da'wah accounts when ready.

**Pricing path:**
- Free for Isa / TQG team throughout M1–M3
- Paid tiers introduced in M4 when ready for external users
- Tier names TBD (likely Free / Creator / Team)

**What makes it not-just-another-scheduler:**
1. **Hadith safety enforced at the product level** — never hallucinated references, UNVERIFIED flags block scheduling, sunnah.com verification required, all gradings tracked
2. **Writing voice baked into AI** — drop-into-scene hooks, fade endings, no AI phrases, no em dashes, lowercase-deliberate
3. **Batching + verification + platform conversion** in one tool — nobody's combined these for Muslim creators

**What's NOT the moat** (table stakes, must exist but won't make people switch):
- Post scheduling
- Multi-platform posting
- Writing tools
- Calendar view

---

## Product naming

**Current working name:** TQG Content Studio

**Status:** Placeholder through M1. Rebrand target date: before M4 launch.

**Candidates under consideration:**
- TQG Studio
- TQG Content
- Sahih Studio
- Adab (Arabic: etiquette/good manners)
- Mahfil (Arabic: gathering, esp. religious discourse)
- Minbar (Arabic: the pulpit)

**Not a blocker for M1.** Pick the name when M3 starts (gives domain/branding time before M4).

---

## Naming hygiene rules (to make eventual rebrand cheap)

**Use neutral identifiers for things that persist through a rename:**
- Email templates: use `{{product_name}}` placeholder
- Seeded sample post content: use "the app" or template vars, never hardcode "TQG Content Studio"
- Help center copy: template vars
- API response messages: neutral
- Code comments referring to the product: use "the app"
- Repo name: `tqg-content-studio` is fine; repo name is cheap to rename

**KEEP TQG-specific:**
- TQG green (`#1B5E20`) — brand color is for TQG (the org), not the product; stays even if product renames
- Default organization name seeded for Isa: "Isa Khan's Workspace" (slug `isa-khan-workspace`). Personal-workspace pattern, not shared TQG-team org — workspaces are per-user in this model. A separate TQG team org can be created later via invite flow if needed.
- Isa's support email and personal branding
- `thequrangroup.com` domain usage

**Hardcoded "TQG Content Studio" strings should be replaceable in <30 minutes** via find-replace. Grep regularly to check.

---

## Architectural decisions (locked)

### Multi-tenancy: full multi-tenancy UI in M1

**Decision date:** April 18, 2026
**Decided by:** Isa (with push-back from Claude, owned by Isa)

**What this means:**
- `organizations` + `organization_members` tables
- Every user-scoped table gets `organization_id`
- RLS policies enforce org membership
- Full invite flow with email tokens
- Role management UI (owner/admin/editor/viewer)
- Org switcher in nav
- Per-user usage attribution
- Per-org usage caps with per-user sub-caps

**Known tradeoff Isa accepted:** ~10 hours of weekend work that can't be tested alone until a second TQG team member joins. Hypothetical interactions until real users arrive.

**Shared reference data stays user-agnostic:**
- `islamic_figures`, `figure_themes`, `figure_hook_angles` (shared across all orgs)
- `hadith_verifications` (29,685 rows, shared)
- `quran_cache`, `quran_translations`, `quran_tafsirs`, `surahs` (shared)
- `hadith_user_verifications` stays **user-scoped** (personal verification record)

### Onboarding: full wizard for new users in M1

**Components:**
- Welcome screen
- Create first org (or join via invite)
- Connect first platform (Typefully API key OR skip → copy-paste mode)
- Pick figure categories that matter (Prophets / Sahabah / Women / Scholars)
- Write first post (guided — figure → hook category → generated hooks → pick one → insert)
- Land in kanban with first draft visible

**Sample data seeded per new org:**
- 3–5 example posts in Ideas column, tagged `is_sample=true`, user deletes when ready
- Starter content calendar (empty, just renders)
- NO figures/hadith/Quran duplication — these are shared reference data

### Platform integration: adapter pattern with Typefully bridge

**Decision:** Build `PlatformAdapter` interface with three implementations:
- **TypefullyAdapter** — active in M1, handles LinkedIn + X via Typefully v2 API
- **LinkedInAdapter** — skeleton in M1, activates when LinkedIn Community Management API is approved
- **XAdapter** — skeleton in M1, activates whenever Isa decides to go direct

**Env flags control which is active:**
```
NEXT_PUBLIC_LINKEDIN_MODE=typefully | direct | disabled
NEXT_PUBLIC_X_MODE=typefully | direct | disabled
```

**Why this shape:**
- Typefully = unblocks M1 entirely, no OAuth dependencies
- Skeletons = M2 activation is implementation, not architecture
- Interface contract = direct adapters return same shape as Typefully adapter, no app rewrite when flipping modes

**Dormant skeletons contain:**
- Full TypeScript method signatures
- URL endpoint constants marked `// TODO: verify at M2 start, LinkedIn API may evolve`
- Bodies throw `NotImplementedError("LinkedIn/X direct integration arrives in M2")`
- OAuth callback routes exist as 503 stubs
- `NEXT_PUBLIC_*_MODE=direct` activates them

**Direct posting IS the long-term product. Typefully is transitional.** Do not let Typefully-as-bridge calcify into Typefully-as-permanent-architecture.

### Unified post history — view all posts ever published (M2/§13)

**Decision date:** April 19, 2026 (during §5 smoke test)

**What Isa wants:** `/content` shows drafts + ideas + scheduled (pre-publish). `/calendar` (existing) shows a full post history view — every tweet, every LinkedIn post, every Facebook/Instagram post Isa has ever made — pulled from Typefully, LinkedIn API, and X API. Blend with scheduled queue so creators see: "What I've done, what's coming up, what I'm drafting."

**Implementation path (§13 calendar + §10-§12 platform adapters):**

1. New DB table `published_posts` (or similar name) — local mirror of what's on each platform. Columns: platform, platform_post_id, published_at, content, metrics (likes/comments/impressions as available), raw_response jsonb.
2. Ingestion worker per adapter. Runs on a schedule (daily?), hits each platform's API, upserts into `published_posts`.
   - TypefullyAdapter.fetchQueue() — scheduled + recently published from Typefully v2 API
   - LinkedInAdapter.fetchHistory() — once Community Management review completes, paginated historical fetch
   - XAdapter.fetchHistory() — once direct mode is on, paginated from X API v2
3. Initial backfill — one-off ingestion script for "every post ever" (paginate to the API's limit)
4. Incremental update — nightly cron or on-demand refresh button
5. `/calendar` gains a second view mode: timeline showing scheduled items (from platform queues) + published items (from mirror). Group by date.

**What this is NOT:** a real-time API call each page load. Rate limits would kill that. The mirror table makes the page fast + Typefully/LinkedIn/X APIs only hit on schedule.

**Not on M1 critical path.** M1 ships with copy-for-Typefully as the publish handoff. Unified history view ships in W6-W7 alongside platform adapters.

### LinkedIn Community Management API

**Current status:** Old app deleted. New app created with Community Management API only. Review pending (1–4 weeks for CICs).

**Why it's isolated:** Community Management API cannot coexist with Sign In with LinkedIn or Share on LinkedIn on the same LinkedIn app — LinkedIn enforces this. Isa chose to defer all LinkedIn OAuth rather than maintain two LinkedIn apps during M1.

**Implication for M1:**
- No LinkedIn sign-in (email sign-in is the only auth path)
- No direct LinkedIn posting
- All LinkedIn content flows through Typefully
- When Community Management approves, second LinkedIn app (Sign In + Share) may need to be created for personal posting if that's wanted separately
- Or: keep Community Management as the sole LinkedIn integration, post only to TQG page, personal posts stay copy-paste

**Not on M1 critical path.** M1 ships regardless of LinkedIn review outcome.

### Hadith safety (non-negotiable, product-level)

### Model IDs (locked)

```
Opus (full drafts):       claude-opus-4-7
Sonnet (hooks + edits):   claude-sonnet-4-6
Haiku (slop checks):      claude-haiku-4-5-20251001
```

**Pricing values in `usage-tracker.ts` are placeholders.** Verify against docs.claude.com before M4 launch.

### Schema reality (verified via Supabase MCP, Apr 18 2026)

**Before writing any migration, verify via MCP against live DB. Prior memory updates described DB aspirationally — not always what exists.**

**Tables that exist and their key shapes:**
- `islamic_figures` (15 rows): `themes text[]`, `hook_angles jsonb`, `type` CHECK (sahabi/prophet/scholar/tabii), `bio_short`, `name_en`, `name_ar`. **NO junction tables** for themes or angles — embedded directly.
- `hadith_corpus` (29,685 rows): the shared hadith corpus. Columns include `collection`, `arabic_text`, `english_text`, `narrator`, `grade` (unparsed text), `sunnah_com_url`.
- `hadith_verifications` (2 rows): already the per-user verification table with `verified`, `verification_notes`, `verified_at`. **Not a separate table to create** — adapt by adding `user_id`, `organization_id`, `hadith_corpus_id`.
- `post_hadith_refs` (0 rows): junction posts ↔ `hadith_verifications`.
- `figure_hadith_refs` (587 rows): junction figures ↔ `hadith_corpus`.
- `figure_quran_refs` (204 rows): figures ↔ Quran ayahs.
- `quran_cache` (6,236 rows): Uthmani + simple Arabic + single English translation.
- `surah_metadata` (114 rows): **NOT `surahs`**. Has `revelation_place` (makkah/madinah).
- `tafsir_cache` (1 row, effectively empty): reusable for multi-tafsir expansion.
- `posts` (7 rows): has `platform TEXT` (singular), `platform_versions jsonb`, `deleted_at`, `labels`, `topic_tags`, `hooks_generated`, `performance`.
- `oauth_connections` (2 rows): has `account_type` (personal/organization), `access_token`, `refresh_token`.
- `api_usage` (1 row): feature CHECK (hooks/convert/suggest/slop_check).
- `user_profiles` (1 row): role CHECK (pending/member/admin), `local_tunnel_url`, `approved_at`, `approved_by`.
- `content_calendar` (1 row): per-platform target/actual counters.
- `content_revisions` (0 rows): pre-V10 versioning, empty, safe to sunset.
- `video_projects`, `clip_batch` (0 rows each): video pipeline tables, empty.

**Security state (CRITICAL — to be fixed in §1 step 4):**
- RLS DISABLED on all 18 public tables.
- `oauth_connections.access_token` + `refresh_token` exposed via PostgREST to anyone with anon key.
- App works today only because all queries use service-role admin client (bypasses RLS).
- One env var leak = complete breach. Highest-priority fix.

**Extensions:** `pg_trgm` installed in public (should move to `extensions` schema per Supabase convention).

**Process rule for future sessions:** before writing any migration, run `list_tables(schemas=['public'], verbose=true)` via Supabase MCP. Before trusting tenant boundaries, run `get_advisors(type='security')`. Don't rely on plan docs or prior memory to describe schema — they drift.

---

### Email / invite sender (locked)

**Decision date:** April 19, 2026

**Sender address:** `studio@thequrangroup.com`
- Product-specific subdomain-less local-part
- Separates product mail from TQG org mail (`hello@`, `info@`)
- Survives eventual product rename (mailbox stays, forwarding rules adjust)
- Implementation: set up as an alias forwarding to existing TQG inbox for M1; promote to dedicated mailbox at M3 public launch

**Display name:** "The Quran Group Studio"
- Generic brand voice, not per-inviter
- Consistent across all orgs (doesn't get weird when there are 30 orgs)
- `invited_by` context surfaces in email body, not sender field

**Subject template:** "You've been invited to join {{org_name}}"

**Body template principle:** inviter name + org name + accept CTA + 7-day expiry notice + brand footer. Full template drafted in W8 when §0.2 invite flow is built.

**Resend setup:**
- Sending domain: `thequrangroup.com` (DNS verification: SPF, DKIM, DMARC)
- API key name convention: "TQG Content Studio — Development" (M1) and "TQG Content Studio — Production" (M3+). Separate keys, rotate independently.
- Env var name: `RESEND_API_KEY`

### Writing voice rules (in system prompts)

- Drop into a scene — no setup like "Today I want to talk about..."
- One thread per post — single idea, followed through
- Never narrate irony — let it land
- Lowercase is deliberate
- Fade endings — don't wrap up with a bow, don't moralize
- No em dashes (—)
- No AI phrases: "it's important to note", "dive deep", "unpack", "unleash", "game-changer", "synergy"
- One CTA max per post, often zero
- Reads like talking to a friend
- Use Prophet's (SAW) actual words, not paraphrases of hadith
- Honorifics: (SAW), (RA), (AS)

---

## Explicitly out-of-scope for M1

Adding these to M1 scope requires a conscious decision, not a default.

**Deferred to M2:**
- Direct LinkedIn OAuth + posting
- Direct X OAuth polish + token refresh
- Automated publishing (M1 is copy-paste to Typefully)
- Arabic UI / i18n
- Native mobile apps
- Public API for external developers
- Crowdsourced hadith verification
- Scholar verification credentials
- TikTok / Threads / Bluesky integrations beyond Typefully's built-in support

**Deferred to M3 (SaaS launch):**
- Paid tier billing (Stripe)
- Public signup (currently gated by approval)
- Marketing site / landing page
- Domain + branding for final product name
- Analytics beyond self-hosted basic metrics

**Deferred to M4 (scale):**
- Content moderation
- Support ticketing
- Team-size tiers beyond Creator/Team distinction
- Advanced analytics

**V11 candidate features (don't build until asked):**
- Crowdsourced hadith verification
- Arabic UI
- Native mobile apps
- Public API for developers
- More platforms (TikTok, Threads)
- AI image generation (carefully — aniconism considerations)
- More tafsirs and translations
- Scholar verification credentials
- Advanced team features (comments, approvals, guest reviewers)

---

## Prior chat context (summary of relevant prior decisions)

Context compiled from conversations April 16–18, 2026.

### What was settled before this M1 plan

**From "Debugging 400 error and map function failure" chat:**
- Product positioning locked as SaaS for Muslim creators
- Five-question product alignment yielded: multi-tenant, AI-on-by-default, Islamic knowledge base critical, direct posting is the product, free-for-now pricing
- The ".map is not a function" error that triggered V10 planning was a symptom of fragile list rendering → SafeList mandate
- Hadith rule, writing voice, batching workflow identified as the three moats

**From "Video transcription app with LinkedIn posting" chat:**
- v2.1 spec (`TQG_Content_Studio_Spec_v2.1.docx`) documented UI design, optional API, cost tracking
- Typefully-style dark layout with three zones established as visual target
- Post drafting stays iterative with Claude.ai (not replaced by single API call)
- API optional with graceful fallback to "Copy to Claude.ai" button
- Cost tracking with spending cap on settings page
- Soft-delete (not hard-delete) with trash view, 7-day permanent removal warning, undo toast
- Local Studio (GPU features on i9 + RTX 4060 Ti) remains local-only; shared Supabase DB bridges local ↔ cloud

**From V8 / V9 prompts:**
- LinkedIn dual accounts (personal + TQG page) planned, DB migration applied
- Multi-account OAuth architecture (`oauth_connections` with `account_id` disambiguator)
- Approval system (pending/member/admin roles) at the user level
- Claude API surfacing (routes exist, UI buried)
- YouTube captions on Vercel debugging
- UI polish direction: glass-like cards, colored left borders by figure type, Typefully editor aesthetic

**From V10 planning (this session):**
- Spec (`V10_M1_Writer.md`) authored: 17 sections, 8 weekends
- Plan (`V10_M1_Plan.md`) authored after three-explorer audit identified 6 conflicts
- Locked conflict resolutions:
  - Status migration: drafting/review/ready → draft
  - Route change: /content → /posts with redirect
  - Editor: full Tiptap rewrite, no incremental textarea retention
  - AI sidebar: full rebuild
  - Figure seed: scaffold migrations, defer 55 figures of content
  - Model IDs locked
- Section 1 step 1 (Supabase consolidation) shipped on branch `claude/implement-writer-app-tieYL`, commits `eb958ed` + `a024699`
- Typefully bridge architecture adopted after LinkedIn Community Management blocker surfaced

### Hardware + environment

- **Local:** i9 + RTX 4060 Ti 8GB (GPU for WhisperX, ffmpeg NVENC)
- **Production:** https://tqg-content.vercel.app
- **Supabase project:** https://hoatccxfbntgvxowufjt.supabase.co
- **Repo:** https://github.com/isaguy7/TQG_CONTENT.git
- **User:** shuaybisakhan@gmail.com, UID `a004cb71-f78a-4f2a-8342-dea9be6a8c8a`
- **Auth identities:** email, linkedin_oidc (now orphaned — LinkedIn app deleted), x

### Full session transcripts available at

- `/mnt/transcripts/2026-04-18-12-43-09-tqg-content-studio-full-build.txt` — initial build
- `/mnt/transcripts/2026-04-18-14-51-44-tqg-oauth-debugging-session.txt` — OAuth fixes
- `/mnt/transcripts/2026-04-18-19-02-53-tqg-oauth-ui-polish-session.txt` — multi-account, V8 planning
- `/mnt/transcripts/journal.txt` — catalog

---

## How to use this file in future sessions

**At the start of any new chat about TQG Content Studio:**
1. Read `V10_Product_Context.md` (this file)
2. Read `V10_M1_Writer.md` (what to build)
3. Read `V10_M1_Plan.md` (how to build it)
4. Reference prior session transcripts only if specific decisions are unclear

**Do not:**
- Re-ask the locked architectural decisions (multi-tenancy depth, Typefully bridge, model IDs, naming plan)
- Suggest building V11 features while M1 is incomplete
- Propose reverting to Typefully-as-permanent-architecture (it is transitional)
- Hardcode "TQG Content Studio" into user-facing strings (use template vars)

**Do:**
- Push back when scope creeps beyond M1
- Flag when a new decision would contradict this file — update the file, don't silently deviate
- Maintain the explicit out-of-scope list — if something gets promoted from "deferred" to "in scope," update here

**When scope changes:** update this file in the same commit. Product context drift across sessions is the biggest failure mode of long-running builds.
