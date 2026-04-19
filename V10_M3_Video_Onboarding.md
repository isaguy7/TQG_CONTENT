# V10 Milestone 3 — Video & Onboarding

**Goal:** Video tools work end-to-end. Non-TQG user #2 can be onboarded remotely without hand-holding.
**Target duration:** 8 weekends
**Ships:** clip batch creator, long-form video editor, Electron render helper, onboarding flow, user approval, help center completion.

**Prerequisite:** M2 shipped. You've cancelled Typefully. You've been using the app as your only publishing tool for 3+ weeks.

---

## M3 sections & build order

1. **Clip batch creator** — the 3-step wizard for short-form Islamic clips
2. **Long-form video editor** — YouTube → transcribe → Quran match → subtitle overlay
3. **YouTube caption detection flow** — per-video choice modal
4. **Electron render helper** — proper desktop app with auto-updater
5. **Render job queue + device pairing** — web ↔ helper handshake
6. **Onboarding flow** — first-time user walkthrough
7. **User approval system** — sign-up → pending → admin approves → active
8. **Admin tools** — user management, usage monitoring, health dashboard
9. **Help center expansion** — every feature documented with screenshots

---

## Section 1 — Clip batch creator

The concept: you sit down once a week, pick 10-20 ayahs, and in ~30 minutes generate a batch of clips ready to post. Each clip is <20 seconds, vertical (1080x1920), with Arabic + English subtitles over nature/Kaaba footage.

### 1.1 Route structure

`app/(app)/clips/page.tsx` — batch list (past batches)
`app/(app)/clips/new/page.tsx` — 3-step wizard

### 1.2 Wizard — Step 1: Pick ayahs

```
┌──────────────────────────────────────────────────────────┐
│ Step 1 of 3 · Pick ayahs                                 │
│                                                          │
│ Search Quran or surah:                                   │
│ [Search...]                                              │
│                                                          │
│ Selected (12):                                           │
│ ┌────────────────────────────────────────────────────┐  │
│ │ 1. Al-Ikhlas 112:1-4         [Preview] [Remove]    │  │
│ │ 2. Al-Fatiha 1:1-7           [Preview] [Remove]    │  │
│ │ 3. Ayat al-Kursi 2:255       [Preview] [Remove]    │  │
│ │ ...                                                 │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ Suggestions:                                             │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Short surahs (good for clips):                     │  │
│ │ [Al-Asr 103] [Al-Kawthar 108] [An-Nasr 110]        │  │
│ │                                                     │  │
│ │ Popular ayahs:                                      │  │
│ │ [2:286] [3:8] [25:74] [3:190-191]                  │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│                                 [Back]  [Next: Style →]  │
└──────────────────────────────────────────────────────────┘
```

Ayah selection uses same Quran picker as editor. User can pick:
- Single ayah (e.g. 2:255)
- Range (e.g. 2:285-286)
- Full short surah (e.g. 112:1-4)

Preview button: plays a stock recitation (alquran.cloud has MP3 URLs for multiple reciters — Mishary, Sudais, Al-Afasy) so user can hear how it sounds.

### 1.3 Wizard — Step 2: Style preset

```
┌──────────────────────────────────────────────────────────┐
│ Step 2 of 3 · Pick style                                 │
│                                                          │
│ Reciter:                                                 │
│ [ Mishary Rashid Alafasy (default) ▾]                   │
│                                                          │
│ Background footage:                                      │
│ ┌────────┬────────┬────────┬────────┐                  │
│ │ [img]  │ [img]  │ [img]  │ [img]  │                  │
│ │ Kaaba  │ Madinah│ Mtn    │ Ocean  │                  │
│ │ [✓]    │        │        │        │                  │
│ └────────┴────────┴────────┴────────┘                  │
│ ☐ Rotate through multiple backgrounds per clip          │
│                                                          │
│ Subtitle style:                                          │
│ • Arabic font: [Amiri ▾]                                │
│ • English translation: [Saheeh International ▾]         │
│ • Position: [Center ▾]                                  │
│ • Size: [Medium ▾]                                      │
│                                                          │
│ Branding:                                                │
│ ☑ TQG watermark (top-right)                             │
│ ☑ Include outro card                                    │
│                                                          │
│                            [Back]  [Next: Review →]      │
└──────────────────────────────────────────────────────────┘
```

Background footage:
- Curated library of ~30 royalty-free clips (Pexels, Pixabay, Mixkit)
- Stored in Supabase storage, metadata in a `clip_backgrounds` table
- Categories: Kaaba, Madinah, mountains, ocean, sky/clouds, calligraphy, candles
- "Upload your own" option for user-provided backgrounds

Presets saved per user (`user_profiles.preferences.clip_preset`).

### 1.4 Wizard — Step 3: Review and render

```
┌──────────────────────────────────────────────────────────┐
│ Step 3 of 3 · Review                                     │
│                                                          │
│ Batch: 12 clips · est. 18 min total render time          │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Clip 1 · Al-Ikhlas · 16 sec                        │  │
│ │ [thumbnail preview]                     [Edit]     │  │
│ │                                                     │  │
│ │ Clip 2 · Al-Fatiha · 19 sec                        │  │
│ │ [thumbnail]                             [Edit]     │  │
│ │ ...                                                 │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ Render helper status: ✓ Connected (RTX 4060 Ti)         │
│                                                          │
│ After render:                                            │
│ ☐ Auto-create draft posts for each clip                 │
│ ☑ Save to Supabase storage                              │
│                                                          │
│                      [Back]  [Start rendering →]         │
└──────────────────────────────────────────────────────────┘
```

Click "Start rendering" → creates `clip_batch` row + N `render_jobs` rows, dispatches to render helper via queue.

### 1.5 Batch progress UI

After starting, show progress:

```
┌──────────────────────────────────────────────────────────┐
│ Rendering batch "April short clips"                      │
│                                                          │
│ ████████████░░░░░░░░ 60% (7/12 done)                    │
│                                                          │
│ ✓ Clip 1 · Al-Ikhlas · ready [Preview] [Download]       │
│ ✓ Clip 2 · Al-Fatiha · ready [Preview] [Download]       │
│ ⏳ Clip 3 · Ayat al-Kursi · rendering...                │
│ ⏸ Clip 4 · queued                                        │
│ ...                                                      │
│                                                          │
│ [Cancel remaining]                                       │
└──────────────────────────────────────────────────────────┘
```

Realtime updates via Supabase realtime subscription on `render_jobs` table.

### 1.6 Post-render actions

Each completed clip can be:
- **Preview** in-browser
- **Download** (MP4)
- **Create draft post** — opens editor with video attached + pre-filled caption "{Surah} · Ayah {N}" + hashtags like `#Quran #{SurahName}`
- **Add to queue** — schedule directly from here

### 1.7 Data model

```sql
-- Already in V10 Architecture spec:
clip_batch (id, user_id, name, clips JSONB, style_preset JSONB, status, created_at)
render_jobs (id, video_project_id, batch_id, job_type, input, status, progress, ...)

-- New for M3: background library
clip_backgrounds (
  id UUID PK,
  name TEXT,
  category TEXT,
  duration_seconds INT,
  url TEXT,
  thumbnail_url TEXT,
  uploaded_by UUID REFERENCES auth.users,  -- null = curated
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.8 The input JSON for render_jobs

For a short clip render:

```json
{
  "job_type": "short_clip",
  "ayah": { "surah": 112, "start_ayah": 1, "end_ayah": 4 },
  "reciter": "mishary_alafasy",
  "recitation_audio_url": "https://...",
  "background_video_url": "https://...",
  "arabic_text": "قُلْ هُوَ اللَّهُ أَحَدٌ...",
  "translation": "Say, He is Allah, [who is] One...",
  "translation_source": "saheeh_international",
  "font": { "arabic": "Amiri", "english": "Inter" },
  "watermark": { "text": "@thequrangroup", "position": "top-right" },
  "outro_card": { "enabled": true, "text": "The Quran Group", "duration": 2 },
  "output": { "width": 1080, "height": 1920, "fps": 30, "format": "mp4" }
}
```

The render helper consumes this JSON and produces an MP4.

---

## Section 2 — Long-form video editor

For lectures, khutbahs, or talks where you want to burn Quran overlay + subtitles onto a longer video.

### 2.1 Route

`app/(app)/clips/long/new/page.tsx`

### 2.2 Flow

```
1. Paste YouTube URL  →
2. Probe captions     →
3. Transcribe (or use captions) →
4. AI finds Quran ayahs →
5. You review matches  →
6. Subtitle style →
7. Render
```

### 2.3 Step 1: YouTube URL

Input box + "Analyze" button. Helper does the yt-dlp download locally; web shows progress via realtime.

### 2.4 Step 2: Caption detection (per-video choice modal)

After probe:

```
┌──────────────────────────────────────────────────────────┐
│ Captions detected on YouTube                             │
│                                                          │
│ Available:                                               │
│ • English (manual) — 94% confidence, full video         │
│ • English (auto-generated) — 78% confidence             │
│                                                          │
│ How should we transcribe?                                │
│                                                          │
│ ┌──────────────────────────────────────────────────┐    │
│ │ ○ Use YouTube captions                            │    │
│ │   Fast, free. Good for clear speech.              │    │
│ │   ⚠ May miss Arabic Quran verses                  │    │
│ └──────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────┐    │
│ │ ○ WhisperX (local, GPU)                           │    │
│ │   Slow (~10 min for 60 min video). Best accuracy. │    │
│ │   ✓ Captures Quran verses correctly               │    │
│ └──────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────┐    │
│ │ ● Hybrid: captions + WhisperX for Arabic sections │    │
│ │   Medium speed. Best of both.                     │    │
│ │   Uses YouTube captions for English, WhisperX     │    │
│ │   detects Arabic and re-transcribes those parts.  │    │
│ └──────────────────────────────────────────────────┘    │
│                                                          │
│                          [Back]  [Continue]              │
└──────────────────────────────────────────────────────────┘
```

For the hybrid path: use YouTube captions as base; run WhisperX only on segments where caption text contains Arabic characters or on gaps where captions are sparse.

If no captions detected: skip this modal, go straight to WhisperX.

### 2.5 Step 3-4: Quran matching

After transcription, AI (Claude Sonnet via `/api/ai/match-quran`) scans the transcript for likely Quran quotes:

```typescript
// /api/ai/match-quran
// Input: transcript with word-level timestamps
// Output: list of { start_time, end_time, surah, ayah, confidence }

const prompt = `
This is a transcript from an Islamic lecture. Identify any Quran verses being recited.

For each match, return:
- start_time (seconds)
- end_time (seconds)
- surah number
- ayah number (or range)
- the Arabic text snippet from the transcript
- confidence (0-1)

Rules:
- Do NOT guess. Only include high-confidence matches.
- For partial recitations, include what's there.
- Prefer Arabic text matches over English references.
- If the speaker quotes a verse but only in English paraphrase, mark confidence < 0.7.

Transcript:
${transcript}

Return JSON only. No preamble.
`;
```

Match each AI suggestion against the real Quran database using normalized Arabic text comparison. If the AI says 2:255 but the Arabic doesn't match 2:255 in our DB, reject.

### 2.6 Step 5: Review matches

```
┌──────────────────────────────────────────────────────────┐
│ Quran matches found: 14                                  │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ 1. 00:03:42 - 00:03:58 · Al-Baqarah 2:255          │  │
│ │    [waveform preview]                               │  │
│ │    Arabic: اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ │  │
│ │    Confidence: 96%  [✓ Confirm] [✗ Reject] [Edit]  │  │
│ │                                                     │  │
│ │ 2. 00:12:20 - 00:12:35 · Al-Ikhlas 112:1-4         │  │
│ │    Confidence: 98%  [✓ Confirm] [✗ Reject] [Edit]  │  │
│ │                                                     │  │
│ │ 3. 00:18:03 - 00:18:12 · Al-Fatiha 1:1             │  │
│ │    Confidence: 72%  ⚠ Low confidence                │  │
│ │                     [✓ Confirm] [✗ Reject] [Edit]  │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ [Confirm all ≥90%]  [Back]  [Next →]                    │
└──────────────────────────────────────────────────────────┘
```

You as hafiz verify each match. Low-confidence ones flagged.

Edit action: opens a Quran picker so you can correct the surah/ayah if AI got it wrong.

### 2.7 Step 6-7: Subtitle style + render

Similar preset picker as clip batch, plus:
- Subtitle on/off per section (burn subtitles on English speech too?)
- Quran overlay style (larger font for Quran sections, Arabic always shown)

Render helper:
1. Re-downloads source if needed
2. Generates ASS subtitle file:
   - English subtitles throughout
   - Arabic Quran overlay for matched sections (larger, styled differently)
3. ffmpeg with NVENC: burns subtitles onto video
4. Uploads output to Supabase storage

Output: original video with:
- English subtitles burned in throughout
- When Quran verse plays, Arabic text appears in upper third (or overlay position per preset)
- Surah:ayah reference appears in corner during Quran sections

---

## Section 3 — YouTube caption detection

Already covered in section 2.4. Additional detail:

### 3.1 Probe endpoint

`/api/video/probe-captions`:

```typescript
export async function POST(req: Request) {
  const { url } = await req.json();
  
  // Call yt-dlp via render helper (if online) or direct subprocess on Vercel fails (long-running)
  // Better: have web UI send probe request to helper via render_jobs queue
  // Or: use youtube-transcript npm package for simple cases
  
  // Approach: use youtube-transcript for initial probe (fast, serverless-safe)
  // Helper fetches full video only when user confirms transcription choice
}
```

Use the npm package `youtube-transcript` for fast probe. It returns captions without downloading video.

### 3.2 Language handling

Probe returns all available caption tracks. If video has:
- Single track (English auto): default to WhisperX or Hybrid
- Manual English: default to "Use captions" with hybrid option
- Manual English + auto Arabic: default to Hybrid
- No captions: go straight to WhisperX

---

## Section 4 — Electron render helper

Separate repository: `tqg-render` (under your GitHub).

### 4.1 What it is

A desktop app Isa installs on his PC. It:
- Polls the web backend for render jobs
- Executes yt-dlp, WhisperX, ffmpeg on the local GPU
- Uploads results back to Supabase
- Auto-updates itself

### 4.2 Tech stack

- **Electron Forge** — scaffolding + builders
- **Electron React** — UI for the helper app (minimal: status, logs, settings)
- **electron-updater** — auto-update support (GitHub Releases as backend)
- **yt-dlp-exec** — Node binding for yt-dlp
- **fluent-ffmpeg** — Node binding for ffmpeg
- **WhisperX** — Python subprocess, invoked via child_process

### 4.3 App structure

```
tqg-render/
├── src/
│   ├── main/
│   │   ├── index.ts           # main process
│   │   ├── poller.ts          # polls render_jobs table
│   │   ├── runners/
│   │   │   ├── short-clip.ts  # short clip renderer
│   │   │   ├── long-edit.ts   # long edit renderer
│   │   │   ├── youtube-dl.ts
│   │   │   ├── whisperx.ts
│   │   │   └── ffmpeg.ts
│   │   ├── uploader.ts        # upload results to Supabase
│   │   ├── pairing.ts         # device pairing handshake
│   │   └── updater.ts         # electron-updater wrapper
│   ├── renderer/
│   │   ├── App.tsx            # status UI
│   │   └── components/
│   └── shared/
│       └── types.ts           # shared with web app
├── assets/
├── bin/                       # bundled binaries
│   ├── yt-dlp.exe             # Windows
│   ├── ffmpeg.exe
│   └── whisperx/              # python venv? docker? see below
├── forge.config.ts
├── package.json
└── README.md
```

### 4.4 UI (minimal)

```
┌─────────────────────────────────────┐
│ TQG Render Helper                   │
│                                     │
│ Status: ✓ Connected                 │
│ Device: DESKTOP-ISA1                │
│ GPU: RTX 4060 Ti 8GB                │
│                                     │
│ ── Queue ──                         │
│ 0 running · 0 pending               │
│                                     │
│ ── Last 5 jobs ──                   │
│ ✓ short_clip · Al-Ikhlas · 2m ago   │
│ ✓ short_clip · Al-Fatiha · 3m ago   │
│ ...                                 │
│                                     │
│ [ Open logs ]  [ Settings ]         │
│                                     │
│ v1.2.0 · Update available [Install] │
└─────────────────────────────────────┘
```

That's it. No feature-rich UI. Helper does one thing.

### 4.5 WhisperX integration

WhisperX is Python. Options:

**Option A — Bundle Python:**
Ship a Python embeddable distro + pre-installed WhisperX. Large install (~2GB) but zero user friction. Use `python-embed` pattern.

**Option B — Docker:**
Require user to have Docker installed, run WhisperX in container. Smaller helper install but more user friction.

**Option C — User installs WhisperX separately:**
Helper detects WhisperX in PATH or in configured venv. Cheap for helper app, slow onboarding.

**Recommendation for V10:** Option A for Isa (you know how to set this up). When shipping to other users, detect their setup and support all three paths.

### 4.6 Polling vs WebSocket

Helper polls `/api/render/next-job` every 5 seconds. Acceptable latency for video jobs that take minutes anyway.

On claim, helper locks the job (`status='claimed'`, sets `claimed_by` and `claimed_at`). Other helpers (if multiple) skip claimed jobs.

On timeout (job claimed for >30 min with no progress), server marks as failed and re-queues.

### 4.7 Pairing

First-time setup:

1. User opens web app → Settings → Render Helper → "Pair new device"
2. Web generates a 6-digit code, creates `device_pairings` row with 10-min expiry
3. User opens helper app → enters code
4. Helper POSTs `/api/render/pair` with code
5. Server validates code, issues a long-lived device token, stores `device_id` and `token`
6. Helper saves token, now authenticated for polling

Token revocation: Settings UI lists paired devices with "Revoke" button.

### 4.8 Code signing

**Windows:** EV code signing cert ~$300-500/year from DigiCert, Sectigo, etc. Without it, Windows SmartScreen warns users. For M3 internal use (just Isa), ship unsigned. Add signing before M4 public launch.

**macOS:** Apple Developer Program $99/year + notarization. Same — defer.

**Linux:** AppImage + deb packages unsigned is acceptable.

### 4.9 Auto-updater

Use `electron-updater` with GitHub Releases as the update feed:
- CI publishes new release on `tgq-render` repo tag
- Helper checks for updates on launch + every 4 hours
- Downloads in background, prompts user on quit "Install update and restart"

---

## Section 5 — Render job queue + device pairing

Covered in architecture + above. Additional routes needed:

### 5.1 API routes

- `POST /api/render/pair` — device pairing
- `POST /api/render/next-job?device_id=...` — helper claims next job
- `POST /api/render/progress` — helper reports progress
- `POST /api/render/complete` — helper uploads output, marks done
- `POST /api/render/fail` — helper reports failure
- `GET /api/render/jobs/:id/upload-url` — returns signed Supabase upload URL for result

### 5.2 Job claiming (atomic)

```sql
-- Postgres function for atomic claim
CREATE OR REPLACE FUNCTION claim_next_render_job(device_id TEXT)
RETURNS render_jobs AS $$
DECLARE
  job render_jobs%ROWTYPE;
BEGIN
  UPDATE render_jobs
  SET status = 'claimed', claimed_by = device_id, claimed_at = NOW()
  WHERE id = (
    SELECT id FROM render_jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO job;
  
  RETURN job;
END;
$$ LANGUAGE plpgsql;
```

`FOR UPDATE SKIP LOCKED` prevents two helpers claiming the same job.

### 5.3 Fallback when helper offline

If helper is offline and user tries to render:
- UI shows "Render helper offline. Install or start the helper."
- Link to download helper
- Option: queue anyway → helper will pick it up when next online

---

## Section 6 — Onboarding flow

### 6.1 First-time user experience

After signup (+ admin approval, see Section 7):

```
1. Welcome screen
   "Let's get you set up in 2 minutes"
   [Get started]

2. Profile
   Name: [___]
   Timezone: [auto-detected]
   What do you create content about? [multiselect: Tafsir, Seerah, Hadith, Reminders, Fiqh]
   [Continue]

3. Connect your first platform
   [LinkedIn] [X] [Facebook] [Instagram]
   "You can add more later"
   [Skip for now]

4. Meet the figure library
   "We've seeded 70+ Islamic figures with themes and hook angles.
    Here are a few you might post about first:"
   [carousel of 5 starter figures]
   [Continue]

5. The hadith rule
   "The app will never publish an unverified hadith.
    Every hadith shows as UNVERIFIED until you've confirmed it on sunnah.com.
    This is a trust feature — it exists for your protection and your audience's."
   [I understand]

6. Try your first post
   "Here's a starter draft. Make it yours."
   [Opens editor with pre-filled figure + topic]
```

### 6.2 Persistent onboarding

Sidebar shows a progress widget until all steps done:

```
Getting started (3/5)
✓ Connect a platform
✓ Write your first draft
✓ Use the AI assistant
○ Verify your first hadith
○ Schedule your first post
```

Dismissable. Re-openable from Settings → Help.

### 6.3 Empty states with guidance

Every major screen has a guided empty state:

- Posts page (0 posts): "Start with an idea. Click New post or press Cmd+K."
- Calendar (0 posts): "Your published posts will appear here. Connect a platform to pull your history."
- Figures (filter returns 0): "Try clearing filters or browse by category."

### 6.4 Tooltips

For non-obvious UI:
- The UNVERIFIED badge → tooltip: "Click to verify this hadith on sunnah.com before publishing."
- The figure gap warning → tooltip: "You posted about this figure on LinkedIn 3 days ago. Consider waiting or posting on a different platform."
- The hook category dropdown → tooltip: "Categories help track which hook styles perform best for your audience."

Use a lightweight library like `@radix-ui/react-tooltip` (already in shadcn).

### 6.5 Interactive product tour (optional)

For M3, don't build a full interactive tour. Rely on:
- Welcome flow (linear steps)
- Persistent onboarding widget
- Per-screen empty states
- Contextual tooltips

A full tour (Shepherd.js or similar) can be added in M4 if user feedback demands it.

---

## Section 7 — User approval system

### 7.1 State machine

```
SIGNUP → pending → approved (becomes 'member')
                → rejected
```

### 7.2 Signup flow

Public signup form at `/signup`:

```
Email: [___]
Password: [___]
Name: [___]
What will you use the app for?
[textarea, required, 100-500 chars]
[Sign up]
```

On submit:
1. Create auth.users row
2. Create user_profiles row with role='pending', stores signup reason
3. Notify admin via email (Resend)
4. Redirect user to `/pending` page

### 7.3 Pending page

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ⏳ Your account is pending approval                     │
│                                                          │
│  We review each new user to make sure the community      │
│  stays focused and the AI quota isn't abused.            │
│                                                          │
│  You'll get an email when approved (usually 24-48h).     │
│                                                          │
│  Questions? Email support@thequrangroup.com              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 7.4 Admin review UI

`/admin/users?tab=pending`:

```
┌──────────────────────────────────────────────────────────┐
│ Pending approvals (3)                                    │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ aisha@example.com · signed up 2 hours ago          │  │
│ │ "I run a da'wah Instagram with 3k followers and    │  │
│ │  want to improve my posting consistency."          │  │
│ │                                                     │  │
│ │  [Approve]  [Reject] [View details]                │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ mustafa@example.com · signed up 5 hours ago        │  │
│ │ ...                                                 │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Approve → sets `role='member'`, `approved_at=NOW()`, `approved_by=admin_id`, sends welcome email.
Reject → sets `role='rejected'`, optional reason, sends polite rejection email.

### 7.5 Middleware

All `(app)` routes check:
```typescript
// middleware.ts
if (pathname.startsWith('/app') && user.role === 'pending') {
  return NextResponse.redirect('/pending');
}
if (user.role === 'rejected') {
  return NextResponse.redirect('/rejected');
}
```

### 7.6 Auto-approval rules (optional)

Later: auto-approve users with specific email domains (e.g. specific Islamic orgs) or via invite codes. For V10, all manual.

---

## Section 8 — Admin tools

### 8.1 Admin middleware

Only users with `role='admin'` see `/admin/*`. Navigation entry only shown to admins.

### 8.2 User management

`/admin/users`:
- Tabs: All · Pending · Active · Suspended · Rejected
- Columns: name, email, plan, signup date, last active, AI spend this month, posts created
- Actions: approve, suspend, promote to admin, view activity

### 8.3 Usage monitoring

`/admin/usage`:
- Total AI spend per month (chart)
- Top 10 users by spend
- Spend by feature
- Spend by model
- Spend per user per month table

### 8.4 Health dashboard

`/admin/health`:
- Publish success rate (last 7d, 30d)
- Failed job count
- Platform-by-platform error rates
- Average render time
- Active helper count
- Database query performance

### 8.5 Ops console

`/admin/ops`:
- Refresh metrics (manual trigger)
- Re-run backfill for user
- Re-run hook_performance view
- Clear stuck jobs
- Send announcement (stored in `announcements` table, displayed as banner)

---

## Section 9 — Help center expansion

Full coverage. Every feature documented.

### 9.1 MDX pages

`content/help/**/*.mdx`:

**Getting started:**
- Welcome to TQG Content Studio
- Connect your first platform
- Write your first post
- The hadith verification rule (critical)

**Writing:**
- Using the kanban view
- The post editor
- Auto-save and version history
- Per-platform variants
- Mentions and hashtags

**AI assistant:**
- How the AI assistant works
- Generating hooks
- Editing current posts
- What the AI will and won't do
- AI usage and limits

**Knowledge base:**
- The figure library (70+ figures explained)
- Browsing hadith
- Hadith gradings (sahih/hasan/daif) explained
- The UNVERIFIED flag
- Reading Quran and tafsirs

**Publishing:**
- Scheduling posts
- LinkedIn company pages
- X threads
- Facebook Pages
- Instagram Reels
- Handling failed posts

**Video:**
- Creating short clip batches
- Long-form video editing
- YouTube caption detection
- Installing the render helper
- Troubleshooting the render helper

**Analytics:**
- Understanding hook performance
- Reading the analytics dashboard
- Figure gap warnings

**Account:**
- Timezones and scheduling
- Multiple accounts and switching
- Settings and preferences

### 9.2 Each help page structure

```mdx
---
title: "How the AI assistant works"
category: "AI"
order: 1
---

# How the AI assistant works

The AI assistant lives in the right sidebar of the post editor. It has two modes:
**Draft** (creates new content) and **Edit current** (improves what you've written).

## Draft mode

[screenshot of sidebar in draft mode]

Pick a figure, optionally add a topic, and generate 10 hooks. Click any hook 
to insert it into your post and start writing from there.

...

## What the AI will never do

- Generate hadith reference numbers. Ever.
- Include em dashes in output.
- Write in "AI voice" (generic, hedged, over-hedged).

If the AI does one of these things despite the system prompts, please report it
via thumbs-down on the generated content.

## AI usage and limits

Your monthly AI budget depends on your plan:
...
```

### 9.3 In-app search

Help center page has search input that full-text searches MDX content. Implementation: pre-index MDX files at build time, static search using Fuse.js or similar.

### 9.4 Contextual help links

Throughout the app, small `?` icons link to the relevant help page:
- Next to "UNVERIFIED" flag → "The hadith verification rule"
- Next to "Hook category" → "Understanding hook performance"
- Next to figure gap warning → "Figure gap warnings explained"

---

## M3 shipping checklist

### Data / infra
- [ ] `clip_backgrounds` table seeded with 30+ curated clips
- [ ] `render_jobs` queue working with atomic claim
- [ ] `device_pairings` flow tested end-to-end
- [ ] Render helper polls, claims, renders, uploads, reports correctly

### Video — short clips
- [ ] 3-step wizard completes for 10+ clips
- [ ] Clips render to 1080x1920 MP4 with correct aspect
- [ ] Arabic font renders correctly (no box characters)
- [ ] Subtitles appear in correct position
- [ ] Watermark applied
- [ ] Clip can be previewed in browser
- [ ] Clip creates draft post on-demand

### Video — long edits
- [ ] YouTube URL probes captions in <5 sec
- [ ] Caption choice modal shows correct options
- [ ] Hybrid transcription works (captions + WhisperX for Arabic)
- [ ] Quran matching finds actual verses in a test lecture
- [ ] Match review UI allows correction
- [ ] Low-confidence matches are flagged
- [ ] Rendered long-edit has English subs + Arabic overlay

### Electron helper
- [ ] Installs cleanly on Windows 11
- [ ] Pairs via 6-digit code flow
- [ ] Polls and claims jobs
- [ ] Reports progress during render
- [ ] Uploads output successfully
- [ ] Handles errors (bad URL, WhisperX crash, ffmpeg fail)
- [ ] Auto-updates from GitHub Releases
- [ ] Shows clear status to Isa

### Onboarding
- [ ] Fresh signup → welcome flow → first post in <5 min
- [ ] All empty states have guidance
- [ ] Tooltips on non-obvious UI
- [ ] Persistent progress widget on sidebar

### User approval
- [ ] Signup creates pending user
- [ ] Admin receives email notification
- [ ] Pending users see `/pending` page
- [ ] Admin UI approves + sends welcome email
- [ ] Rejected users see `/rejected` with reason

### Admin tools
- [ ] User management page functional
- [ ] Usage monitoring shows real data
- [ ] Health dashboard shows real metrics
- [ ] Ops console has basic controls

### Help center
- [ ] 25+ help pages written
- [ ] In-app search works
- [ ] Contextual `?` links throughout app
- [ ] All screenshots current with actual UI

---

## M3 → M4 handoff

After M3, the app is feature-complete as a product. Remaining work is SaaS infrastructure: billing, teams, quotas, marketing.

**Pause point:** After M3, consider whether to:
- Continue to M4 (full SaaS)
- Ship to a closed beta (5-20 hand-picked users, no billing yet)
- Iterate on M1-M3 based on feedback before adding M4 complexity

You can stop here indefinitely if product-market fit isn't clear yet.
