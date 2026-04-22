import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { readResults } from "@/lib/llm-ranking";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const keywordId = searchParams.get("keywordId");
  const limit = parseInt(searchParams.get("limit") ?? "200");

  const data = await readResults();
  let results = [...data.results].sort(
    (a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime()
  );

  if (keywordId) results = results.filter((r) => r.keywordId === keywordId);
  results = results.slice(0, limit);

  return NextResponse.json({ results });
}
