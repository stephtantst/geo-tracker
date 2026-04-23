import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { readKeywords, readResults, writeResults, runRankingTest, getActiveLLMs } from "@/lib/llm-ranking";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ activeLLMs: getActiveLLMs() });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const activeLLMs = getActiveLLMs();
  if (activeLLMs.length === 0) {
    return NextResponse.json(
      { error: "No LLM API keys configured. Add at least one key to .env.local." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { keywordIds, runsPerQuery = 1 } = body as { keywordIds?: string[]; runsPerQuery?: number };
  const runs = Math.min(Math.max(1, runsPerQuery), 5);

  const kwData = await readKeywords();
  const keywords = kwData.keywords.filter(
    (k) => k.enabled && (!keywordIds?.length || keywordIds.includes(k.id))
  );

  if (keywords.length === 0) {
    return NextResponse.json({ error: "No enabled keywords found" }, { status: 400 });
  }

  const newResults = [];
  const errors: string[] = [];

  for (const keyword of keywords) {
    for (let i = 0; i < runs; i++) {
      try {
        const results = await runRankingTest(keyword);
        newResults.push(...results);
      } catch (e) {
        errors.push(`${keyword.query} (run ${i + 1}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Append to results file
  try {
    const existing = await readResults();
    existing.results = [...newResults, ...existing.results];
    await writeResults(existing);
  } catch (e) {
    errors.push(`Failed to save results: ${e instanceof Error ? e.message : String(e)}`);
  }

  return NextResponse.json({ results: newResults, errors });
}
