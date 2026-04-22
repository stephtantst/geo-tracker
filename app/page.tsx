"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface GeoData {
  aiReferrals: Record<string, string>[];
  blogPages?: Record<string, string>[];
  organicByDate: Record<string, string>[];
  organicPages?: Record<string, string>[];
}

interface DateRange {
  startDate: string;
  endDate: string;
}

const PRESETS = [
  { label: "1W",  days: 7,   granularity: "day"   },
  { label: "1M",  days: 30,  granularity: "week"  },
  { label: "3M",  days: 90,  granularity: "week"  },
  { label: "6M",  days: 180, granularity: "week"  },
  { label: "1Y",  days: 365, granularity: "month" },
  { label: "2Y",  days: 730, granularity: "month" },
];

function granularityForRange(startDate: string, endDate: string): string {
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
  if (days <= 14)  return "day";
  if (days <= 180) return "week";
  return "month";
}

const LINE_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgoDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

// Normalize raw GA4 date string to a sortable key, based on known granularity
function normalizeDate(d: string, gran: string): string {
  if (gran === "day")   return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; // YYYYMMDD → YYYY-MM-DD
  if (gran === "month") return `${d.slice(0, 4)}-${d.slice(4, 6)}`;                   // YYYYMM   → YYYY-MM
  return d; // week: keep YYYYWW as-is for correct lexicographic sort
}

function formatTickLabel(d: string, gran: string): string {
  if (gran === "day") return d.slice(5); // YYYY-MM-DD → MM-DD
  if (gran === "month") {
    const [y, m] = d.split("-");
    return new Date(+y, +m - 1).toLocaleString("default", { month: "short", year: "2-digit" });
  }
  // week: YYYYWW — show "Wnn 'YY"
  const year = d.slice(2, 4);
  const week = d.slice(4);
  return `W${week} '${year}`;
}

function buildChartData(rows: Record<string, string>[], gran: string) {
  const dateMap: Record<string, Record<string, number>> = {};
  const sources = new Set<string>();

  for (const row of rows) {
    const date = normalizeDate(row.date, gran);
    const source = row.source;
    const sessions = parseInt(row.sessions ?? "0", 10);
    sources.add(source);
    if (!dateMap[date]) dateMap[date] = {};
    dateMap[date][source] = (dateMap[date][source] ?? 0) + sessions;
  }

  return {
    data: Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals })),
    sources: Array.from(sources),
  };
}

type SortKey = "sessions" | "newUsers" | "avgDuration" | "engagementRate" | "bounceRate" | "pagesPerSession";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "sessions",        label: "Sessions"      },
  { key: "newUsers",        label: "New Users"     },
  { key: "avgDuration",     label: "Avg Duration"  },
  { key: "engagementRate",  label: "Engagement"    },
  { key: "bounceRate",      label: "Bounce Rate"   },
  { key: "pagesPerSession", label: "Pages/Session" },
];

function fmtDuration(seconds: string) {
  const s = Math.round(parseFloat(seconds ?? "0"));
  if (isNaN(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtPct(val: string) {
  const n = parseFloat(val ?? "0");
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPages(val: string) {
  const n = parseFloat(val ?? "0");
  if (isNaN(n)) return "—";
  return n.toFixed(2);
}

function LandingPageTable({
  rows,
  onExport,
  showSourceFilter = false,
}: {
  rows: Record<string, string>[];
  onExport: (filtered: Record<string, string>[]) => void;
  showSourceFilter?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("sessions");

  const sources = ["All", ...Array.from(new Set(rows.map((r) => r.source))).sort()];

  const filtered = rows
    .filter((r) =>
      (sourceFilter === "All" || r.source === sourceFilter) &&
      (!search || r.landingPage?.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => parseFloat(b[sortKey] ?? "0") - parseFloat(a[sortKey] ?? "0"));

  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <input
          type="text"
          placeholder="Search URL..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white w-56"
        />
        {showSourceFilter && (
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
          >
            {sources.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        <div className="flex flex-wrap items-center gap-1 ml-auto">
          <span className="text-xs text-gray-400 mr-1">Sort:</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium ${
                sortKey === key
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => onExport(filtered)}
            className="ml-2 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-md font-medium"
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Landing Page</th>
              <th className="px-4 py-3 font-medium text-gray-600">Source</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">Sessions</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">New Users</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">Avg Duration</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">Engagement</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">Bounce Rate</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">Pages/Session</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700 max-w-xs truncate font-mono text-xs">
                  {row.landingPage}
                </td>
                <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{row.source}</td>
                <td className="px-4 py-2 text-gray-700 text-right">{row.sessions}</td>
                <td className="px-4 py-2 text-gray-700 text-right">{row.newUsers}</td>
                <td className="px-4 py-2 text-gray-700 text-right">{fmtDuration(row.avgDuration)}</td>
                <td className="px-4 py-2 text-right">
                  <span className={`font-medium ${parseFloat(row.engagementRate) >= 0.5 ? "text-green-600" : "text-amber-600"}`}>
                    {fmtPct(row.engagementRate)}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className={`font-medium ${parseFloat(row.bounceRate) <= 0.4 ? "text-green-600" : "text-red-500"}`}>
                    {fmtPct(row.bounceRate)}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-700 text-right">{fmtPages(row.pagesPerSession)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 px-4 py-6">No data found</p>
        )}
      </div>
    </div>
  );
}

function ChartSection({
  title,
  description,
  rows,
  gran,
  onExport,
}: {
  title: string;
  description: string;
  rows: Record<string, string>[];
  gran: string;
  onExport: () => void;
}) {
  const chart = buildChartData(rows, gran);
  const tickFmt = (d: string) => formatTickLabel(d, gran);
  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
        <button
          onClick={onExport}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
        >
          Export CSV
        </button>
      </div>
      {chart.data.length > 0 ? (
        <div className="rounded-lg border border-gray-200 p-4">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v, name) => [v, name]} labelFormatter={(d) => tickFmt(String(d))} />
              <Legend />
              {chart.sources.map((source, i) => (
                <Line
                  key={source}
                  type="monotone"
                  dataKey={source}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-gray-400 py-4">No data found for this period</p>
      )}
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState("3M");
  const [granularity, setGranularity] = useState("week");
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: daysAgoDate(90),
    endDate: toISODate(new Date()),
  });
  const [customStart, setCustomStart] = useState(dateRange.startDate);
  const [customEnd, setCustomEnd] = useState(dateRange.endDate);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (session) fetchData(dateRange, granularity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function fetchData(range: DateRange, gran: string = granularity) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDate: range.startDate,
        endDate: range.endDate,
        granularity: gran,
      });
      const res = await fetch(`/api/geo-data?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fetch data");
      }
      setGeoData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(label: string, days: number, gran: string) {
    const range = { startDate: daysAgoDate(days), endDate: toISODate(new Date()) };
    setActivePreset(label);
    setGranularity(gran);
    setShowCustom(false);
    setDateRange(range);
    fetchData(range, gran);
  }

  function applyCustom() {
    if (!customStart || !customEnd) return;
    const range = { startDate: customStart, endDate: customEnd };
    const gran = granularityForRange(customStart, customEnd);
    setActivePreset("");
    setGranularity(gran);
    setDateRange(range);
    fetchData(range, gran);
  }

  async function exportCSV(data: Record<string, string>[], filename: string) {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, filename }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-2xl font-bold">GEO Optimization Tracker</h1>
        <p className="text-gray-500">Sign in with your Google account to access GA4 data</p>
        <button
          onClick={() => signIn("google")}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">GEO Optimization Tracker</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session.user?.email}</span>
          <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-gray-700">
            Sign out
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        {PRESETS.map(({ label, days, granularity: gran }) => (
          <button
            key={label}
            onClick={() => applyPreset(label, days, gran)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              activePreset === label
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}

        <button
          onClick={() => setShowCustom(!showCustom)}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
            showCustom || activePreset === ""
              ? "bg-blue-600 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
          }`}
        >
          Custom
        </button>

        {showCustom && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={toISODate(new Date())}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white"
            />
            <button
              onClick={applyCustom}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {dateRange.startDate} → {dateRange.endDate}
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-20 text-gray-500">Fetching GA4 data...</div>
      )}

      {geoData && !loading && (
        <div className="space-y-12">
          <ChartSection
            title="AI Referral Traffic"
            description="Sessions from AI tools (Perplexity, ChatGPT, Gemini, etc.) by source"
            rows={geoData.aiReferrals}
            gran={granularity}
            onExport={() => exportCSV(geoData.aiReferrals, "ai-referrals")}
          />

          <div>
            <h2 className="text-lg font-semibold mb-1">Landing Pages from AI Traffic</h2>
            <p className="text-sm text-gray-500 mb-4">Pages AI visitors land on — shows which content AI tools are citing</p>
            <LandingPageTable
              rows={geoData.blogPages ?? []}
              onExport={(filtered) => exportCSV(filtered, "ai-landing-pages")}
              showSourceFilter
            />
          </div>

          <ChartSection
            title="Organic Search Traffic"
            description="Sessions from organic search by source"
            rows={geoData.organicByDate}
            gran={granularity}
            onExport={() => exportCSV(geoData.organicByDate, "organic-by-date")}
          />

          <div>
            <h2 className="text-lg font-semibold mb-1">Landing Pages from Organic Search</h2>
            <p className="text-sm text-gray-500 mb-4">Pages organic search visitors land on, by source</p>
            <LandingPageTable
              rows={geoData.organicPages ?? []}
              onExport={(filtered) => exportCSV(filtered, "organic-landing-pages")}
              showSourceFilter
            />
          </div>
        </div>
      )}
    </div>
  );
}
