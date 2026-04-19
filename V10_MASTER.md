# TQG Content Studio — V10 Master Build Plan

**Version:** 10.0
**Date:** April 2026
**Scope:** Full SaaS product, 4 milestones, 6-9 months calendar time
**Target user (v1):** Muslim creators, educators, and da'wah accounts
**Primary user (testing):** Isa Khan / The Quran Group
**Pricing:** Free during build, paid tiers plumbed for launch

---

## How to use this plan

Seven documents total. Read in this order:

1. **V10_MASTER.md** (this file) — product shape, milestones, decisions
2. **V10_Architecture.md** — DB schema, auth model, infra, stack decisions
3. **V10_M1_Writer.md** — Milestone 1: core writing product
4. **V10_M2_Publisher.md** — Milestone 2: direct publishing engine
5. **V10_M3_Video_Onboarding.md** — Milestone 3: video tools + onboarding
6. **V10_M4_SaaS.md** — Milestone 4: billing, teams, admin, marketing
7. **V10_Brand_Guidelines.md** — visual identity, copy tone, component library

Feed each milestone to Claude Code **one at a time**. Do not paste all four milestones at once — Claude Code will lose the plot. Ship M1, use it, *then* start M2.

---

## Product thesis

**The content studio for Muslim creators. Where da'wah accounts write, verify, and post — without worrying about weak hadith, hallucinated references, or low-effort slop.**

### Moat (in order of defensibility)

1. **Verified Islamic knowledge base** — figures, hadith with gradings, Quran with multiple tafsirs. No other content tool has this.
2. **Structural hadith safety** — app cannot publish unverified hadith. This is a trust feature, not a UX feature.
3. **AI tuned for Islamic content** — figure-aware hook generation, slop detection, no-em-dash enforcement, Islamic voice.
4. **Multi-platform publishing** — direct posting to LinkedIn, X, Facebook, Instagram.
5. **Analytics tuned for Islamic content** — track which hook categories, which figures, which hadith themes actually perform.

Writing tools and schedulers are table stakes. They exist, they must be good, but they don't make people switch from Typefully/Hypefury. The knowledge base does.

### What we are NOT

- Not a general content scheduler (Hypefury, Buffer, Later — we don't compete on platform breadth)
- Not a teaching platform (that's TQG, the parent org)
- Not an Islamic learning app (Qurantic, Muslim Pro — different product category)
- Not a thread-writing tool (Typefully — though we do threads eventually)

### Target user persona

**"Aisha, 28, runs a da'wah Instagram account"**
- 5,000 followers, growing
- Posts Islamic reminders 3-5x per week
- Researches on sunnah.com before posting, spends 20 min per post verifying
- Uses Canva for images, Notion for drafts, Later for scheduling
- Paid $20/mo for Later, begrudgingly
- Would pay $25-40/mo for one tool that does all of it AND has the Islamic knowledge built in
- Her pain: repetitive research, fear of sharing weak hadith, no single tool understands her niche

---

## The four milestones

Each milestone ends with a product that's **usable end-to-end for real posting**. You can pause at any milestone and have a working product.

### M1 — The Writer (8 weekends)

**Goal:** You stop drafting in Claude.ai. All posts flow through the app. Still copy-paste to Typefully for now.

**What ships:**
- Rebuilt post editor (kanban view: idea/draft/scheduled/published)
- Figure library (50+ figures seeded with themes, hook angles, events)
- Hadith picker with grading filters (sahih/hasan/daif), recently viewed, UNVERIFIED flag
- Tafsir viewer (Ibn Kathir, Tabari, Qurtubi) for Quran ayahs
- AI assistant in right sidebar (two modes: draft / edit)
- LinkedIn + X multi-account OAuth (including company pages)
- Real calendar pulled from LinkedIn + X APIs (not Typefully's cache)
- Performance data surfaced: hook category performance, figure gap warnings (per-platform)
- Polish: sidebar fix, suggestions removed, below-optimal removed, 4-stage statuses only

**End state:** App replaces Claude.ai for drafting. You paste to Typefully manually.

### M2 — The Publisher (6 weekends)

**Goal:** App fully replaces Typefully. Never leave the product to post anywhere.

**What ships:**
- Direct posting to LinkedIn (personal + company pages)
- Direct posting to X (single tweets + threads)
- Direct posting to Facebook (pages)
- Direct posting to Instagram (Reels + image posts via Business accounts)
- Scheduling engine (reliable cron, timezone-correct, retry logic)
- Media pipeline (per-platform image resize, video transcode, thumbnail extract)
- Post preview per platform (accurate character count, link preview, hashtag render)
- Queue dashboard (upcoming posts, failed posts with retry)
- Analytics dashboard (impressions, engagement, hook performance, figure performance)

**End state:** Cancel your Typefully subscription.

### M3 — Video & Onboarding (8 weekends)

**Goal:** Video tools work end-to-end. Non-TQG user #2 can be onboarded without you hand-holding.

**What ships:**
- Clip batch creator (the 3-step idiot-proof wizard)
- Long-form video editor (YouTube download → WhisperX → Quran matching → subtitle burn)
- Electron render helper (proper desktop app, auto-updater, code-signed)
- YouTube caption detection flow (per-video choice: captions / WhisperX / hybrid)
- Full onboarding flow (empty states, tooltips, "connect your first platform" wizard)
- User approval system with proper admin UI
- Help center / settings explainers for every feature
- Global command palette (Cmd+K)

**End state:** You can onboard a new user remotely via a signup form. They get it.

### M4 — SaaS plumbing (6 weekends)

**Goal:** Product is sellable. Billing works. Teams can be onboarded.

**What ships:**
- Stripe integration (free/creator/team/org tiers, even if free for now)
- Usage quotas (AI calls, post count, video minutes) per tier
- Team/organization model (multiple users per org, roles: owner/admin/editor/viewer)
- Admin dashboard (user management, org management, usage monitoring, cost tracking)
- Landing page / marketing site (separate Next.js app or same app, `/` vs `/app`)
- Email flows (welcome, password reset, billing receipts, usage warnings)
- Audit log for team actions (for Team tier transparency)
- API rate limiting + abuse prevention

**End state:** Open signups. Charge money. Onboard teams.

---

## Explicitly out of scope for V10

Things we do NOT build in this plan. Revisit for V11.

- **Crowdsourced hadith verification** — trust product, needs its own governance. V1 is curated library only with grading from sunnah.com sources.
- **Arabic UI** — English only. RTL support and Arabic translations are V11.
- **Mobile native apps** — responsive web only.
- **Public API for third-party developers** — internal use only.
- **Zapier / webhook integrations** — V11+.
- **Threads expansion (IG Threads platform)** — we support X threads, not Meta Threads, for V1.
- **TikTok posting** — different audience, defer.
- **WhatsApp/Telegram broadcasting** — different category.
- **Scholar verification credentials** — complex trust system, V11.
- **Live collaboration** (Google Docs-style) — single-editor per doc in V1.
- **AI image generation** — use Unsplash + user uploads only.
- **Transcription in languages other than English + Arabic** — V1 focus.

---

## Key decisions (locked in)

### Target
- Muslim creators, educators, da'wah accounts
- Isa / TQG as user #1 and testbed
- Eventually broader (faith-based creators) but not V1

### Pricing (plumbed, not live)
- **Free tier:** 10 posts/month, basic AI quotas, 1 platform
- **Creator tier** (~$20/mo): unlimited posts, full AI, 3 platforms, video tools
- **Team tier** (~$50/mo): Creator + team collaboration, 5 users, shared knowledge base
- **Org tier** (~$150/mo): Team + unlimited users, admin controls, analytics export

These numbers are placeholders. Don't charge yet. Just build the plumbing.

### AI cost model
- Anthropic API key server-side (you pay, not users)
- Per-user monthly spend cap enforced at app level
- Graceful degradation: "Copy to Claude.ai" button when cap hit
- Track costs per feature in `api_usage` table (already exists)
- At paid tier launch, pricing must cover AI cost + infra + margin

### Hadith library
- **Seeded:** ~29,685 hadith from sunnah.com major collections (already in DB)
- **Grading:** parsed from sunnah.com data, normalized to `sahih | hasan | daif | mawdu | unknown`
- **Grading source:** Darussalam / al-Albani / Shuaib Arnaut / etc. stored per grading
- **UNVERIFIED flag:** all hadith default to UNVERIFIED in the post context until user clicks "verify on sunnah.com" and confirms. Grading is separate from verification — a sahih hadith is still UNVERIFIED until the user has confirmed THIS specific quote matches sunnah.com.
- **No crowdsourcing in V1.**

### Quran library
- **Seeded:** 114 surahs, 6,236 ayahs (already in DB)
- **Translations:** Saheeh International (default), Pickthall, Yusuf Ali (selectable per user)
- **Tafsirs (new for V10):** Ibn Kathir, Tabari, Qurtubi, Maarif-ul-Quran (source: quran.com API)
- **Caching:** mirror per-ayah tafsir into Supabase to avoid API dependency

### Posting
- Direct posting to LinkedIn, X, Facebook, Instagram (all four)
- Typefully integration stays available as export option (user choice)
- No TikTok, no Threads, no WhatsApp, no email newsletters

### Brand
- Product branded as "TQG Content Studio" or similar TQG sub-brand
- Marketing: "from the team that brought you TQG"
- Separate domain recommended (e.g. `studio.thequrangroup.com` or new domain)
- Visual identity inherits from TQG but distinct

### Tech stack
- Next.js 14 App Router (current)
- Supabase (Postgres + Auth + Storage + Realtime)
- Tailwind + shadcn/ui
- Claude API (Anthropic) server-side
- WhisperX + ffmpeg + NVENC for video (on Isa's RTX 4060 Ti)
- Stripe for billing (M4)
- Vercel for hosting
- Electron for render helper (M3)

---

## What I am NOT deciding for you

These are yours to pick before each milestone starts:

### Before M1
- **Nothing blocking.** Start M1 today.

### Before M2
- Will you maintain Typefully integration as an export option, or remove entirely when direct posting ships?
- Meta Business Manager setup for Facebook/IG posting — you need this before M2 work

### Before M3
- Electron helper: Windows-only first, or Windows + Mac simultaneously?
- Code signing certificates (Windows + Apple) — who pays, where from?

### Before M4
- Final brand name (can stay "TQG Content Studio" but decide before launch)
- Domain purchase
- Stripe account setup (UK entity — use TQG CIC or personal?)
- Legal: Privacy Policy, Terms of Service (need lawyer review for CIC context)
- Support email + infrastructure (help@..., ticketing?)

---

## Risk register

### High risk
- **X API access revoked/throttled** — Elon has killed APIs before with no notice. Mitigation: build posting abstraction layer so X can be swapped for Typefully/manual fallback without code changes across app.
- **Meta developer account rejection** — Instagram posting needs Business API approval, can take weeks and be denied. Mitigation: start application as soon as M2 begins, not when M2 code is ready.
- **Electron code signing costs + complexity** — $300-500/year for Windows, $99/year Apple + identity verification. Mitigation: ship unsigned for TQG internal use in M3, sign before M4 public launch.
- **Hadith database copyright** — sunnah.com data has implicit licensing questions when redistributed. Mitigation: contact sunnah.com project, get explicit permission in writing OR link out instead of hosting full content.

### Medium risk
- **AI costs scaling** — ungated AI per user could burn $100s/month on a single heavy user. Mitigation: strict per-user monthly caps from day 1 of M1, not M4.
- **Scheduling engine reliability** — a missed post is a churn event. Mitigation: use proven cron service (Supabase Edge Functions + pg_cron, or Inngest, or Trigger.dev), not homemade.
- **Figure library depth** — 15 figures is not enough for a SaaS. Mitigation: M1 includes expanding to 50-70 figures minimum with full theme/angle/event data.

### Low risk but worth flagging
- **Burnout** — Isa's existing commitments mean velocity will be variable. Plan includes "ship at each milestone" so half-finished app is never the state.
- **Scope creep during build** — V10 itself is already a scope-creep recovery document. Mitigation: any new feature idea during build gets written into `V11_Backlog.md` and NOT into the current milestone.

---

## How Claude Code should receive this

When you start a milestone, give Claude Code:

1. The relevant `V10_M*.md` file for that milestone
2. `V10_Architecture.md` for DB/auth reference
3. `V10_Brand_Guidelines.md` when UI work is involved
4. This master file as context

Do NOT give Claude Code all four milestone files at once. It will lose focus.

At the start of each milestone, create a `M{N}_Progress.md` where you check off sections as they ship. End of each milestone: deploy, use the app for 1 week, note what's broken before starting the next milestone.

---

## The bar

This is a SaaS product that will be used by Muslim creators who trust TQG. That sets a bar higher than a side project:

- **Reliability:** scheduling must not miss posts. Auth must not log users out unexpectedly. Data must not disappear.
- **Trust:** hadith safety rule is absolute. No exceptions, no shortcuts, no "just this once."
- **Islamic correctness:** copy, UI, and defaults respect Islamic norms. No haram imagery in examples, proper etiquette (SAW, RA) used correctly, sensitive topics handled with adab.
- **Polish:** every screen has loading/empty/error states. No crashes like the one that started this conversation.
- **Performance:** pages load in <1s. Calendar handles 1000+ posts. Editor doesn't lag during typing.

Every PR should pass that bar. Claude Code will want to cut corners — don't let it.
