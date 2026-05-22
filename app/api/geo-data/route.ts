import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { OAuth2Client } from "google-auth-library";
import { authOptions } from "@/lib/auth";

const EXCLUDED_AI_SOURCES = [
  "babybeyou",
  "glybygirlslikeyou.com",
  "flowerandyou.com",
  "euniqyou.com",
];

const AI_SOURCES = [
  "perplexity.ai",
  "chatgpt.com",
  "chat.openai.com",
  "gemini.google.com",
  "copilot.microsoft.com",
  "you.com",
  "phind.com",
  "claude.ai",
  "anthropic.com",
  "bard.google.com",
  "meta.ai",
  "grok.x.ai",
  "x.ai",
  "bing.com",
  "perplexity",
  "chatgpt",
];

const aiSourceFilter = {
  orGroup: {
    expressions: AI_SOURCES.map((source) => ({
      filter: {
        fieldName: "sessionSource",
        stringFilter: {
          matchType: "CONTAINS" as const,
          value: source,
          caseSensitive: false,
        },
      },
    })),
  },
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate") ?? "90daysAgo";
  const endDate = searchParams.get("endDate") ?? "today";
  const granularity = searchParams.get("granularity") ?? "day"; // day | week | month
  const dateRange = [{ startDate, endDate }];

  const dateDimension =
    granularity === "month" ? "yearMonth" :
    granularity === "week"  ? "yearWeek"  : "date";

  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: session.accessToken });

  const analyticsClient = new BetaAnalyticsDataClient({
    authClient: oauth2Client,
  });

  const propertyId = process.env.GA4_PROPERTY_ID!;

  try {
    const [sessionsBySource, blogPages, organicSearch, organicPages, keyPagesByDate] = await Promise.all([
      analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: dateRange,
        dimensions: [{ name: "sessionSource" }, { name: dateDimension }],
        metrics: [{ name: "sessions" }, { name: "newUsers" }],
        dimensionFilter: aiSourceFilter,
        orderBys: [{ dimension: { dimensionName: dateDimension } }],
        limit: 2000,
      }),

      analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: dateRange,
        dimensions: [{ name: "landingPage" }, { name: "sessionSource" }],
        metrics: [
          { name: "sessions" },
          { name: "newUsers" },
          { name: "averageSessionDuration" },
          { name: "engagementRate" },
          { name: "bounceRate" },
          { name: "screenPageViewsPerSession" },
        ],
        dimensionFilter: aiSourceFilter,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 100,
      }),

      analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: dateRange,
        dimensions: [{ name: "sessionSource" }, { name: dateDimension }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionMedium",
            stringFilter: { value: "organic" },
          },
        },
        orderBys: [{ dimension: { dimensionName: dateDimension } }],
        limit: 2000,
      }),

      analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: dateRange,
        dimensions: [{ name: "landingPage" }, { name: "sessionSource" }],
        metrics: [
          { name: "sessions" },
          { name: "newUsers" },
          { name: "averageSessionDuration" },
          { name: "engagementRate" },
          { name: "bounceRate" },
          { name: "screenPageViewsPerSession" },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "sessionMedium",
            stringFilter: { value: "organic" },
          },
        },
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 100,
      }),

      // Key landing pages time-series: /, /sg/, /my/, /ph/ — all traffic sources.
      // hostname filter scopes to hitpayapp.com only (prevents "/" from aggregating
      // root traffic across all domains tracked by the GA4 property).
      // BEGINS_WITH is used for market pages because GA4 may store paths without a
      // trailing slash or with query strings — FULL_REGEXP was too strict and returned
      // no rows. Subpage sessions under /sg/ are negligible vs root market traffic.
      analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: dateRange,
        dimensions: [{ name: "landingPage" }, { name: dateDimension }],
        metrics: [
          { name: "sessions" },
          { name: "newUsers" },
          { name: "averageSessionDuration" },
          { name: "engagementRate" },
          { name: "bounceRate" },
          { name: "screenPageViewsPerSession" },
        ],
        dimensionFilter: {
          andGroup: {
            expressions: [
              {
                filter: {
                  fieldName: "hostname",
                  stringFilter: { matchType: "CONTAINS" as const, value: "hitpayapp.com" },
                },
              },
              {
                orGroup: {
                  expressions: [
                    {
                      filter: {
                        fieldName: "landingPage",
                        stringFilter: { matchType: "EXACT" as const, value: "/" },
                      },
                    },
                    ...(["/sg/", "/my/"]).map((page) => ({
                      filter: {
                        fieldName: "landingPage",
                        stringFilter: { matchType: "BEGINS_WITH" as const, value: page },
                      },
                    })),
                  ],
                },
              },
            ],
          },
        },
        orderBys: [{ dimension: { dimensionName: dateDimension } }],
        limit: 5000,
      }),
    ]);

    const excludeAiSource = (rows: Record<string, string>[]) =>
      rows.filter((r) => !EXCLUDED_AI_SOURCES.some((x) => r.source?.toLowerCase().includes(x.toLowerCase())));

    return NextResponse.json({
      granularity,
      aiReferrals: excludeAiSource(formatRows(sessionsBySource[0]?.rows ?? [], ["source", "date"], ["sessions", "newUsers"])),
      blogPages: excludeAiSource(formatRows(blogPages[0]?.rows ?? [], ["landingPage", "source"], ["sessions", "newUsers", "avgDuration", "engagementRate", "bounceRate", "pagesPerSession"])),
      organicByDate: formatRows(organicSearch[0]?.rows ?? [], ["source", "date"], ["sessions"]),
      organicPages: formatRows(organicPages[0]?.rows ?? [], ["landingPage", "source"], ["sessions", "newUsers", "avgDuration", "engagementRate", "bounceRate", "pagesPerSession"]),
      landingPageTrends: formatRows(keyPagesByDate[0]?.rows ?? [], ["landingPage", "date"], ["sessions", "newUsers", "avgDuration", "engagementRate", "bounceRate", "pagesPerSession"]),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatRows(
  rows: unknown[],
  dimNames: string[],
  metNames: string[]
): Record<string, string>[] {
  return (
    rows as Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>
  ).map((row) => {
    const result: Record<string, string> = {};
    dimNames.forEach((name, i) => {
      result[name] = row.dimensionValues?.[i]?.value ?? "";
    });
    metNames.forEach((name, i) => {
      result[name] = row.metricValues?.[i]?.value ?? "";
    });
    return result;
  });
}
