import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { TRACKED_COMPETITORS } from "./ranking-constants";
export { TRACKED_COMPETITORS, BRAND_URLS } from "./ranking-constants";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LLMProvider = "claude" | "chatgpt" | "gemini" | "perplexity";
export type Market = "SG" | "MY" | "PH" | "Global";
export type Sentiment = "positive" | "neutral" | "negative" | "not_mentioned";

export interface Keyword {
  id: string;
  query: string;
  market: Market;
  category: string;
  createdAt: string;
  enabled: boolean;
}

export interface RankingResult {
  id: string;
  keywordId: string;
  query: string;
  market: Market;
  category: string;
  runAt: string;
  llm: LLMProvider;
  llmResponse: string;
  hitpayMentioned: boolean;
  position: number | null;
  sentiment: Sentiment;
  competitors: string[];
  competitorRankings: Record<string, number | null>;
  excerpt: string | null;
  citations: { url: string; context: string }[];
  error: string | null;
}

export interface KeywordsFile { keywords: Keyword[]; }
export interface ResultsFile  { results: RankingResult[]; }

// ─── Constants ────────────────────────────────────────────────────────────────

const DATA_DIR      = path.join(process.cwd(), "data");
const KEYWORDS_FILE = path.join(DATA_DIR, "keywords.json");
const RESULTS_FILE  = path.join(DATA_DIR, "results.json");

// On Vercel the filesystem is read-only; use Supabase when env vars are present.
const USE_SUPABASE = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const POSITIVE_WORDS = ["affordable", "recommended", "popular", "trusted", "best", "top", "excellent", "great", "leading", "preferred", "ideal", "perfect", "strong", "reliable"];
const NEGATIVE_WORDS = ["limited", "avoid", "poor", "bad", "expensive", "unreliable", "problematic", "worse", "inferior", "lacking"];

// ─── Storage (Supabase in production, filesystem locally) ─────────────────────

function getSupabase() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function readKeywords(): Promise<KeywordsFile> {
  if (USE_SUPABASE) {
    const { data, error } = await getSupabase().from("keywords").select("*").order("created_at");
    if (error) throw new Error(error.message);
    const keywords: Keyword[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      query: r.query as string,
      market: r.market as Market,
      category: r.category as string,
      createdAt: r.created_at as string,
      enabled: r.enabled as boolean,
    }));
    // First deploy: seed from bundled file if DB is empty
    if (keywords.length === 0) {
      try {
        const raw = await fs.readFile(KEYWORDS_FILE, "utf-8");
        const file: KeywordsFile = JSON.parse(raw);
        await writeKeywords(file);
        return file;
      } catch { /* ignore */ }
    }
    return { keywords };
  }
  try {
    const raw = await fs.readFile(KEYWORDS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { keywords: [] };
  }
}

export async function writeKeywords(data: KeywordsFile): Promise<void> {
  if (USE_SUPABASE) {
    const sb = getSupabase();
    const rows = data.keywords.map((k) => ({
      id: k.id, query: k.query, market: k.market,
      category: k.category, created_at: k.createdAt, enabled: k.enabled,
    }));
    const { data: existing } = await sb.from("keywords").select("id");
    const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
    const newIds = new Set(rows.map((r) => r.id));
    const toDelete = [...existingIds].filter((id) => !newIds.has(id as string));
    if (toDelete.length > 0) await sb.from("keywords").delete().in("id", toDelete);
    if (rows.length > 0) {
      const { error } = await sb.from("keywords").upsert(rows);
      if (error) throw new Error(error.message);
    }
    return;
  }
  const tmp = KEYWORDS_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, KEYWORDS_FILE);
}

export async function readResults(): Promise<ResultsFile> {
  if (USE_SUPABASE) {
    const { data, error } = await getSupabase()
      .from("results").select("*").order("run_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const results: RankingResult[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      keywordId: r.keyword_id as string,
      query: r.query as string,
      market: r.market as Market,
      category: r.category as string,
      runAt: r.run_at as string,
      llm: r.llm as LLMProvider,
      llmResponse: (r.llm_response as string) ?? "",
      hitpayMentioned: r.hitpay_mentioned as boolean,
      position: r.position as number | null,
      sentiment: r.sentiment as Sentiment,
      competitors: (r.competitors as string[]) ?? [],
      competitorRankings: (r.competitor_rankings as Record<string, number | null>) ?? {},
      excerpt: r.excerpt as string | null,
      citations: (r.citations as { url: string; context: string }[]) ?? [],
      error: r.error as string | null,
    }));
    return { results };
  }
  try {
    const raw = await fs.readFile(RESULTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { results: [] };
  }
}

export async function writeResults(data: ResultsFile): Promise<void> {
  if (USE_SUPABASE) {
    const rows = data.results.map((r) => ({
      id: r.id, keyword_id: r.keywordId, query: r.query,
      market: r.market, category: r.category, run_at: r.runAt,
      llm: r.llm, llm_response: r.llmResponse,
      hitpay_mentioned: r.hitpayMentioned, position: r.position,
      sentiment: r.sentiment, competitors: r.competitors,
      competitor_rankings: r.competitorRankings, excerpt: r.excerpt,
      citations: r.citations, error: r.error,
    }));
    const { error } = await getSupabase().from("results").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return;
  }
  const tmp = RESULTS_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, RESULTS_FILE);
}

// ─── Active LLM detection ────────────────────────────────────────────────────

export function getActiveLLMs(): LLMProvider[] {
  const active: LLMProvider[] = [];
  if (process.env.ANTHROPIC_API_KEY)   active.push("claude");
  if (process.env.OPENAI_API_KEY)      active.push("chatgpt");
  if (process.env.GEMINI_API_KEY)      active.push("gemini");
  if (process.env.PERPLEXITY_API_KEY)  active.push("perplexity");
  return active;
}

// ─── LLM callers ─────────────────────────────────────────────────────────────

interface LLMResponse { text: string; rawCitations: string[]; }

// ─── URL / citation extraction ────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s\)\]\>"',]+/g;

function extractCitations(
  response: string,
  perplexityCitations: string[] = []
): { url: string; context: string }[] {
  const sentences = response.split(/(?<=[.!?])\s+/);
  const results: { url: string; context: string }[] = [];
  const seen = new Set<string>();

  if (perplexityCitations.length) {
    // Map [1] [2] inline markers to the URLs Perplexity returned
    for (const sentence of sentences) {
      const refs = [...sentence.matchAll(/\[(\d+)\]/g)];
      for (const ref of refs) {
        const idx = parseInt(ref[1]) - 1;
        const url = perplexityCitations[idx];
        if (url && !seen.has(url)) {
          seen.add(url);
          results.push({ url, context: sentence.replace(/\[\d+\]/g, "").trim() });
        }
      }
    }
    // Include any Perplexity citations without inline markers
    for (const url of perplexityCitations) {
      if (!seen.has(url)) { seen.add(url); results.push({ url, context: "" }); }
    }
  } else {
    // Extract raw URLs from response text
    for (const sentence of sentences) {
      const urls = [...(sentence.match(URL_RE) ?? [])].map((u) => u.replace(/[.,;:)]+$/, ""));
      for (const url of urls) {
        if (!seen.has(url)) {
          seen.add(url);
          results.push({ url, context: sentence.replace(URL_RE, "").trim() });
        }
      }
    }
  }

  return results;
}

const MARKET_LABELS: Record<Market, string> = {
  SG: "Singapore",
  MY: "Malaysia",
  PH: "Philippines",
  Global: "global markets",
};

function buildSystemPrompt(market: Market): string {
  const location = MARKET_LABELS[market];
  return `You are a helpful business advisor responding to a customer based in ${location}. Answer the following question as you naturally would — give a real, practical recommendation relevant to ${location}. Be specific: name actual products or services with brief reasons for each. For each product or service you mention, include its official website URL. Do not hedge excessively. Answer in 3-6 sentences.`;
}

async function callClaude(query: string, market: Market): Promise<LLMResponse> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    temperature: 1,
    system: buildSystemPrompt(market),
    messages: [{ role: "user", content: query }],
  });
  const block = msg.content[0];
  return { text: block.type === "text" ? block.text : "", rawCitations: [] };
}

async function callChatGPT(query: string, market: Market): Promise<LLMResponse> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 600,
    temperature: 1,
    messages: [
      { role: "system", content: buildSystemPrompt(market) },
      { role: "user",   content: query },
    ],
  });
  return { text: res.choices[0]?.message?.content ?? "", rawCitations: [] };
}

async function callGemini(query: string, market: Market): Promise<LLMResponse> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    systemInstruction: buildSystemPrompt(market),
  });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: query }] }],
    generationConfig: { maxOutputTokens: 600, temperature: 1 },
  });
  return { text: result.response.text(), rawCitations: [] };
}

async function callPerplexity(query: string, market: Market): Promise<LLMResponse> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: "https://api.perplexity.ai",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await client.chat.completions.create({
    model: "sonar",
    max_tokens: 600,
    messages: [
      { role: "system", content: buildSystemPrompt(market) },
      { role: "user",   content: query },
    ],
  });
  return {
    text: res.choices[0]?.message?.content ?? "",
    rawCitations: Array.isArray(res.citations) ? res.citations : [],
  };
}

async function callLLM(provider: LLMProvider, query: string, market: Market): Promise<LLMResponse> {
  switch (provider) {
    case "claude":      return callClaude(query, market);
    case "chatgpt":     return callChatGPT(query, market);
    case "gemini":      return callGemini(query, market);
    case "perplexity":  return callPerplexity(query, market);
  }
}

// ─── Response parser (rule-based, no LLM needed) ─────────────────────────────

function parseResponse(response: string, keyword: Keyword): Omit<RankingResult, "id" | "keywordId" | "runAt" | "llm" | "llmResponse" | "citations" | "error"> {
  const lower = response.toLowerCase();
  const hitpayMentioned = lower.includes("hitpay");

  // Build ordered list of all brand mentions by first appearance index
  const allBrands = ["HitPay", ...TRACKED_COMPETITORS];
  const brandPositions: { brand: string; index: number }[] = [];

  for (const brand of allBrands) {
    const idx = lower.indexOf(brand.toLowerCase());
    if (idx !== -1) brandPositions.push({ brand, index: idx });
  }
  brandPositions.sort((a, b) => a.index - b.index);

  // HitPay position among all mentioned brands
  const hitpayRank = brandPositions.findIndex((b) => b.brand === "HitPay");
  const position = hitpayRank === -1 ? null : hitpayRank + 1;

  // Competitor list (excluding HitPay)
  const competitors = brandPositions
    .filter((b) => b.brand !== "HitPay")
    .map((b) => b.brand);

  // Competitor rankings map
  const competitorRankings: Record<string, number | null> = {};
  for (const comp of TRACKED_COMPETITORS) {
    const rank = brandPositions.findIndex((b) => b.brand === comp);
    competitorRankings[comp] = rank === -1 ? null : rank + 1;
  }

  // Sentiment: look for sentiment words near "hitpay"
  let sentiment: Sentiment = "not_mentioned";
  if (hitpayMentioned) {
    const hitpayIdx = lower.indexOf("hitpay");
    const window = lower.slice(Math.max(0, hitpayIdx - 150), hitpayIdx + 150);
    const hasPositive = POSITIVE_WORDS.some((w) => window.includes(w));
    const hasNegative = NEGATIVE_WORDS.some((w) => window.includes(w));
    sentiment = hasNegative ? "negative" : hasPositive ? "positive" : "neutral";
  }

  // Excerpt: sentence(s) containing hitpay
  let excerpt: string | null = null;
  if (hitpayMentioned) {
    const sentences = response.split(/(?<=[.!?])\s+/);
    const relevant = sentences.filter((s) => s.toLowerCase().includes("hitpay"));
    excerpt = relevant.slice(0, 2).join(" ").trim() || null;
  }

  return {
    query: keyword.query,
    market: keyword.market,
    category: keyword.category,
    hitpayMentioned,
    position,
    sentiment,
    competitors,
    competitorRankings,
    excerpt,
  };
}

// ─── Main export: run a keyword across all active LLMs ───────────────────────

export async function runRankingTest(keyword: Keyword): Promise<RankingResult[]> {
  const activeLLMs = getActiveLLMs();
  const results: RankingResult[] = [];

  for (const llm of activeLLMs) {
    const runAt = new Date().toISOString();
    let llmResponse = "";
    let citations: { url: string; context: string }[] = [];
    let error: string | null = null;

    try {
      const res = await callLLM(llm, keyword.query, keyword.market);
      llmResponse = res.text;
      citations = extractCitations(llmResponse, res.rawCitations);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const parsed = llmResponse
      ? parseResponse(llmResponse, keyword)
      : {
          query: keyword.query, market: keyword.market, category: keyword.category,
          hitpayMentioned: false, position: null, sentiment: "not_mentioned" as Sentiment,
          competitors: [], competitorRankings: {}, excerpt: null,
        };


    results.push({
      id: `res_${crypto.randomUUID()}`,
      keywordId: keyword.id,
      runAt,
      llm,
      llmResponse,
      citations,
      error,
      ...parsed,
    });
  }

  return results;
}
