# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Next.js version warning

This project runs **Next.js 16.2.4** with **React 19**. Both have breaking changes from earlier versions that may conflict with your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code, and heed deprecation notices.

## Commands

```bash
npm run dev      # start dev server on http://localhost:3000
npm run build    # production build (runs type-check implicitly)
npm run lint     # ESLint
npx tsc --noEmit # type-check only, no build output
```

There are no tests.

## Architecture overview

This is a single-repo Next.js App Router app with two distinct features on two routes.

### Route `/` — GA4 Analytics dashboard (`app/page.tsx`)

A client component that fetches from `/api/geo-data` and renders Recharts line charts and sortable tables. All GA4 queries happen server-side in the API route; the client just passes date range and granularity params.

**Data flow:** user picks date range → `fetchData()` → `GET /api/geo-data?startDate=&endDate=&granularity=` → `BetaAnalyticsDataClient` runs 5 GA4 reports in parallel → JSON response → charts + tables.

The five GA4 reports returned are:
- `aiReferrals` — sessions by AI referrer source over time
- `blogPages` — landing page metrics for AI traffic (no time axis)
- `organicByDate` — sessions from organic search over time
- `organicPages` — landing page metrics for organic traffic (no time axis)
- `landingPageTrends` — time-series metrics for `/`, `/sg/`, `/my/`, `/ph/` across all traffic

Rate metrics (engagementRate, bounceRate, avgDuration, pagesPerSession) require sessions-weighted averaging when aggregating rows with the same normalised page path — see `buildPageMetricData()`.

### Route `/ranking` — LLM Ranking tracker (`app/ranking/page.tsx`)

Tracks how often HitPay appears in LLM responses for a set of test queries. Three tabs: Test Results, Competitor Comparison, Query Trends.

**Data flow:** keywords stored in DB → "Run Tests" → `POST /api/ranking/run` → server calls Claude/ChatGPT/Gemini/Perplexity sequentially → parses mentions/position/sentiment → saves results → daily snapshots aggregated to `competitor_snapshots` table.

### Storage strategy (`lib/llm-ranking.ts`)

Dual-mode: **local JSON files** (`data/keywords.json`, `data/results.json`) in development; **Supabase PostgreSQL** in production. Controlled by `USE_SUPABASE = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)`. All DB access goes through functions in `lib/llm-ranking.ts` — never import Supabase client directly in route handlers.

### Authentication (`lib/auth.ts`)

NextAuth v4 with Google OAuth. The access token is stored in the JWT and exposed as `session.accessToken`. All API routes call `getServerSession(authOptions)` and use `session.accessToken` directly to instantiate `BetaAnalyticsDataClient` — there is no server-side service account; the GA4 calls are scoped to the signed-in user's Google account.

Token refresh is handled automatically in the `jwt` callback when `accessTokenExpiresAt` is exceeded.

### Key constants (`lib/ranking-constants.ts`)

`TRACKED_COMPETITORS` — ~70 competitor brands across SG/MY/PH markets used for mention detection in LLM responses. `BRAND_URLS` — canonical URLs per brand for citation linking. Modify these to add/remove tracked competitors.

## Required environment variables

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET
NEXTAUTH_URL
GA4_PROPERTY_ID            # e.g. 316810679
SUPABASE_URL               # production only
SUPABASE_SERVICE_ROLE_KEY  # production only
ANTHROPIC_API_KEY
OPENAI_API_KEY
GOOGLE_AI_API_KEY
PERPLEXITY_API_KEY
```
