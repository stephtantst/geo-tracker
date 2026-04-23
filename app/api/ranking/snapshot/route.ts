import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { COMPETITORS_BY_MARKET } from "@/lib/ranking-constants";

function getSupabase() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// POST: compute mention rates from today's results and upsert a snapshot
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const date: string = body.date ?? new Date().toISOString().slice(0, 10);

  const sb = getSupabase();
  const { data: results, error } = await sb
    .from("results")
    .select("market, llm, hitpay_mentioned, competitors")
    .gte("run_at", `${date}T00:00:00Z`)
    .lte("run_at", `${date}T23:59:59Z`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!results?.length) return NextResponse.json({ saved: 0 });

  const rows: Record<string, unknown>[] = [];

  for (const market of ["SG", "MY", "PH"] as const) {
    const { online, inPerson } = COMPETITORS_BY_MARKET[market];
    const marketResults = results.filter((r: { market: string }) => r.market === market);
    if (!marketResults.length) continue;

    for (const [section, brands] of [["online", online], ["inPerson", inPerson]] as const) {
      for (const brand of brands) {
        const llms = [...new Set(marketResults.map((r: { llm: string }) => r.llm))] as string[];
        for (const llm of llms) {
          const llmResults = marketResults.filter((r: { llm: string }) => r.llm === llm);
          if (!llmResults.length) continue;
          const mentioned = llmResults.filter((r: { hitpay_mentioned: boolean; competitors: string[] }) =>
            brand === "HitPay" ? r.hitpay_mentioned : (r.competitors ?? []).includes(brand)
          ).length;
          rows.push({
            snapshot_date: date,
            market,
            section,
            brand,
            llm,
            mention_rate: Math.round((mentioned / llmResults.length) * 100),
            mentioned_count: mentioned,
            total_queries: llmResults.length,
          });
        }
      }
    }
  }

  const { error: upsertError } = await sb
    .from("competitor_snapshots")
    .upsert(rows, { onConflict: "snapshot_date,market,section,brand,llm" });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  return NextResponse.json({ saved: rows.length });
}

// GET: return snapshots for trend display
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market");
  const section = searchParams.get("section");

  const sb = getSupabase();
  let query = sb
    .from("competitor_snapshots")
    .select("*")
    .order("snapshot_date", { ascending: true });

  if (market) query = query.eq("market", market);
  if (section) query = query.eq("section", section);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data ?? [] });
}
