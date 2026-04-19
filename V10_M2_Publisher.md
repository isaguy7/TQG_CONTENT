# V10 Milestone 2 — The Publisher

**Goal:** Cancel Typefully. All publishing happens inside the app. Scheduling is reliable. Analytics surface what's working.
**Target duration:** 6 weekends
**Ships:** direct posting to 4 platforms, durable scheduler, per-platform media pipeline, analytics dashboard.

**Prerequisite:** M1 shipped and used for real posting for 2+ weeks. Don't start M2 until you're annoyed at copy-pasting to Typefully daily. That annoyance is the signal.

---

## M2 sections & build order

1. **Publishing abstraction layer** — common interface for all platforms
2. **LinkedIn direct publishing** — personal + company pages
3. **X direct publishing** — single tweets + threads
4. **Facebook Pages publishing**
5. **Instagram Business publishing** — Reels + image posts
6. **Scheduling engine** — durable cron with Inngest or Trigger.dev
7. **Media pipeline** — per-platform resizing, video transcode, thumbnail extract
8. **Queue dashboard** — upcoming/failed posts with retry
9. **Post preview system** — accurate per-platform render preview
10. **Analytics dashboard** — impressions, engagement, hook/figure performance
11. **Metrics refresh cron** — pull fresh metrics for last 30d nightly

---

## Section 1 — Publishing abstraction layer

### 1.1 The interface

Every platform implements this exact interface. No exceptions.

```typescript
// lib/platforms/types.ts
export interface PlatformPublisher {
  readonly platform: Platform;
  
  validate(content: PostContent, connection: OAuthConnection): Promise<ValidationResult>;
  publish(content: PostContent, connection: OAuthConnection): Promise<PublishResult>;
  fetchPost(externalId: string, connection: OAuthConnection): Promise<ExternalPost | null>;
  fetchMetrics(externalId: string, connection: OAuthConnection): Promise<Metrics | null>;
  fetchRecentPosts(connection: OAuthConnection, options?: FetchOptions): Promise<ExternalPost[]>;
}

export interface PostContent {
  text: string;
  media: MediaAsset[];  // images, videos — already processed + hosted
  link?: { url: string; title?: string; description?: string; image?: string };
  threadParts?: string[];  // X threads — each part is a separate tweet
  platformSpecific?: Record<string, unknown>;  // escape hatch for edge cases
}

export interface PublishResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfter?: Date;
  };
  raw?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}
```

### 1.2 Dispatcher

```typescript
// lib/platforms/dispatcher.ts
import { linkedInPublisher } from './linkedin/publisher';
import { xPublisher } from './x/publisher';
import { facebookPublisher } from './facebook/publisher';
import { instagramPublisher } from './instagram/publisher';

const publishers: Record<Platform, PlatformPublisher> = {
  linkedin: linkedInPublisher,
  x: xPublisher,
  facebook: facebookPublisher,
  instagram: instagramPublisher
};

export async function publishToPlatform(
  platform: Platform,
  content: PostContent,
  connection: OAuthConnection
): Promise<PublishResult> {
  const publisher = publishers[platform];
  if (!publisher) throw new Error(`No publisher for ${platform}`);
  
  const validation = await publisher.validate(content, connection);
  if (!validation.ok) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: validation.errors.join(', '),
        retryable: false
      }
    };
  }
  
  return publisher.publish(content, connection);
}
```

### 1.3 Error taxonomy

All platform errors normalize to these codes:

| Code | Retryable | Meaning |
|---|---|---|
| `RATE_LIMITED` | Yes (with backoff) | Platform rate limit hit |
| `TOKEN_EXPIRED` | Yes (after refresh) | Access token no longer valid |
| `TOKEN_INVALID` | No | Token bad, need reconnect |
| `CONTENT_REJECTED` | No | Content violates platform policy |
| `MEDIA_TOO_LARGE` | No | Image/video exceeds limit |
| `MEDIA_INVALID_FORMAT` | No | Codec/format not supported |
| `DUPLICATE_CONTENT` | No | Platform detected duplicate |
| `PLATFORM_OUTAGE` | Yes (long backoff) | 5xx from platform |
| `UNKNOWN` | Manual review | Catch-all |

---

## Section 2 — LinkedIn direct publishing

### 2.1 Publisher implementation

`lib/platforms/linkedin/publisher.ts`:

Uses UGC Posts API (`/v2/ugcPosts`) for personal posts and organization posts.

Key differences by account type:
- Personal: `author: 'urn:li:person:{id}'`
- Company page: `author: 'urn:li:organization:{id}'`, requires `w_organization_social` scope

Content types LinkedIn accepts:
- Text only (up to 3,000 chars)
- Text + image (up to 9 images, 5MB each)
- Text + video (up to 10 min)
- Text + article link (preview fetched by LinkedIn)

### 2.2 Media upload flow

LinkedIn uses a two-step upload:

```typescript
async function uploadLinkedInMedia(media: MediaAsset, connection: OAuthConnection) {
  // Step 1: Register upload
  const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: connection.account_type === 'personal' 
          ? `urn:li:person:${connection.account_id}`
          : `urn:li:organization:${connection.account_id}`,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent'
        }]
      }
    })
  });
  
  const registerData = await registerRes.json();
  const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = registerData.value.asset;
  
  // Step 2: Upload bytes
  const imageBuffer = await fetch(media.url).then(r => r.arrayBuffer());
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      'Content-Type': media.mimeType
    },
    body: imageBuffer
  });
  
  return asset;  // Use this URN in the actual post
}
```

Video is more complex — chunked upload. LinkedIn SDK recommended. Write a helper `uploadLinkedInVideo`.

### 2.3 Publish call

```typescript
async publish(content: PostContent, connection: OAuthConnection): Promise<PublishResult> {
  const author = connection.account_type === 'personal'
    ? `urn:li:person:${connection.account_id}`
    : `urn:li:organization:${connection.account_id}`;
  
  // Upload any media first
  const mediaAssets = await Promise.all(
    content.media.map(m => uploadLinkedInMedia(m, connection))
  );
  
  const body: any = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content.text },
        shareMediaCategory: mediaAssets.length > 0 ? 'IMAGE' : 'NONE',
        media: mediaAssets.map(asset => ({
          status: 'READY',
          description: { text: '' },
          media: asset,
          title: { text: '' }
        }))
      }
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  };
  
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0'
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    return mapLinkedInError(res);
  }
  
  const data = await res.json();
  const postId = res.headers.get('X-RestLi-Id') ?? data.id;
  
  return {
    success: true,
    externalId: postId,
    externalUrl: `https://www.linkedin.com/feed/update/${postId}/`,
    raw: data
  };
}
```

### 2.4 Validation

LinkedIn rules to enforce:
- Text max 3,000 chars
- Max 9 images
- Video max 10 min, max 5GB
- Image max 36MB each

```typescript
async validate(content: PostContent): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (content.text.length > 3000) {
    errors.push(`Text is ${content.text.length} chars, LinkedIn limit is 3000`);
  }
  
  if (content.media.filter(m => m.type === 'image').length > 9) {
    errors.push('LinkedIn allows max 9 images per post');
  }
  
  // ...more checks
  
  return { ok: errors.length === 0, errors, warnings };
}
```

### 2.5 Error mapping

```typescript
function mapLinkedInError(res: Response): PublishResult {
  switch (res.status) {
    case 401:
      return { success: false, error: { code: 'TOKEN_INVALID', message: 'Reconnect LinkedIn', retryable: false } };
    case 429:
      const retryAfter = res.headers.get('Retry-After');
      return { success: false, error: { code: 'RATE_LIMITED', message: 'Rate limited', retryable: true, retryAfter: retryAfter ? new Date(Date.now() + parseInt(retryAfter) * 1000) : undefined } };
    case 422:
      return { success: false, error: { code: 'CONTENT_REJECTED', message: 'Content rejected', retryable: false } };
    default:
      if (res.status >= 500) {
        return { success: false, error: { code: 'PLATFORM_OUTAGE', message: `LinkedIn ${res.status}`, retryable: true } };
      }
      return { success: false, error: { code: 'UNKNOWN', message: `HTTP ${res.status}`, retryable: false } };
  }
}
```

---

## Section 3 — X direct publishing

### 3.1 Single tweet

```typescript
async publish(content: PostContent, connection: OAuthConnection): Promise<PublishResult> {
  // Upload media first (X requires separate upload)
  const mediaIds = await Promise.all(
    content.media.map(m => uploadXMedia(m, connection))
  );
  
  // Determine if thread
  if (content.threadParts && content.threadParts.length > 1) {
    return publishThread(content.threadParts, mediaIds, connection);
  }
  
  // Single tweet
  const body: any = {
    text: content.text
  };
  
  if (mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }
  
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) return mapXError(res);
  
  const data = await res.json();
  return {
    success: true,
    externalId: data.data.id,
    externalUrl: `https://twitter.com/${connection.handle}/status/${data.data.id}`,
    raw: data
  };
}
```

### 3.2 Threads

```typescript
async function publishThread(parts: string[], mediaIds: string[], connection: OAuthConnection): Promise<PublishResult> {
  const firstTweet = await publishSingleTweet({ text: parts[0], media_ids: mediaIds.length > 0 ? [mediaIds[0]] : [] }, connection);
  if (!firstTweet.success) return firstTweet;
  
  let replyTo = firstTweet.externalId!;
  const tweetIds = [firstTweet.externalId!];
  
  for (let i = 1; i < parts.length; i++) {
    const reply = await publishSingleTweet({
      text: parts[i],
      reply: { in_reply_to_tweet_id: replyTo }
    }, connection);
    
    if (!reply.success) {
      // Partial failure — thread stopped at tweet i
      return {
        success: false,
        error: {
          code: 'THREAD_PARTIAL',
          message: `Thread failed at part ${i + 1} of ${parts.length}. First ${i} parts posted.`,
          retryable: false
        }
      };
    }
    
    replyTo = reply.externalId!;
    tweetIds.push(reply.externalId!);
  }
  
  return {
    success: true,
    externalId: tweetIds[0],  // URL points to first
    externalUrl: firstTweet.externalUrl,
    raw: { thread_ids: tweetIds }
  };
}
```

### 3.3 Media upload

X uses OAuth 1.0a for media upload even when the rest of the API uses OAuth 2.0 (at time of writing, this may change). Use the v1.1 media endpoint:

```
POST https://upload.twitter.com/1.1/media/upload.json
```

For images under 5MB: simple multipart upload. For video: chunked init/append/finalize flow. Use a library like `twitter-api-v2` to avoid writing this yourself.

Validation:
- Text max 280 chars (per tweet)
- Image max 5MB
- Video max 512MB, max 2:20
- Max 4 images per tweet

### 3.4 Media per thread part

Currently each thread part can have its own media. Store as:
```typescript
threadParts: string[]
threadMedia?: MediaAsset[][]  // one array per part
```

If `threadMedia` not provided, first part gets `content.media`, rest have none.

---

## Section 4 — Facebook Pages publishing

### 4.1 Setup prerequisites

Before M2 code work:
1. Create Meta developer account
2. Create an app in Meta for Developers
3. Add Facebook Login + Pages API products
4. App Review for `pages_manage_posts`, `pages_read_engagement`
5. Submit for review — this can take 1-3 weeks

**Start this the day M1 ships.** Don't wait.

### 4.2 Page access tokens

When user connects Facebook:
1. User grants `pages_show_list` + `pages_manage_posts`
2. We fetch `/me/accounts` to list pages user admins
3. User picks which pages to activate
4. For each activated page, we extract the page access token from the `/me/accounts` response
5. Store as separate `oauth_connections` row with `account_type: 'facebook_page'`, parent being the user's personal FB connection

Page access tokens don't expire (if user is still an admin) but can be invalidated if the user changes password. Handle that gracefully.

### 4.3 Publish

```typescript
async publish(content: PostContent, connection: OAuthConnection): Promise<PublishResult> {
  const pageId = connection.account_id;
  const pageToken = connection.access_token;
  
  // For text + image
  if (content.media.length === 1 && content.media[0].type === 'image') {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/photos`,
      {
        method: 'POST',
        body: formDataWith({
          url: content.media[0].url,
          caption: content.text,
          access_token: pageToken
        })
      }
    );
    // ...
  }
  
  // Text only
  else if (content.media.length === 0) {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}/feed`,
      {
        method: 'POST',
        body: formDataWith({
          message: content.text,
          access_token: pageToken
        })
      }
    );
    // ...
  }
  
  // Multi-image (carousel)
  // First upload each as "unpublished", then publish as a batch
}
```

Validation:
- Text no hard limit (63,206 chars effectively)
- Images: 10 max, 4MB each
- Video up to 240 min, 10GB

---

## Section 5 — Instagram Business publishing

### 5.1 Setup prerequisites

- Instagram account must be **Business account** (not personal or Creator)
- Business account must be linked to a Facebook Page
- Same Meta app as Facebook Pages, additional scopes: `instagram_basic`, `instagram_content_publish`

### 5.2 Reels flow

Instagram Reels publishing is a **three-step container flow**:

```
1. Upload video to public URL (Supabase storage)
2. Create media container: POST /{ig-user-id}/media with media_type=REELS
3. Poll container status until FINISHED
4. Publish container: POST /{ig-user-id}/media_publish
```

```typescript
async function publishReel(content: PostContent, connection: OAuthConnection): Promise<PublishResult> {
  const video = content.media[0];
  
  // Step 1: Create container
  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${connection.account_id}/media`,
    {
      method: 'POST',
      body: formDataWith({
        media_type: 'REELS',
        video_url: video.url,  // must be publicly accessible
        caption: content.text,
        access_token: connection.access_token
      })
    }
  );
  
  const { id: containerId } = await containerRes.json();
  
  // Step 2: Poll for container ready
  let attempts = 0;
  while (attempts < 60) {  // 5 min max
    const statusRes = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${connection.access_token}`
    );
    const { status_code } = await statusRes.json();
    
    if (status_code === 'FINISHED') break;
    if (status_code === 'ERROR') {
      return { success: false, error: { code: 'MEDIA_INVALID_FORMAT', message: 'Reel processing failed', retryable: false } };
    }
    
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
  }
  
  // Step 3: Publish
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${connection.account_id}/media_publish`,
    {
      method: 'POST',
      body: formDataWith({
        creation_id: containerId,
        access_token: connection.access_token
      })
    }
  );
  
  const data = await publishRes.json();
  return {
    success: true,
    externalId: data.id,
    externalUrl: `https://instagram.com/reel/${data.id}/`  // needs shortcode, may need another lookup
  };
}
```

### 5.3 Image post flow

Similar container flow but with `media_type: 'IMAGE'` and `image_url`.

### 5.4 Carousel (multi-image)

Each image becomes a child container, then a parent carousel container references them all. Four-step flow.

### 5.5 Validation

- Reel: 3-90 sec, MP4/MOV, aspect 9:16 (1080x1920)
- Image: aspect 0.8 to 1.91, max 8MB
- Caption: max 2,200 chars, 30 hashtags

Reject reels under 3 sec or over 90 sec at validation stage.

---

## Section 6 — Scheduling engine

### 6.1 Pick a tool

Options:
- **Inngest** — durable functions, built for this exact use case, free tier generous
- **Trigger.dev** — similar, open source, self-hostable
- **Supabase Edge Functions + pg_cron** — simpler, free, less reliable

Recommendation: **Inngest**. It handles retries, backoff, observability out of the box. The free tier easily covers a single-user product and scales.

Install and configure per their docs.

### 6.2 Publish jobs migration

`supabase/migrations/20260501000001_v10_publish_jobs.sql`:

```sql
CREATE TABLE IF NOT EXISTS publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  content TEXT NOT NULL,
  media_urls TEXT[],
  thread_parts TEXT[],
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('queued', 'processing', 'published', 'failed', 'cancelled')) DEFAULT 'queued',
  attempts INT DEFAULT 0,
  last_error TEXT,
  last_attempted_at TIMESTAMPTZ,
  external_post_id TEXT,
  external_url TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_publish_jobs_due ON publish_jobs(scheduled_for) WHERE status = 'queued';
CREATE INDEX idx_publish_jobs_user_status ON publish_jobs(user_id, status);

ALTER TABLE publish_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_owns_job" ON publish_jobs
  FOR ALL USING (user_id = auth.uid());
```

### 6.3 Scheduling flow

When user clicks "Schedule" in editor:
1. Validate content for all selected platforms
2. For each platform, create a `publish_jobs` row with `scheduled_for` and `status='queued'`
3. Update `posts.status = 'scheduled'`
4. Send to Inngest: `inngest.send({ name: 'post.scheduled', data: { job_id, scheduled_for } })`
5. Inngest schedules the publish function to run at `scheduled_for`

### 6.4 Inngest function

```typescript
// inngest/publish.ts
export const publishScheduled = inngest.createFunction(
  {
    id: 'publish-scheduled-post',
    retries: 3,
    cancelOn: [{ event: 'post.cancelled', match: 'data.job_id' }]
  },
  { event: 'post.scheduled' },
  async ({ event, step }) => {
    const { job_id, scheduled_for } = event.data;
    
    // Wait until scheduled time
    await step.sleepUntil('wait-for-schedule', scheduled_for);
    
    // Fetch latest job state (user may have cancelled)
    const job = await step.run('fetch-job', () => getPublishJob(job_id));
    if (!job || job.status !== 'queued') return { skipped: true };
    
    // Mark processing
    await step.run('mark-processing', () => updateJob(job_id, { status: 'processing', last_attempted_at: new Date() }));
    
    // Get connection
    const connection = await step.run('fetch-connection', () => getConnection(job.user_id, job.platform, job.account_id));
    if (!connection) {
      await step.run('mark-failed', () => updateJob(job_id, { status: 'failed', last_error: 'Connection not found' }));
      return { failed: true };
    }
    
    // Publish
    const result = await step.run('publish', async () => {
      return publishToPlatform(job.platform, buildPostContent(job), connection);
    });
    
    if (result.success) {
      await step.run('mark-published', () => updateJob(job_id, {
        status: 'published',
        external_post_id: result.externalId,
        external_url: result.externalUrl,
        published_at: new Date()
      }));
      
      // Check if all platform jobs for this post are done
      await step.run('check-post-complete', () => maybeMarkPostPublished(job.post_id));
      
      return { success: true };
    }
    
    // Failed
    const retryable = result.error?.retryable ?? false;
    if (retryable) {
      // Let Inngest retry via its retry mechanism
      throw new NonRetriableError(result.error!.message);  // actually retriable, fighting API design
    }
    
    await step.run('mark-failed', () => updateJob(job_id, {
      status: 'failed',
      last_error: result.error?.message,
      attempts: (job.attempts ?? 0) + 1
    }));
    
    // Notify user of failure (M4 email)
    return { failed: true };
  }
);
```

### 6.5 Post aggregation

When all `publish_jobs` for a post are complete:
- If all succeeded: `posts.status = 'published'`, `posts.published_at = earliest successful publish`
- If any failed: `posts.status = 'failed'`, expose per-platform status in UI

### 6.6 Cancellation

User cancels scheduled post → `inngest.send({ name: 'post.cancelled', data: { job_id } })` + update job status.

### 6.7 Timezone handling

- Store `scheduled_for` as `TIMESTAMPTZ` (UTC)
- Display in user's timezone (from `user_profiles.timezone`)
- Schedule picker shows their local time but stores UTC

---

## Section 7 — Media pipeline

### 7.1 Upload endpoint

`app/api/media/upload/route.ts`:

```typescript
export async function POST(req: Request) {
  const { user } = await requireAuth();
  const formData = await req.formData();
  const file = formData.get('file') as File;
  
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  
  // Validate
  const validation = validateMedia(file);
  if (!validation.ok) return NextResponse.json({ error: validation.errors }, { status: 400 });
  
  // Upload to Supabase storage
  const path = `${user.id}/${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage
    .from('post-media')
    .upload(path, file);
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Generate thumbnail (if image) or extract (if video)
  const thumbnail = await generateThumbnail(file);
  
  return NextResponse.json({
    url: getPublicUrl(path),
    thumbnailUrl: thumbnail ? getPublicUrl(thumbnail) : null,
    type: file.type.startsWith('video/') ? 'video' : 'image',
    size: file.size,
    dimensions: await getDimensions(file)
  });
}
```

### 7.2 Per-platform resize

Different platforms want different image sizes. Generate variants on upload:

```typescript
async function generateImageVariants(originalUrl: string): Promise<{
  linkedin: string;   // 1200x627 or original if smaller
  x: string;          // 1200x675
  facebook: string;   // 1200x630
  instagram: string;  // 1080x1080 or 1080x1350 for portrait
}> {
  // Use sharp on Supabase Edge Function or Vercel function
  // Or use a service like Cloudinary/Imgix with URL transforms
}
```

Recommendation: use **Supabase image transformations** (built into storage URLs) for simple resizes:
```
{supabase_url}/storage/v1/render/image/public/post-media/{path}?width=1200&height=627&resize=cover
```

Saves building image processing entirely.

### 7.3 Video processing

For V10, video processing happens in the render helper (M3). M2 assumes videos are already in platform-ready format when uploaded.

If user uploads a video directly without render helper:
- Extract duration, check limits
- Generate thumbnail (first frame or via ffmpeg in a serverless function — expensive; defer to render helper if possible)
- Store as-is; each platform will reject if format is wrong

---

## Section 8 — Queue dashboard

### 8.1 Dashboard page

`app/(app)/posts/queue/page.tsx`:

Shows all `publish_jobs` grouped by status:

```
┌──────────────────────────────────────────────────────────┐
│ Publishing queue                                         │
│                                                          │
│ ── Processing now (2) ──                                │
│ • LinkedIn (TQG) · "Abu Bakr gave..." · 2s ago          │
│ • X (personal) · "The man who..."   · 5s ago            │
│                                                          │
│ ── Upcoming (5) ──                                      │
│ • Tomorrow 9:00 AM — LinkedIn · "..."      [Edit] [×]   │
│ • Tomorrow 12:00 PM — X · "..."            [Edit] [×]   │
│ ...                                                      │
│                                                          │
│ ── Failed (2) ──                                        │
│ • LinkedIn · "..." · TOKEN_EXPIRED  [Reconnect] [Retry] │
│ • X · "..." · RATE_LIMITED · auto-retry in 4m           │
│                                                          │
│ ── Recently published (10) ──                           │
│ • X · "..." · 12 min ago · [View on X ↗]                │
│ ...                                                      │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Retry logic

Failed jobs can be retried manually:
- If TOKEN_EXPIRED/INVALID: show "Reconnect" button, then "Retry"
- If RATE_LIMITED: show countdown to auto-retry, plus manual retry
- If CONTENT_REJECTED: show reason, no retry (user must edit)

Retry reuses the same job row, increments `attempts`.

---

## Section 9 — Post preview system

### 9.1 Preview per platform

In editor, show a "Preview" tab per active platform. Each preview renders the post as it will appear:

- **LinkedIn preview:** avatar + name + "Posts" pill + body + media carousel + "See more" truncation at ~210 chars
- **X preview:** avatar + handle + body with 280-char counter + media grid + thread counter
- **Facebook preview:** avatar + name + body + media + "Like / Comment / Share" row
- **Instagram preview:** square/portrait media + caption truncated at ~125 chars + hashtag cluster

Don't try to pixel-match the real platforms. Convey:
1. Character-count reality (does your post exceed limits?)
2. Truncation behavior (does your hook land before "See more"?)
3. Media layout (will your 3 images tile correctly?)

### 9.2 Character count

Each platform tab shows live count:
- LinkedIn: "342 / 3000 chars · truncated at 210 in feed"
- X: "124 / 280 chars"

Warn when near limit, block when over.

### 9.3 URL counting

X counts URLs as 23 chars regardless of length. Enforce this in the X preview count.

LinkedIn displays a link preview if URL is in the post. Preview shows the LinkedIn-fetched preview (title/image/desc).

---

## Section 10 — Analytics dashboard

### 10.1 Dashboard page

`app/(app)/analytics/page.tsx`:

```
┌──────────────────────────────────────────────────────────┐
│ Analytics                 [Last 30d ▾] [All platforms ▾] │
│                                                          │
│ ┌─────────────────┬─────────────────┬─────────────────┐  │
│ │ Total posts     │ Avg impressions │ Best post       │  │
│ │      47         │     2,847       │ "The man who..."│  │
│ │ ↑ 12% vs 30d    │ ↑ 8% vs 30d     │ 6,230 imp       │  │
│ └─────────────────┴─────────────────┴─────────────────┘  │
│                                                          │
│ ── Impressions over time ──                             │
│ [line chart: daily impressions, last 30d]               │
│                                                          │
│ ── Performance by hook category ──                      │
│ contrast     ████████████ 4,200 avg  (12 posts)         │
│ provocative  █████████    3,100 avg  (5 posts)          │
│ scene        ██████       2,200 avg  (8 posts)          │
│ ...                                                      │
│                                                          │
│ ── Performance by figure ──                             │
│ Abu Bakr (RA)  ███████████ 3,800 avg (7 posts)          │
│ Khadijah (RA)  ████████    2,900 avg (3 posts)          │
│ ...                                                      │
│                                                          │
│ ── Top posts ──                                         │
│ (table of top 10 posts by impressions)                  │
└──────────────────────────────────────────────────────────┘
```

### 10.2 Data sources

- Aggregate from `external_posts.metrics` JOIN `posts` on `matched_post_id`
- Only include posts where AI-tagged hook_category or figure_id exists
- Filter by user, platform, date range

### 10.3 Charts

Use **Recharts** (already in available libraries).

Line chart: `external_posts.metrics->>'impressions'` summed by day.
Bar charts: group-by queries with ordered results.

### 10.4 Export

Button: "Export CSV" — downloads posts + metrics as CSV for spreadsheet analysis.

---

## Section 11 — Metrics refresh cron

### 11.1 Daily refresh

Nightly Inngest cron:

```typescript
export const refreshMetrics = inngest.createFunction(
  { id: 'refresh-metrics-nightly' },
  { cron: '0 2 * * *' },  // 2am UTC
  async ({ step }) => {
    // For each connection, refresh metrics on last 30d of posts
    const connections = await step.run('fetch-connections', () => getAllActiveConnections());
    
    for (const conn of connections) {
      await step.run(`refresh-${conn.id}`, async () => {
        const { data: posts } = await supabase
          .from('external_posts')
          .select('id, external_id, metrics_updated_at')
          .eq('account_id', conn.account_id)
          .gte('posted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('posted_at', { ascending: false });
        
        for (const post of posts ?? []) {
          try {
            const metrics = await fetchMetricsForPlatform(conn.platform, post.external_id, conn);
            await supabase
              .from('external_posts')
              .update({ metrics, metrics_updated_at: new Date() })
              .eq('id', post.id);
          } catch (e) {
            console.error(`Failed metrics for ${post.id}`, e);
          }
        }
      });
    }
    
    // Refresh materialized view
    await step.run('refresh-hook-perf', () => supabase.rpc('refresh_hook_performance'));
  }
);
```

Rate-limit yourself — don't hammer platforms. Spread refreshes across the 24h window.

---

## M2 shipping checklist

- [ ] Can publish to LinkedIn personal + TQG page directly from app
- [ ] Can publish to X (single + thread) directly
- [ ] Can publish to Facebook page directly
- [ ] Can publish Reel to Instagram directly (if Meta approval granted)
- [ ] Scheduled posts fire at correct time ±30s
- [ ] Failed posts show retry options
- [ ] Rate-limit errors auto-retry with backoff
- [ ] Token-expired errors prompt reconnect
- [ ] Queue dashboard shows accurate state
- [ ] Character counts enforced correctly per platform
- [ ] Media uploaded to Supabase, URLs accessible to platforms
- [ ] Analytics dashboard shows last 30d data
- [ ] Hook performance chart reflects real impression data
- [ ] Metrics refresh runs nightly without errors
- [ ] **You've cancelled your Typefully subscription**

---

## M2 → M3 handoff

By end of M2, the app is a fully functional content tool that posts to 4 platforms with reliable scheduling and analytics. It still lacks video tools and isn't ready for users beyond you.

M3 fixes that.
