# TQG Content Studio

Local-first content creation, video editing, and Islamic knowledge toolkit
for [The Quran Group](https://thequrangroup.com).

Built to run on a single workstation (i9 + RTX 4060 Ti 8GB). Zero recurring
cost beyond existing subscriptions.

## Status

**Phase 0 — Scaffold + Supabase** (in progress)

See `/root/.claude/plans/refine-further-moonlit-muffin.md` for the full
build plan. V1 ships the short-form clip batch creator (highest X-growth
ROI). Long-form video editor, platform converter, and calendar alerts are
deferred to v2.

## Prerequisites

| Tool            | Purpose                                |
| --------------- | -------------------------------------- |
| Node.js 20+     | Next.js runtime                        |
| Python 3.10+    | WhisperX (Phase 1)                     |
| CUDA 12.x       | GPU acceleration on RTX 4060 Ti        |
| ffmpeg + NVENC  | Audio/video processing                 |
| yt-dlp          | Video downloads (pinned, upgradable)   |
| Supabase project | Database (free tier is enough)        |

## Setup

```bash
npm install
cp .env.local.example .env.local     # fill in Supabase keys
# Apply migrations: either `supabase db push` or paste into SQL editor
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

## Architecture

- **Next.js 14** (app router, TypeScript, Tailwind, dark mode default)
- **Supabase** for all persistent data (9 tables, see `supabase/README.md`)
- **WhisperX** via Python subprocess for transcription + word-level alignment
- **ffmpeg + NVENC** for batch short-clip rendering
- **Hadith verification kernel** (Phase 2) — DB-level trigger blocks
  `status='ready'` on any post with unverified hadith refs. The app never
  generates hadith book+number references from AI memory.

## Build phases

| Phase | Scope                                          | Est.        |
| ----- | ---------------------------------------------- | ----------- |
| 0     | Scaffold, Supabase, sidebar nav                | 1-2h        |
| 1     | yt-dlp + WhisperX + transcript viewer          | 5-7h        |
| 2     | Hadith verification kernel                     | 3-4h        |
| 3     | 10-15 starter Islamic figures                  | 3-4h        |
| 3.5   | Hadith corpus (29,685 across 5 collections)    | 3-4h        |
| 4     | Quran local corpus + fuzzy matcher             | 3-5h        |
| 5     | Claude API in-app (hooks, convert, slop check) | 3-4h        |
| 6     | Short-form clip batch creator                  | 8-10h       |
| 7     | Typefully integration (push drafts)            | 2-3h        |
| 8     | Content calendar + gap alerts + recommender    | 3-4h        |
| 9     | Unsplash image search                          | 1-2h        |

V2 (post-ship, after 4 weeks of usage data): long-form video editor,
platform converter, content calendar alerts, Claude API integration.

## Safety rules (non-negotiable)

1. **Never generate hadith book+number references from AI memory.** Every
   reference must link to sunnah.com and be manually verified. The DB
   trigger enforces this; the UI advises. Both must agree.
2. Post drafting stays in Claude.ai via copy-to-clipboard. The API handles
   structured one-shot tasks only (hooks, conversions, recommendations).
3. Local media (`downloads/`, `backgrounds/`, `recitations/`, `renders/`)
   is never committed or uploaded to Supabase.
