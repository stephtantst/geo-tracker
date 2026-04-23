"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import type { Keyword, RankingResult, LLMProvider, Market, Sentiment } from "@/lib/llm-ranking";
import { BRAND_URLS, COMPETITORS_BY_MARKET, MARKET_FULL_NAMES } from "@/lib/ranking-constants";

const MARKETS: Market[] = ["SG", "MY", "PH", "Global"];
const MARKET_FLAGS: Record<string, string> = { SG: "🇸🇬", MY: "🇲🇾", PH: "🇵🇭", Global: "🌐" };
const CATEGORIES = ["Core Payments", "APIs & Infrastructure", "Local Payment Methods", "Business Use Cases", "Tools & Software", "Commerce & Platforms", "In-Store Payments"];
const LLM_LABELS: Record<LLMProvider, string> = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity" };
const LLM_COLORS: Record<LLMProvider, string> = { claude: "#f97316", chatgpt: "#10b981", gemini: "#6366f1", perplexity: "#3b82f6" };
const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-green-100 text-green-700",
  neutral: "bg-gray-100 text-gray-600",
  negative: "bg-red-100 text-red-600",
  not_mentioned: "bg-gray-100 text-gray-400",
};
const KEY_COMPETITORS = ["HitPay", "Stripe", "Adyen", "Maya", "GCash", "PayMongo", "Qashier", "2C2P"];

export default function RankingPage() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<"results" | "comparison" | "trends">("results");
  const [trendQuery, setTrendQuery] = useState("");
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [results, setResults] = useState<RankingResult[]>([]);
  const [activeLLMs, setActiveLLMs] = useState<LLMProvider[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; secsLeft: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newQuery, setNewQuery] = useState("");
  const [newMarket, setNewMarket] = useState<Market>("SG");
  const [newCategory, setNewCategory] = useState("Core Payments");
  const [filterMarket, setFilterMarket] = useState("All");
  const [filterLLM, setFilterLLM] = useState("All");
  const [filterMentioned, setFilterMentioned] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const [runsPerQuery, setRunsPerQuery] = useState(3);
  const [sortBy, setSortBy] = useState<"mentionRate" | "avgPosition" | "topSentiment" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!session) return;
    Promise.allSettled([
      fetch("/api/ranking/keywords").then((r) => r.json()),
      fetch("/api/ranking/results").then((r) => r.json()),
      fetch("/api/ranking/run").then((r) => r.json()),
    ]).then(([kw, res, run]) => {
      if (kw.status === "fulfilled") setKeywords(kw.value.keywords ?? []);
      if (res.status === "fulfilled") setResults(res.value.results ?? []);
      else setError("Failed to load results — check Supabase connection");
      if (run.status === "fulfilled") setActiveLLMs(run.value.activeLLMs ?? []);
    });
  }, [session]);

  async function addKeyword() {
    if (!newQuery.trim()) return;
    const res = await fetch("/api/ranking/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: newQuery.trim(), market: newMarket, category: newCategory }),
    });
    const data = await res.json();
    if (data.keyword) {
      setKeywords((prev) => [...prev, data.keyword]);
      setNewQuery("");
    } else {
      setError(data.error ?? "Failed to add keyword");
    }
  }

  async function deleteKeyword(id: string) {
    await fetch("/api/ranking/keywords", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setKeywords((prev) => prev.filter((k) => k.id !== id));
  }

  async function runTests(limit?: number) {
    if (activeLLMs.length === 0) {
      setError("No LLM API keys configured. Add ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or PERPLEXITY_API_KEY to .env.local");
      return;
    }
    const enabled = keywords.filter((k) => k.enabled !== false);
    if (!enabled.length) { setError("No enabled keywords found"); return; }

    setRunning(true);
    setError(null);
    const allErrors: string[] = [];
    const allNew: RankingResult[] = [];
    const total = limit ? Math.min(limit, enabled.length) : enabled.length;
    const startMs = Date.now();

    setProgress({ done: 0, total, secsLeft: null });

    let consecutiveErrors = 0;

    for (let i = 0; i < total; i++) {
      const kw = enabled[i];
      try {
        const res = await fetch("/api/ranking/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keywordIds: [kw.id], runsPerQuery }),
        });
        let data: { results?: RankingResult[]; errors?: string[]; error?: string };
        try {
          data = await res.json();
        } catch {
          throw new Error(`Server returned invalid response (HTTP ${res.status}) — check your API keys and server logs`);
        }
        if (!res.ok) throw new Error(data.error ?? "Run failed");
        allNew.push(...(data.results ?? []));
        if (data.errors?.length) allErrors.push(...data.errors);
        consecutiveErrors = 0;
      } catch (e) {
        allErrors.push(`${kw.query}: ${e instanceof Error ? e.message : String(e)}`);
        setError(allErrors.join("\n"));
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          allErrors.push(`Run aborted after 3 consecutive failures — fix the issue above and retry.`);
          setError(allErrors.join("\n"));
          break;
        }
      }

      const done = i + 1;
      const elapsed = (Date.now() - startMs) / 1000;
      const avgSecs = elapsed / done;
      const secsLeft = done < total ? Math.round(avgSecs * (total - done)) : 0;
      setProgress({ done, total, secsLeft });
    }

    setResults((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      return [...allNew.filter((r) => !existingIds.has(r.id)), ...prev];
    });
    if (allErrors.length) setError(allErrors.join("\n"));
    setRunning(false);
    setProgress(null);
  }

  function downloadCSV(rows: Record<string, string>[], filename: string) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const rows = filteredResults.map((r) => ({
      query: r.query, market: r.market, category: r.category,
      llm: r.llm, mentioned: r.hitpayMentioned ? "Yes" : "No",
      position: r.position != null ? String(r.position) : "",
      sentiment: r.sentiment,
      competitors: r.competitors.join(", "),
      excerpt: r.excerpt ?? "", runAt: r.runAt,
    }));
    downloadCSV(rows, "geo-rankings-raw.csv");
  }

  function exportTableCSV() {
    const rows = groupedResults.map((g) => ({
      query: g.query,
      market: g.market,
      category: g.category,
      llm: LLM_LABELS[g.llm],
      date: g.date,
      mentionedCount: String(g.mentionedCount),
      total: String(g.total),
      mentionRate: `${g.mentionRate}%`,
      avgPosition: g.avgPosition != null ? String(g.avgPosition) : "",
      sentiment: g.topSentiment.replace("_", " "),
      competitors: g.competitors.join(", "),
    }));
    downloadCSV(rows, "geo-rankings-summary.csv");
  }

  const filteredResults = useMemo(() => results.filter((r) => {
    if (filterMarket !== "All" && r.market !== filterMarket) return false;
    if (filterLLM !== "All" && r.llm !== filterLLM) return false;
    if (filterMentioned === "Yes" && !r.hitpayMentioned) return false;
    if (filterMentioned === "No" && r.hitpayMentioned) return false;
    if (searchQuery && !r.query.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [results, filterMarket, filterLLM, filterMentioned, searchQuery]);

  // Group filteredResults by query + date + LLM for the aggregated table
  type GroupedRow = {
    key: string; query: string; market: Market; category: string;
    llm: LLMProvider; date: string; runs: RankingResult[];
    mentionedCount: number; total: number; mentionRate: number;
    avgPosition: number | null; competitors: string[];
    citations: { url: string; context: string }[];
    topSentiment: Sentiment;
  };
  const SENTIMENT_ORDER: Record<Sentiment, number> = { positive: 3, neutral: 2, negative: 1, not_mentioned: 0 };

  const groupedResults = useMemo<GroupedRow[]>(() => {
    const groups: Record<string, GroupedRow> = {};
    for (const r of filteredResults) {
      const date = r.runAt.slice(0, 10);
      const key = `${r.query}__${date}__${r.llm}`;
      if (!groups[key]) {
        groups[key] = {
          key, query: r.query, market: r.market, category: r.category,
          llm: r.llm as LLMProvider, date, runs: [],
          mentionedCount: 0, total: 0, mentionRate: 0,
          avgPosition: null, competitors: [], citations: [], topSentiment: "not_mentioned",
        };
      }
      groups[key].runs.push(r);
    }
    return Object.values(groups)
      .sort((a, b) => b.date.localeCompare(a.date) || a.query.localeCompare(b.query))
      .map((g) => {
        const mentionedCount = g.runs.filter((r) => r.hitpayMentioned).length;
        const total = g.runs.length;
        const positions = g.runs.filter((r) => r.position !== null).map((r) => r.position!);
        const avgPosition = positions.length
          ? parseFloat((positions.reduce((s, p) => s + p, 0) / positions.length).toFixed(1))
          : null;
        const competitors = [...new Set(g.runs.flatMap((r) => r.competitors))];
        const citationMap = new Map<string, { url: string; context: string }>();
        for (const r of g.runs) {
          for (const c of (r.citations ?? [])) if (!citationMap.has(c.url)) citationMap.set(c.url, c);
        }
        const topSentiment = g.runs.find((r) => r.hitpayMentioned)?.sentiment ?? "not_mentioned";
        return { ...g, mentionedCount, total, mentionRate: Math.round((mentionedCount / total) * 100), avgPosition, competitors, citations: [...citationMap.values()], topSentiment };
      })
      .sort((a, b) => {
        if (!sortBy) return 0;
        const dir = sortDir === "desc" ? -1 : 1;
        if (sortBy === "mentionRate") return dir * (a.mentionRate - b.mentionRate);
        if (sortBy === "avgPosition") {
          if (a.avgPosition === null && b.avgPosition === null) return 0;
          if (a.avgPosition === null) return 1;
          if (b.avgPosition === null) return -1;
          // lower position number = better, so invert for "desc = best first"
          return dir * (b.avgPosition - a.avgPosition);
        }
        if (sortBy === "topSentiment") return dir * (SENTIMENT_ORDER[a.topSentiment] - SENTIMENT_ORDER[b.topSentiment]);
        return 0;
      });
  }, [filteredResults, sortBy, sortDir]);

  // History chart data: mention rate % per day (respects market + LLM filters)
  const historyData = useMemo(() => {
    const byDate: Record<string, { total: number; mentioned: number }> = {};
    for (const r of results) {
      if (filterMarket !== "All" && r.market !== filterMarket) continue;
      if (filterLLM !== "All" && r.llm !== filterLLM) continue;
      const date = r.runAt.slice(0, 10);
      if (!byDate[date]) byDate[date] = { total: 0, mentioned: 0 };
      byDate[date].total++;
      if (r.hitpayMentioned) byDate[date].mentioned++;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total, mentioned }]) => ({
        date, mentionRate: Math.round((mentioned / total) * 100),
      }));
  }, [results, filterMarket, filterLLM]);

  // Competitor comparison matrix
  const comparisonData = useMemo(() => {
    if (!results.length) return null;
    const llms = [...new Set(results.map((r) => r.llm))] as LLMProvider[];
    const matrix = KEY_COMPETITORS.map((brand) => {
      const row: Record<string, string | number> = { brand };
      for (const llm of llms) {
        const llmResults = results.filter((r) => r.llm === llm);
        if (!llmResults.length) { row[llm] = "—"; continue; }
        const mentionCount = llmResults.filter((r) => {
          if (brand === "HitPay") return r.hitpayMentioned;
          return r.competitors.includes(brand);
        }).length;
        row[llm] = Math.round((mentionCount / llmResults.length) * 100);
      }
      return row;
    });

    // Average position bar chart data
    const positions = KEY_COMPETITORS.map((brand) => {
      const posResults = results.filter((r) => {
        if (brand === "HitPay") return r.position !== null;
        return r.competitorRankings?.[brand] != null;
      });
      const avgPos = posResults.length
        ? posResults.reduce((sum, r) => sum + (brand === "HitPay" ? r.position! : r.competitorRankings[brand]!), 0) / posResults.length
        : null;
      return { brand, avgPosition: avgPos ? parseFloat(avgPos.toFixed(1)) : null, mentions: posResults.length };
    });

    return { matrix, llms, positions };
  }, [results]);

  // Unique tracked queries for the trend selector
  const trackedQueries = useMemo(() => {
    const seen = new Set<string>();
    const out: { query: string; market: string; category: string }[] = [];
    for (const r of results) {
      if (!seen.has(r.query)) {
        seen.add(r.query);
        out.push({ query: r.query, market: r.market, category: r.category });
      }
    }
    return out.sort((a, b) => a.query.localeCompare(b.query));
  }, [results]);

  // Trend rows: group by date + LLM, aggregate mention rate + avg position, add day-over-day deltas
  const trendRows = useMemo(() => {
    if (!trendQuery) return [];
    const rows = results.filter((r) => r.query === trendQuery);

    // Group by date (YYYY-MM-DD) + LLM
    const groups: Record<string, { date: string; llm: LLMProvider; runs: RankingResult[] }> = {};
    for (const r of rows) {
      const date = r.runAt.slice(0, 10);
      const key = `${date}__${r.llm}`;
      if (!groups[key]) groups[key] = { date, llm: r.llm as LLMProvider, runs: [] };
      groups[key].runs.push(r);
    }

    // Build aggregated rows oldest→newest to compute deltas
    type TrendRow = {
      key: string; date: string; llm: LLMProvider;
      mentionedCount: number; total: number; mentionRate: number;
      avgPosition: number | null; competitors: string[];
      positionDelta: number | null; mentionRateDelta: number | null;
    };

    const sorted = Object.values(groups).sort((a, b) =>
      a.date.localeCompare(b.date) || a.llm.localeCompare(b.llm)
    );

    const lastByLLM: Record<string, { mentionRate: number; avgPosition: number | null }> = {};
    const aggregated: TrendRow[] = sorted.map(({ date, llm, runs }) => {
      const mentionedCount = runs.filter((r) => r.hitpayMentioned).length;
      const total = runs.length;
      const mentionRate = Math.round((mentionedCount / total) * 100);
      const positions = runs.filter((r) => r.position !== null).map((r) => r.position!);
      const avgPosition = positions.length
        ? parseFloat((positions.reduce((s, p) => s + p, 0) / positions.length).toFixed(1))
        : null;
      const competitors = [...new Set(runs.flatMap((r) => r.competitors))];

      const prev = lastByLLM[llm];
      const mentionRateDelta = prev !== undefined ? mentionRate - prev.mentionRate : null;
      const positionDelta =
        avgPosition !== null && prev?.avgPosition !== null && prev?.avgPosition !== undefined
          ? parseFloat((prev.avgPosition - avgPosition).toFixed(1))
          : null;

      lastByLLM[llm] = { mentionRate, avgPosition };
      return { key: `${date}__${llm}`, date, llm, mentionedCount, total, mentionRate, avgPosition, competitors, positionDelta, mentionRateDelta };
    });

    return aggregated.reverse(); // newest first
  }, [results, trendQuery]);

  if (status === "loading") return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>;
  if (!session) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <p className="text-gray-500">Sign in to access GEO Rankings</p>
      <button onClick={() => signIn("google")} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">Sign in with Google</button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">GEO Ranking Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Test how HitPay appears in LLM responses across {activeLLMs.length > 0 ? activeLLMs.map((l) => LLM_LABELS[l]).join(", ") : "no configured LLMs"}
          </p>
        </div>
      </div>

      {/* Keyword Manager */}
      <div className="rounded-lg border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Keyword Manager <span className="font-normal text-gray-400">({keywords.length} queries)</span></h2>
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            placeholder="e.g. What is the best payment gateway in Singapore?"
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            className="flex-1 min-w-64 px-3 py-2 text-sm border border-gray-200 rounded-md"
          />
          <select value={newMarket} onChange={(e) => setNewMarket(e.target.value as Market)} className="px-3 py-2 text-sm border border-gray-200 rounded-md bg-white">
            {MARKETS.map((m) => <option key={m} value={m}>{MARKET_FLAGS[m]} {m}</option>)}
          </select>
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-md bg-white">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button onClick={addKeyword} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700">+ Add</button>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {keywords.map((k) => (
            <div key={k.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-md text-sm">
              <span className="text-xs font-medium bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{MARKET_FLAGS[k.market]} {k.market}</span>
              <span className="text-xs text-gray-400">{k.category}</span>
              <span className="flex-1 text-gray-700 truncate">{k.query}</span>
              <button onClick={() => deleteKeyword(k.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Run Button */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => runTests()}
          disabled={running}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {running ? (
            <><span className="animate-spin">⟳</span> Running…</>
          ) : (
            "▶ Run Tests"
          )}
        </button>
        <button
          onClick={() => runTests(3)}
          disabled={running}
          className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          Test Run (3)
        </button>
        <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <label className="text-xs text-gray-500 whitespace-nowrap">Runs per query</label>
          <select
            value={runsPerQuery}
            onChange={(e) => setRunsPerQuery(Number(e.target.value))}
            disabled={running}
            className="text-sm font-medium text-gray-700 bg-transparent border-none outline-none cursor-pointer"
          >
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}×</option>)}
          </select>
        </div>
        {progress && (
          <div className="flex flex-col gap-1 min-w-64">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{progress.done} / {progress.total} queries</span>
              {progress.secsLeft !== null && progress.secsLeft > 0 && (
                <span>~{progress.secsLeft >= 60
                  ? `${Math.floor(progress.secsLeft / 60)}m ${progress.secsLeft % 60}s`
                  : `${progress.secsLeft}s`} left</span>
              )}
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {results.length > 0 && !running && (
          <span className="text-sm text-gray-400">
            {results.length} results · last run {new Date(results[0]?.runAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-line">{error}</div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(["results", "comparison", "trends"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${tab === t ? "border border-b-white border-gray-200 bg-white text-gray-900 -mb-px" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "results" ? "Test Results" : t === "comparison" ? "Competitor Comparison" : "Query Trends"}
          </button>
        ))}
      </div>

      {tab === "results" && (
        <div className="space-y-10">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400">Filter:</span>
            <select value={filterMarket} onChange={(e) => setFilterMarket(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white">
              <option>All</option>
              {MARKETS.map((m) => <option key={m} value={m}>{MARKET_FLAGS[m]} {m}</option>)}
            </select>
            <select value={filterLLM} onChange={(e) => setFilterLLM(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white">
              <option>All</option>
              {(["claude", "chatgpt", "gemini", "perplexity"] as LLMProvider[]).map((l) => (
                <option key={l} value={l}>{LLM_LABELS[l]}</option>
              ))}
            </select>
            <select value={filterMentioned} onChange={(e) => setFilterMentioned(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white">
              <option>All</option>
              <option>Yes</option>
              <option>No</option>
            </select>
            <input
              type="text"
              placeholder="Search queries…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md min-w-48"
            />
            <div className="ml-auto flex gap-2">
              <button
                onClick={exportTableCSV}
                disabled={groupedResults.length === 0}
                className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export Summary {groupedResults.length > 0 && `(${groupedResults.length} rows)`}
              </button>
              <button
                onClick={exportCSV}
                disabled={filteredResults.length === 0}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-md font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export Raw {filteredResults.length > 0 && `(${filteredResults.length} rows)`}
              </button>
            </div>
          </div>

          {/* Results Table — grouped by query + date + LLM */}
          {groupedResults.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No results yet — add keywords and click Run Tests</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">Query</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Market</th>
                    <th className="px-4 py-3 font-medium text-gray-600">LLM</th>
                    {(["mentionRate", "avgPosition", "topSentiment"] as const).map((col) => {
                      const labels = { mentionRate: "Mention Rate", avgPosition: "Avg Position", topSentiment: "Sentiment" };
                      const active = sortBy === col;
                      return (
                        <th key={col}
                          className="px-4 py-3 font-medium text-gray-600 text-center cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap"
                          onClick={() => { if (active) { setSortDir((d) => d === "desc" ? "asc" : "desc"); } else { setSortBy(col); setSortDir("desc"); } }}>
                          {labels[col]} {active ? (sortDir === "desc" ? "↓" : "↑") : <span className="text-gray-300">↕</span>}
                        </th>
                      );
                    })}
                    <th className="px-4 py-3 font-medium text-gray-600">Competitors in Response</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Sources Cited</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupedResults.map((g) => (
                    <React.Fragment key={g.key}>
                      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedRow(expandedRow === g.key ? null : g.key)}>
                        <td className="px-4 py-2 text-gray-700 max-w-xs">
                          <div
                            className="leading-snug hover:text-blue-600 hover:underline cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setTrendQuery(g.query); setTab("trends"); }}
                          >
                            {g.query}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{g.category}</div>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{MARKET_FLAGS[g.market]} {g.market}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: LLM_COLORS[g.llm] + "20", color: LLM_COLORS[g.llm] }}>
                            {LLM_LABELS[g.llm]}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${g.mentionRate >= 60 ? "bg-green-100 text-green-700" : g.mentionRate > 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-500"}`}>
                            {g.mentionedCount}/{g.total} ({g.mentionRate}%)
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {g.avgPosition !== null ? (
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${g.avgPosition <= 1 ? "bg-yellow-100 text-yellow-700" : g.avgPosition <= 3 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                              #{g.avgPosition}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SENTIMENT_STYLES[g.topSentiment]}`}>
                            {g.topSentiment.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500 max-w-xs">
                          {g.competitors.slice(0, 4).join(", ")}{g.competitors.length > 4 ? ` +${g.competitors.length - 4}` : ""}
                        </td>
                        <td className="px-4 py-2 text-xs max-w-xs">
                          {g.citations.length ? (
                            <div className="flex flex-col gap-0.5">
                              {(expandedCitations.has(g.key) ? g.citations : g.citations.slice(0, 3)).map((c, i) => {
                                let domain = c.url;
                                try { domain = new URL(c.url).hostname.replace("www.", ""); } catch {}
                                return (
                                  <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline truncate block"
                                    title={c.context || c.url}
                                    onClick={(e) => e.stopPropagation()}>
                                    {domain}
                                  </a>
                                );
                              })}
                              {g.citations.length > 3 && (
                                <button
                                  className="text-blue-500 hover:text-blue-700 text-left"
                                  onClick={(e) => { e.stopPropagation(); setExpandedCitations(prev => { const next = new Set(prev); next.has(g.key) ? next.delete(g.key) : next.add(g.key); return next; }); }}>
                                  {expandedCitations.has(g.key) ? "Show less" : `+${g.citations.length - 3} more`}
                                </button>
                              )}
                            </div>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">{g.date}</td>
                      </tr>

                      {/* Expanded: individual runs */}
                      {expandedRow === g.key && g.runs.map((r, i) => (
                        <tr key={r.id} className="bg-gray-50 border-t border-gray-100">
                          <td colSpan={9} className="px-6 py-3">
                            <div className="flex items-center gap-3 mb-2 text-xs text-gray-500">
                              <span className="font-medium text-gray-700">Run {i + 1} of {g.total}</span>
                              <span>{new Date(r.runAt).toLocaleTimeString()}</span>
                              <span>{r.hitpayMentioned ? "✅ Mentioned" : "❌ Not mentioned"}</span>
                              {r.position !== null && <span>Position #{r.position}</span>}
                              <span className={`px-1.5 py-0.5 rounded-full font-medium ${SENTIMENT_STYLES[r.sentiment]}`}>{r.sentiment.replace("_", " ")}</span>
                            </div>
                            {r.excerpt && <p className="text-xs text-gray-600 italic mb-2">"{r.excerpt}"</p>}
                            <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded p-3 leading-relaxed">{r.llmResponse}</div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* History Chart */}
          {historyData.length > 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">HitPay Mention Rate Over Time</h2>
              <p className="text-sm text-gray-500 mb-4">
                % of queries where HitPay was mentioned per run date
                {filterMarket !== "All" && ` · ${MARKET_FLAGS[filterMarket]} ${filterMarket}`}
                {filterLLM !== "All" && ` · ${LLM_LABELS[filterLLM as LLMProvider]}`}
              </p>
              <div className="rounded-lg border border-gray-200 p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v) => [`${v}%`, "Mention rate"]} />
                    <Line type="monotone" dataKey="mentionRate" stroke="#6366f1" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "comparison" && (
        <div className="space-y-10">
          {results.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Run tests first to see competitor comparisons</p>
          ) : (
            <>
              {(["SG", "MY", "PH"] as const).map((market) => {
                const marketResults = results.filter((r) => r.market === market);
                if (!marketResults.length) return null;
                const llms = [...new Set(marketResults.map((r) => r.llm))] as LLMProvider[];
                const { online, inPerson } = COMPETITORS_BY_MARKET[market];

                const mentionRate = (brand: string, llm: LLMProvider) => {
                  const llmResults = marketResults.filter((r) => r.llm === llm);
                  if (!llmResults.length) return null;
                  const count = llmResults.filter((r) =>
                    brand === "HitPay" ? r.hitpayMentioned : r.competitors.includes(brand)
                  ).length;
                  return Math.round((count / llmResults.length) * 100);
                };

                const renderSection = (brands: string[], label: string) => (
                  <div key={label}>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 mb-4">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-left">
                          <tr>
                            <th className="px-4 py-2 font-medium text-gray-600">Brand</th>
                            {llms.map((llm) => (
                              <th key={llm} className="px-4 py-2 font-medium text-center" style={{ color: LLM_COLORS[llm] }}>{LLM_LABELS[llm]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {brands.map((brand) => (
                            <tr key={brand} className={brand === "HitPay" ? "bg-blue-50 font-semibold" : "hover:bg-gray-50"}>
                              <td className="px-4 py-2 text-gray-800 flex items-center gap-2">
                                {brand}
                                {BRAND_URLS[brand] && (
                                  <a href={BRAND_URLS[brand]} target="_blank" rel="noopener noreferrer"
                                    className="text-gray-300 hover:text-blue-500 text-xs" onClick={(e) => e.stopPropagation()}>↗</a>
                                )}
                              </td>
                              {llms.map((llm) => {
                                const pct = mentionRate(brand, llm);
                                const bg = pct === null ? "" : pct >= 60 ? "bg-green-100 text-green-700" : pct >= 30 ? "bg-yellow-100 text-yellow-700" : pct > 0 ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400";
                                return (
                                  <td key={llm} className="px-4 py-2 text-center">
                                    {pct !== null
                                      ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${bg}`}>{pct}%</span>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );

                return (
                  <div key={market}>
                    <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-gray-200">{MARKET_FLAGS[market]} {MARKET_FULL_NAMES[market]}</h2>
                    {renderSection(online, "Online Payments")}
                    {renderSection(inPerson, "In-Person Payments")}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {tab === "trends" && (
        <div className="space-y-6">
          {trackedQueries.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Run tests first to see query trends</p>
          ) : (
            <>
              {/* Query selector */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select query:</label>
                <select
                  value={trendQuery}
                  onChange={(e) => setTrendQuery(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md bg-white"
                >
                  <option value="">— choose a query —</option>
                  {trackedQueries.map((q) => (
                    <option key={q.query} value={q.query}>
                      {MARKET_FLAGS[q.market]} [{q.market}] {q.query}
                    </option>
                  ))}
                </select>
              </div>

              {/* Trend table */}
              {trendQuery && (
                trendRows.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No runs found for this query</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                          <th className="px-4 py-3 font-medium text-gray-600">LLM</th>
                          <th className="px-4 py-3 font-medium text-gray-600 text-center">Mention Rate</th>
                          <th className="px-4 py-3 font-medium text-gray-600 text-center">Avg Position</th>
                          <th className="px-4 py-3 font-medium text-gray-600 text-center">vs prev day</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Competitors Seen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {trendRows.map((r) => (
                          <tr key={r.key} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{r.date}</td>
                            <td className="px-4 py-2">
                              <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: LLM_COLORS[r.llm] + "20", color: LLM_COLORS[r.llm] }}>
                                {LLM_LABELS[r.llm]}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${r.mentionRate >= 60 ? "bg-green-100 text-green-700" : r.mentionRate > 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-500"}`}>
                                {r.mentionedCount}/{r.total} ({r.mentionRate}%)
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              {r.avgPosition !== null ? (
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${r.avgPosition <= 1 ? "bg-yellow-100 text-yellow-700" : r.avgPosition <= 3 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                  #{r.avgPosition}
                                </span>
                              ) : <span className="text-gray-300 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {r.mentionRateDelta !== null && r.mentionRateDelta !== 0 ? (
                                <span className={`text-xs font-semibold ${r.mentionRateDelta > 0 ? "text-green-600" : "text-red-500"}`}>
                                  {r.mentionRateDelta > 0 ? `↑${r.mentionRateDelta}%` : `↓${Math.abs(r.mentionRateDelta)}%`}
                                  {r.positionDelta !== null && r.positionDelta !== 0 && (
                                    <span className="ml-1 text-gray-400">
                                      pos {r.positionDelta > 0 ? `↑${r.positionDelta}` : `↓${Math.abs(r.positionDelta)}`}
                                    </span>
                                  )}
                                </span>
                              ) : r.positionDelta !== null && r.positionDelta !== 0 ? (
                                <span className={`text-xs font-semibold ${r.positionDelta > 0 ? "text-green-600" : "text-red-500"}`}>
                                  pos {r.positionDelta > 0 ? `↑${r.positionDelta}` : `↓${Math.abs(r.positionDelta)}`}
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">{r.mentionRateDelta === null ? "first run" : "—"}</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">
                              {r.competitors.slice(0, 5).join(", ")}{r.competitors.length > 5 ? ` +${r.competitors.length - 5}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
