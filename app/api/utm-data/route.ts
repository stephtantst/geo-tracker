import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { OAuth2Client } from "google-auth-library";
import { authOptions } from "@/lib/auth";

const campaignSetFilter = {
  notExpression: {
    filter: {
      fieldName: "sessionCampaignName",
      stringFilter: {
        matchType: "EXACT" as const,
        value: "(not set)",
      },
    },
  },
};

function buildDimensionFilter(medium: string) {
  if (!medium) return campaignSetFilter;
  return {
    andGroup: {
      expressions: [
        campaignSetFilter,
        {
          filter: {
            fieldName: "sessionMedium",
            stringFilter: {
              matchType: "EXACT" as const,
              value: medium,
            },
          },
        },
      ],
    },
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate") ?? "90daysAgo";
  const endDate = searchParams.get("endDate") ?? "today";
  const granularity = searchParams.get("granularity") ?? "day";
  const medium = searchParams.get("medium") ?? "";
  const dateRange = [{ startDate, endDate }];
  const dimensionFilter = buildDimensionFilter(medium);

  const dateDimension =
    granularity === "month" ? "yearMonth" :
    granularity === "week"  ? "yearWeek"  : "date";

  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: session.accessToken });

  const analyticsClient = new BetaAnalyticsDataClient({ authClient: oauth2Client });
  const propertyId = process.env.GA4_PROPERTY_ID!;

  try {
    const [campaignSummary, campaignTrends] = await Promise.all([
      analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: dateRange,
        dimensions: [
          { name: "sessionCampaignName" },
          { name: "sessionSource" },
          { name: "sessionMedium" },
          { name: "sessionManualAdContent" },
        ],
        metrics: [
          { name: "sessions" },
          { name: "newUsers" },
          { name: "averageSessionDuration" },
          { name: "engagementRate" },
          { name: "bounceRate" },
        ],
        dimensionFilter,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 500,
      }),

      analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: dateRange,
        dimensions: [
          { name: "sessionCampaignName" },
          { name: dateDimension },
        ],
        metrics: [{ name: "sessions" }],
        dimensionFilter,
        orderBys: [{ dimension: { dimensionName: dateDimension } }],
        limit: 5000,
      }),
    ]);

    return NextResponse.json({
      granularity,
      campaigns: formatRows(
        campaignSummary[0]?.rows ?? [],
        ["campaign", "source", "medium", "content"],
        ["sessions", "newUsers", "avgDuration", "engagementRate", "bounceRate"]
      ),
      trends: formatRows(
        campaignTrends[0]?.rows ?? [],
        ["campaign", "date"],
        ["sessions"]
      ),
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
