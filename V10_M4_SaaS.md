# V10 Milestone 4 — SaaS Plumbing

**Goal:** Product is sellable. Billing works. Teams can be onboarded. Landing page converts.
**Target duration:** 6 weekends
**Ships:** Stripe billing, usage quotas, organizations/teams, landing page, email flows, rate limiting, audit log.

**Prerequisite:** M3 shipped. You've run the product with 3-10 beta users for 2+ weeks. You know what actually matters to them.

**Before starting M4, decide:**
- Final brand name (can keep "TQG Content Studio")
- Domain (e.g. `studio.thequrangroup.com` or new domain)
- Stripe entity (TQG CIC or personal) — get legal advice
- Pricing numbers (if different from placeholders in MASTER)
- Privacy Policy + Terms of Service (lawyer review; CIC-specific considerations)
- Support infrastructure (help@ email, ticketing tool or just shared inbox)

---

## M4 sections & build order

1. **Plan limits & feature flags** — define free/creator/team/org tier matrices
2. **Stripe integration** — products, checkout, webhooks
3. **Usage quota enforcement** — middleware that blocks over-quota actions
4. **Organizations & teams** — multi-user, roles, invites
5. **Admin console expansion** — billing view, org management
6. **Landing page** — marketing site
7. **Email flows** — welcome, billing, usage warnings, weekly digest
8. **Audit log** — team action trail
9. **Rate limiting** — per-endpoint, per-user, per-IP
10. **Production hardening** — Sentry tuning, uptime monitoring, backups, runbooks

---

## Section 1 — Plan limits & feature flags

### 1.1 Plan definitions

`supabase/migrations/20260601000001_v10_plan_limits.sql`:

```sql
CREATE TABLE IF NOT EXISTS plan_limits (
  plan TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  monthly_price_gbp INT NOT NULL,
  posts_per_month INT,  -- NULL = unlimited
  ai_cost_cap_monthly_usd NUMERIC(10, 2),
  platform_connections_max INT,
  video_minutes_per_month INT,
  team_members_max INT,
  features TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO plan_limits (plan, display_name, monthly_price_gbp, posts_per_month, ai_cost_cap_monthly_usd, platform_connections_max, video_minutes_per_month, team_members_max, features) VALUES
  ('free',    'Free',    0,    10,   2.00,   1, 0,    1, ARRAY['editor', 'ai_basic', 'hadith_lib', 'quran_lib']),
  ('creator', 'Creator', 20,   NULL, 15.00,  4, 60,   1, ARRAY['editor', 'ai_full', 'hadith_lib', 'quran_lib', 'video_short', 'video_long', 'analytics', 'multi_account']),
  ('team',    'Team',    50,   NULL, 50.00,  4, 180,  5, ARRAY['editor', 'ai_full', 'hadith_lib', 'quran_lib', 'video_short', 'video_long', 'analytics', 'multi_account', 'team_collaboration', 'audit_log']),
  ('org',     'Org',     150,  NULL, 200.00, 10, 600, 25, ARRAY['editor', 'ai_full', 'hadith_lib', 'quran_lib', 'video_short', 'video_long', 'analytics', 'multi_account', 'team_collaboration', 'audit_log', 'priority_support', 'custom_branding']);
```

Prices in GBP. Update as needed. Video minutes tracks long-form rendering (short clips are cheap, count minimal).

### 1.2 Feature flag helpers

`lib/plans/features.ts`:
```typescript
export async function userHasFeature(userId: string, feature: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  const limits = await getPlanLimits(plan);
  return limits.features.includes(feature);
}

export async function requireFeature(userId: string, feature: string) {
  if (!(await userHasFeature(userId, feature))) {
    throw new FeatureNotAvailableError(feature);
  }
}
```

Use in API routes:
```typescript
export async function POST(req: Request) {
  const { user } = await requireAuth();
  await requireFeature(user.id, 'video_long');
  // ... rest of handler
}
```

### 1.3 UI gating

Components check feature access and render appropriately:
```tsx
function LongVideoButton() {
  const { hasFeature } = useFeatures();
  
  if (!hasFeature('video_long')) {
    return <UpgradePrompt feature="video_long" requiredPlan="creator" />;
  }
  
  return <Button onClick={openLongVideoEditor}>Create long-form video</Button>;
}
```

`UpgradePrompt` shows an inline "Upgrade to Creator to unlock" message with a "See plans" link.

---

## Section 2 — Stripe integration

### 2.1 Stripe setup

1. Create Stripe account (UK entity — TQG CIC or personal, lawyer advice)
2. Create three Products: Creator (£20/mo), Team (£50/mo), Org (£150/mo)
3. Create Annual price variants (save 2 months → £200/yr, £500/yr, £1500/yr)
4. Enable Customer Portal for self-service subscription management
5. Configure webhook endpoint

### 2.2 Schema

`supabase/migrations/20260601000002_v10_subscriptions.sql`:

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  stripe_customer_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,  -- active, past_due, cancelled, incomplete, trialing
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_sub_user ON subscriptions(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_sub_org ON subscriptions(organization_id) WHERE organization_id IS NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_sees_own_sub" ON subscriptions
  FOR SELECT USING (
    user_id = auth.uid() OR 
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );
```

### 2.3 Checkout flow

`/api/billing/checkout`:
```typescript
export async function POST(req: Request) {
  const { user } = await requireAuth();
  const { plan, interval } = await req.json();  // 'creator' | 'team' | 'org', 'monthly' | 'yearly'
  
  const priceId = PRICE_IDS[plan][interval];
  
  // Get or create Stripe customer
  let customerId = await getStripeCustomerId(user.id);
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id }
    });
    customerId = customer.id;
    await saveStripeCustomerId(user.id, customerId);
  }
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/settings/billing?success=true`,
    cancel_url: `${APP_URL}/settings/billing?cancelled=true`,
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: 14  // 14-day trial on Creator + Team
    }
  });
  
  return NextResponse.json({ url: session.url });
}
```

### 2.4 Webhook handler

`/api/billing/webhook`:
```typescript
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature')!;
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    
    case 'customer.subscription.deleted':
      await cancelSubscription(event.data.object as Stripe.Subscription);
      break;
    
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      // Send email: "Your payment failed — update your card"
      break;
    
    case 'invoice.payment_succeeded':
      await sendReceiptEmail(event.data.object as Stripe.Invoice);
      break;
  }
  
  return NextResponse.json({ received: true });
}
```

### 2.5 Sync logic

```typescript
async function syncSubscription(stripeSub: Stripe.Subscription) {
  const userId = (stripeSub.metadata as any).user_id
    ?? await userIdFromCustomer(stripeSub.customer as string);
  
  const plan = planFromPriceId(stripeSub.items.data[0].price.id);
  
  await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: stripeSub.customer as string,
    stripe_subscription_id: stripeSub.id,
    plan,
    status: stripeSub.status,
    current_period_start: new Date(stripeSub.current_period_start * 1000),
    current_period_end: new Date(stripeSub.current_period_end * 1000),
    cancel_at_period_end: stripeSub.cancel_at_period_end,
    trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null
  });
  
  // Update user_profiles to reflect new plan
  await supabase
    .from('user_profiles')
    .update({ plan })
    .eq('id', userId);
}
```

### 2.6 Customer portal

`/api/billing/portal`:
```typescript
export async function POST(req: Request) {
  const { user } = await requireAuth();
  const customerId = await getStripeCustomerId(user.id);
  if (!customerId) return NextResponse.json({ error: 'No subscription' }, { status: 400 });
  
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/settings/billing`
  });
  
  return NextResponse.json({ url: session.url });
}
```

Users click "Manage subscription" → redirected to Stripe portal → can update card, cancel, change plan, view invoices.

### 2.7 Billing UI

`/settings/billing`:

```
┌──────────────────────────────────────────────────────────┐
│ Billing                                                  │
│                                                          │
│ Current plan: Creator (£20/mo)                           │
│ Status: Active                                           │
│ Next billing: May 18, 2026                               │
│                                                          │
│ [Manage subscription ↗]  [View invoices ↗]              │
│                                                          │
│ ── Usage this period ──                                 │
│                                                          │
│ Posts: 47 / unlimited                                    │
│ AI spend: $8.42 / $15.00   ███████████░░░                │
│ Video: 23 min / 60 min     ████████░░░░░░                │
│ Platform connections: 3 / 4                              │
│                                                          │
│ ── Change plan ──                                        │
│ [compare plans table]                                    │
└──────────────────────────────────────────────────────────┘
```

### 2.8 Trial handling

14-day trial on Creator/Team. During trial:
- Full feature access
- Banner in-app: "Trial ends in 9 days"
- Email at day 7, day 12, day 14

If no payment method added by day 14: downgrade to Free (or require card upfront at signup — pick one UX, recommend card upfront for simplicity).

---

## Section 3 — Usage quota enforcement

### 3.1 Quota checks

Middleware pattern — every action that consumes a quota calls a check helper:

```typescript
// lib/quotas/check.ts
export async function checkQuota(userId: string, quotaType: QuotaType): Promise<QuotaCheck> {
  const plan = await getUserPlan(userId);
  const limits = await getPlanLimits(plan);
  const usage = await getCurrentUsage(userId, quotaType);
  
  const limit = limits[quotaType];
  if (limit === null) return { ok: true, unlimited: true };
  
  return {
    ok: usage < limit,
    current: usage,
    limit,
    remaining: Math.max(0, limit - usage),
    percentage: usage / limit
  };
}

export async function consumeQuota(userId: string, quotaType: QuotaType, amount = 1): Promise<void> {
  const check = await checkQuota(userId, quotaType);
  if (!check.ok) throw new QuotaExceededError(quotaType, check);
  
  // Record usage (separate from api_usage which is AI-specific)
  await supabase.from('quota_usage').insert({
    user_id: userId,
    quota_type: quotaType,
    amount,
    period_start: startOfMonth(),
    created_at: new Date()
  });
}
```

### 3.2 Per-quota implementation

- **Posts per month:** counted from `posts.created_at` in current billing period
- **AI cost:** sum from `api_usage.cost_usd` in current period
- **Video minutes:** sum from `render_jobs.duration_minutes` where `job_type='long_edit'`
- **Platform connections:** count of active `oauth_connections`

Each has its own check and consume helper. API routes call them:

```typescript
// /api/posts (POST)
export async function POST(req: Request) {
  const { user } = await requireAuth();
  await consumeQuota(user.id, 'posts_per_month');
  // ... create post
}
```

### 3.3 UI indicators

Sidebar footer shows subtle usage pill (only when >75% used):
```
⚠ AI 82% used this month
```

Click → opens billing page.

Over-quota actions show modal:
```
You've hit your Creator plan limit.
Upgrade to Team for unlimited posts and higher AI budget.
[Upgrade]  [Not now]
```

---

## Section 4 — Organizations & teams

### 4.1 Schema (expand from architecture)

```sql
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT REFERENCES plan_limits(plan) DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('owner', 'admin', 'editor', 'viewer')) NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 Posts become org-scoped

Add `organization_id` to posts table:
```sql
ALTER TABLE posts ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Backfill: create personal org for each existing user
-- (Optional: treat single users as orgs-of-one for consistency)
```

RLS updates:
```sql
CREATE POLICY "org_members_read_posts" ON posts
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
    OR (organization_id IS NULL AND user_id = auth.uid())  -- solo posts
  );

CREATE POLICY "org_editors_modify_posts" ON posts
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
    OR (organization_id IS NULL AND user_id = auth.uid())
  );
```

### 4.3 Active org context

User can belong to multiple orgs. "Current org" stored in:
- JWT claim (preferred — RLS can use `auth.jwt() ->> 'active_org'`)
- Cookie fallback

Org switcher in sidebar:
```
┌──────────────┐
│ ▼ The Quran Group │
│   My personal       │
│ + New org           │
└──────────────┘
```

### 4.4 Invite flow

```
1. Owner/admin clicks "Invite member"
2. Enter email + role
3. Create organization_invites row with token
4. Send email: "Isa invited you to TQG on TQG Content Studio"
5. Email has link with token: /invite/accept?token=...
6. Recipient clicks → signs up (or logs in) → auto-joined
```

### 4.5 Roles

- **Owner:** everything admin can, plus delete org, manage billing
- **Admin:** invite/remove members, manage integrations, change plan
- **Editor:** create, edit, publish posts
- **Viewer:** read-only (posts, analytics)

### 4.6 Permission checks

`lib/permissions.ts`:
```typescript
export async function requireOrgRole(userId: string, orgId: string, roles: Role[]) {
  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();
  
  if (!data || !roles.includes(data.role)) {
    throw new ForbiddenError();
  }
}
```

---

## Section 5 — Admin console expansion

Building on M3 admin UI:

### 5.1 Billing admin

`/admin/billing`:
- All subscriptions (status, plan, MRR contribution)
- Failed payment attempts (list)
- Churn dashboard (cancellations this month)
- MRR chart over time
- Trial conversion rate

### 5.2 Org admin

`/admin/organizations`:
- All orgs with member count, plan, MRR
- Drill-down to org members, posts, AI usage
- Force plan change (for support tickets)
- Suspend org

### 5.3 Support console

`/admin/support`:
- Impersonate user (for debugging — audit logged)
- View user's recent actions (audit log)
- Reset user's password (via Supabase admin)
- Manually approve/reject pending users
- Manually adjust quota (e.g. gift $5 extra AI budget)

Impersonation: admin actions as another user must be heavily audit-logged and requires a reason field.

---

## Section 6 — Landing page

### 6.1 Structure

Landing page at `/` (marketing), app at `/app/*`.

Use Next.js route groups:
```
app/
├── (marketing)/
│   ├── page.tsx       # landing
│   ├── pricing/
│   ├── about/
│   ├── privacy/
│   ├── terms/
│   └── layout.tsx     # marketing layout with top nav
├── (app)/
│   ├── posts/
│   ├── calendar/
│   └── ...
└── (auth)/
    ├── login/
    └── signup/
```

### 6.2 Landing page content

Hero:
> **The content studio for Muslim creators.**
> 
> Write, verify, and post Islamic content across platforms. Without worrying about weak hadith, hallucinated references, or generic AI output.
> 
> [Start free]  [See how it works]

Sections below:
1. **The problem** — "You've spent 30 minutes on sunnah.com verifying a hadith. Now you need to write the caption."
2. **What's different** — 3 columns: Verified knowledge base · Trust-first hadith · Islamic-aware AI
3. **Product demo** — video or animated screenshots
4. **The hadith rule** — long-form explainer of why UNVERIFIED exists
5. **Who uses it** — testimonials (TQG, early users)
6. **Pricing** — table
7. **FAQ** — addresses common objections
8. **Footer** — links, social, legal

### 6.3 Pricing page

Standard SaaS pricing table. Monthly/annual toggle. Clear feature comparison.

Include a "Start free" option prominently. Free tier is the primary funnel.

### 6.4 Technical setup

- Static generation for all marketing pages (`generateStaticParams` + ISR with revalidate: 3600)
- Metadata + OG tags for each page
- Sitemap at `/sitemap.xml`
- Robots.txt
- Structured data (JSON-LD for SaaS product)
- Analytics (PostHog) with consent banner for EU

### 6.5 Blog (optional)

Consider adding `/blog` with MDX posts:
- Tafsir reflections
- Seerah highlights
- Product updates
- Content strategy for Muslim creators

Good for SEO. Low priority for M4 launch — add post-launch.

---

## Section 7 — Email flows

### 7.1 Setup

Resend for transactional email. Templates as React components (`react-email` library).

Emails needed:

**Account:**
- Welcome (after approval)
- Password reset
- Email change verification

**Billing:**
- Trial started
- Trial ending (day 7, day 12, day 14)
- Payment succeeded (receipt)
- Payment failed (action required)
- Subscription cancelled
- Subscription renewed

**Usage:**
- 80% of AI budget used
- 100% of AI budget hit
- 80% of post quota used

**Team:**
- You've been invited to {org}
- New member joined {org}
- Member removed

**Engagement (later):**
- Weekly digest (posts published, top performing)
- Monthly report

### 7.2 Template structure

```tsx
// emails/TrialEnding.tsx
import { Html, Head, Body, Container, Heading, Text, Button } from '@react-email/components';

export function TrialEnding({ name, daysLeft, billingUrl }: Props) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>Your trial ends in {daysLeft} days</Heading>
          <Text>Hi {name},</Text>
          <Text>Your Creator trial ends on X. Add a payment method to keep your access.</Text>
          <Button href={billingUrl}>Add payment method</Button>
        </Container>
      </Body>
    </Html>
  );
}
```

### 7.3 Sending

```typescript
// lib/email/send.ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendTrialEnding(user: User, daysLeft: number) {
  await resend.emails.send({
    from: 'TQG Studio <hello@thequrangroup.com>',
    to: user.email,
    subject: `Your trial ends in ${daysLeft} days`,
    react: <TrialEnding name={user.display_name} daysLeft={daysLeft} billingUrl={`${APP_URL}/settings/billing`} />
  });
}
```

### 7.4 Email triggers

- Auth events → trigger via Supabase auth hooks
- Billing events → trigger via Stripe webhook handler
- Usage events → trigger via nightly cron that checks thresholds
- Team events → trigger via app actions directly

### 7.5 Unsubscribe

Transactional emails (receipts, security) can't be unsubscribed.
Engagement emails (weekly digest, monthly report) must have unsubscribe link.

---

## Section 8 — Audit log

### 8.1 Schema

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_org_time ON audit_log(organization_id, created_at DESC);
CREATE INDEX idx_audit_user_time ON audit_log(user_id, created_at DESC);
```

### 8.2 Actions to log

- Post: created, edited, published, deleted, scheduled, unscheduled
- Member: invited, joined, removed, role changed
- Integration: connected, disconnected, failed
- Billing: plan changed, card updated, cancelled
- Admin: impersonation started/ended, user approved/rejected, quota adjusted

### 8.3 Helper

```typescript
export async function logAudit(params: {
  userId: string;
  orgId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  changes?: Record<string, unknown>;
  req?: Request;
}) {
  await adminClient.from('audit_log').insert({
    user_id: params.userId,
    organization_id: params.orgId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    changes: params.changes,
    ip_address: params.req ? getClientIp(params.req) : null,
    user_agent: params.req?.headers.get('user-agent')
  });
}
```

### 8.4 Visible to team

Team plan feature: `/settings/team/audit` shows org audit log with filtering.

Org owners can export as CSV.

### 8.5 Admin sees all

`/admin/audit` — global audit log across all users/orgs for support debugging.

---

## Section 9 — Rate limiting

### 9.1 Why

Prevent abuse:
- Cost control (AI endpoints)
- Prevent DOS
- Keep platforms happy (don't trigger their rate limits)

### 9.2 Implementation

Use **Upstash Redis** (serverless, free tier) with the `@upstash/ratelimit` library.

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const limiters = {
  ai: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 m') }),
  auth: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m') }),
  publish: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 h') }),
  api: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '1 m') })
};

export async function enforceLimit(limiter: Ratelimit, key: string) {
  const { success, limit, reset, remaining } = await limiter.limit(key);
  if (!success) {
    throw new RateLimitError(limit, reset);
  }
  return { limit, remaining, reset };
}
```

### 9.3 Per-endpoint

```typescript
// /api/ai/hooks
export async function POST(req: Request) {
  const { user } = await requireAuth();
  await enforceLimit(limiters.ai, user.id);
  // ... handler
}
```

### 9.4 Auth endpoint protection

Login/signup protected by IP-based limits:
```typescript
export async function POST(req: Request) {
  const ip = getClientIp(req);
  await enforceLimit(limiters.auth, ip);
  // ... handler
}
```

### 9.5 Response headers

Include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on all rate-limited responses.

---

## Section 10 — Production hardening

### 10.1 Sentry tuning

- Remove noise filters for known benign errors
- Set proper source maps uploading in CI
- Tag errors with plan, organization_id for filtering
- Alert rules: 5xx rate > 1%, AI endpoint errors > 5%, publish failures > 10%

### 10.2 Uptime monitoring

Use something simple like BetterStack, UptimeRobot, or Healthchecks.io.

Endpoints to monitor:
- `/` (landing)
- `/app/posts` (requires auth — use a synthetic monitoring login)
- `/api/health` (public health check)

### 10.3 Health check endpoint

```typescript
// /api/health
export async function GET() {
  const checks = {
    db: false,
    stripe: false,
    inngest: false,
    ai: false
  };
  
  try {
    const { error } = await supabase.from('plan_limits').select('plan').limit(1);
    checks.db = !error;
  } catch {}
  
  // Similar checks for Stripe, Inngest, Anthropic API
  
  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
```

### 10.4 Backups

Supabase automatic backups for paid tier. Additionally:
- Weekly pg_dump to S3 bucket (belt + suspenders)
- Test restore quarterly

### 10.5 Runbooks

Write runbooks for:
- What to do when LinkedIn API starts 500ing
- What to do when X revokes API access
- What to do when Stripe webhook fails
- How to manually publish a stuck post
- How to refund a user
- How to investigate AI cost spike
- How to restore from backup

Store in `runbooks/` folder in repo.

### 10.6 On-call

For V10, you are on-call. Document response times:
- Platform outage: acknowledge in 4h
- Individual user issue: acknowledge in 24h
- Billing issue: 12h

When you eventually hire support, these become SLAs.

---

## M4 shipping checklist

### Billing
- [ ] Stripe products created
- [ ] Checkout flow works end-to-end
- [ ] Webhook handler processes all event types
- [ ] Customer portal accessible
- [ ] Trial flow works (signup → 14-day → conversion)
- [ ] Payment failure → email sent + user re-prompted
- [ ] Subscription cancellation honored at period end
- [ ] Invoices + receipts generated

### Quotas
- [ ] Post count enforced per plan
- [ ] AI budget enforced with graceful fallback
- [ ] Video minutes enforced
- [ ] Platform connection count enforced
- [ ] UI shows usage progress
- [ ] Upgrade prompts accurate

### Orgs
- [ ] User can create new org
- [ ] Invite flow works (email → signup → auto-join)
- [ ] Role permissions enforced at API level
- [ ] Org switcher in UI
- [ ] Posts scoped to org correctly
- [ ] RLS policies tested with multiple orgs

### Marketing
- [ ] Landing page at `/` deployed
- [ ] Pricing page with all tiers
- [ ] About, Privacy, Terms pages
- [ ] SEO basics (meta, OG, sitemap)
- [ ] Signup → welcome email → onboarding works

### Email
- [ ] All transactional emails fire correctly
- [ ] Unsubscribe link on non-transactional
- [ ] No spammy phrasing (check spam score)

### Production
- [ ] Audit log captures expected actions
- [ ] Rate limiting active on AI + auth + publish
- [ ] Sentry properly configured
- [ ] Uptime monitoring active
- [ ] Health check endpoint working
- [ ] Backups configured + test-restored
- [ ] Runbooks written for top 10 scenarios

### Legal
- [ ] Privacy Policy reviewed by lawyer
- [ ] Terms of Service reviewed by lawyer
- [ ] Cookie consent banner (EU/UK users)
- [ ] DPA template available (for Team/Org tier customers)

---

## Post-M4: operating the business

You're now running a SaaS. The job changes:

- **Support:** respond to users, fix their issues
- **Retention:** find out why people cancel, fix the causes
- **Growth:** organic content, SEO, partnerships
- **Iteration:** the product is never done. V11 starts planning itself from user feedback.

V11 candidate features (do NOT build until asked):
- Crowdsourced hadith verification
- Arabic UI
- Native mobile apps
- Public API for developers
- More platforms (TikTok, Threads)
- AI image generation (carefully — aniconism considerations)
- More tafsirs and translations
- Scholar verification credentials
- Advanced team features (comments, approvals, guest reviewers)

**Biggest warning:** resist the urge to build V11 features while V10 is still fragile. A stable, reliable V10 beats a half-built V11 every time.
