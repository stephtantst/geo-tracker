import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { readKeywords, writeKeywords, type Market } from "@/lib/llm-ranking";
import crypto from "crypto";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const data = await readKeywords();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { query, market, category } = await req.json();
  if (!query?.trim()) return NextResponse.json({ error: "Query is required" }, { status: 400 });

  const data = await readKeywords();
  const duplicate = data.keywords.some((k) => k.query.toLowerCase() === query.trim().toLowerCase());
  if (duplicate) return NextResponse.json({ error: "Keyword already exists" }, { status: 409 });

  const keyword = {
    id: `kw_${crypto.randomUUID().slice(0, 8)}`,
    query: query.trim(),
    market: (market ?? "SG") as Market,
    category: category ?? "Core Payments",
    createdAt: new Date().toISOString(),
    enabled: true,
  };

  data.keywords.push(keyword);
  await writeKeywords(data);
  return NextResponse.json({ keyword });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  const data = await readKeywords();
  data.keywords = data.keywords.filter((k) => k.id !== id);
  await writeKeywords(data);
  return NextResponse.json({ ok: true });
}
