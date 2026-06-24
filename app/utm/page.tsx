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

interface UTMData {
  granularity: string;
  campaigns: Record<string, string>[];
  trends: Record<string, string>[];
}

interface DateRange {
  startDate: string;
  endDate: string;
}

const PRESETS = [
  { label: "1W",  days: 7   },
  { label: "1M",  days: 30  },
  { label: "3M",  days: 90  },
  { label: "6M",  days: 180 },
  { label: "1Y",  days: 365 },
];

const LINE_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

const MEDIUM_OPTIONS = ["All", "email", "cpc", "organic", "social", "referral", "affiliate"];

type CampaignSortKey = "sessions" | "newUsers" | "avgDuration" | "engagementRate" | "bounceRate";

const SORT_COLS: { key: CampaignSortKey; label: string }[] = [
  { key: "sessions",       label: "Sessions"     },
  { key: "newUsers",       label: "New Users"    },
  { key: "avgDuration",    label: "Avg Duration" },
  { key: "engagementRate", label: "Engagement"   },
  { key: "bounceRate",     label: "Bounce Rate"  },
];

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgoDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

function granularityForRange(startDate: string, endDate: string): string {
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
  if (days <= 14)  return "day";
  if (days <= 180) return "week";
  return "month";
}

function normalizeDate(d: string, gran: string): string {
  if (gran === "day")   return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (gran === "month") return `${d.slice(0, 4)}-${d.slice(4, 6)}`;
  return d;
}

function formatTickLabel(d: string, gran: string): string {
  if (gran === "day") return d.slice(5);
  if (gran === "month") {
    const [y, m] = d.split("-");
    return new Date(+y, +m - 1).toLocaleString("default", { month: "short", year: "2-digit" });
  }
  return `W${d.slice(4)} '${d.slice(2, 4)}`;
}

function fmtDuration(seconds: string) {
  const s = Math.round(parseFloat(seconds ?? "0"));
  if (isNaN(s)) return "—";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function fmtPct(val: string) {
  const n = parseFloat(val ?? "0");
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function UTMPage() {
  const { data: session, status } = useSession();
  const [utmData, setUtmData] = useState<UTMData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState("3M");
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: daysAgoDate(90),
    endDate: toISODate(new Date()),
  });
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(daysAgoDate(90));
  const [customEnd, setCustomEnd] = useState(toISODate(new Date()));
  const [sortKey, setSortKey] = useState<CampaignSortKey>("sessions");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [mediumFilter, setMediumFilter] = useState("email");

  useEffect(() => {
    if (status === "authenticated") fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dateRange, mediumFilter]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    const gran = granularityForRange(dateRange.startDate, dateRange.endDate);
    try {
      const mediumParam = mediumFilter && mediumFilter !== "All" ? `&medium=${encodeURIComponent(mediumFilter)}` : "";
      const res = await fetch(
        `/api/utm-data?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&granularity=${gran}${mediumParam}`
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      setUtmData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(label: string, days: number) {
    setActivePreset(label);
    setShowCustom(false);
    setDateRange({ startDate: daysAgoDate(days), endDate: toISODate(new Date()) });
  }

  function applyCustom() {
    setActivePreset("");
    setDateRange({ startDate: customStart, endDate: customEnd });
  }

  function toggleSort(key: CampaignSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (status === "loading") {
    return (
      <div className="max-w-6xl mx-auto px-6 py-24 text-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="max-w-6xl mx-auto px-6 py-24 flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold">UTM Tracker</h1>
        <p className="text-gray-500">Sign in with your Google account to access UTM data</p>
        <button
          onClick={() => signIn("google")}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  const gran = utmData?.granularity ?? granularityForRange(dateRange.startDate, dateRange.endDate);
  const tickFmt = (d: string) => formatTickLabel(d, gran);

  const filteredCampaigns = (utmData?.campaigns ?? [])
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.campaign?.toLowerCase().includes(q) ||
        r.source?.toLowerCase().includes(q) ||
        r.medium?.toLowerCase().includes(q) ||
        r.content?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = parseFloat(a[sortKey] ?? "0");
      const bv = parseFloat(b[sortKey] ?? "0");
      return sortDir === "desc" ? bv - av : av - bv;
    });

  // Top 10 by sessions from the filtered set — chart tracks what the table shows
  const chartCampaignNames = [...filteredCampaigns]
    .sort((a, b) => parseInt(b.sessions ?? "0") - parseInt(a.sessions ?? "0"))
    .slice(0, 10)
    .map((r) => r.campaign);
  const chartSet = new Set(chartCampaignNames);

  const trendChartData = (() => {
    if (!utmData?.trends?.length) return { data: [], campaigns: chartCampaignNames };
    const dateMap: Record<string, Record<string, number>> = {};
    for (const row of utmData.trends) {
      if (!chartSet.has(row.campaign)) continue;
      const date = normalizeDate(row.date, gran);
      if (!dateMap[date]) dateMap[date] = {};
      dateMap[date][row.campaign] = (dateMap[date][row.campaign] ?? 0) + parseInt(row.sessions ?? "0", 10);
    }
    return {
      data: Object.entries(dateMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({ date, ...vals })),
      campaigns: chartCampaignNames,
    };
  })();

  const totalSessions = (utmData?.campaigns ?? []).reduce((s, r) => s + parseInt(r.sessions ?? "0", 10), 0);
  const totalNewUsers = (utmData?.campaigns ?? []).reduce((s, r) => s + parseInt(r.newUsers ?? "0", 10), 0);
  const uniqueCampaigns = new Set((utmData?.campaigns ?? []).map((r) => r.campaign)).size;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">UTM Tracker</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session?.user?.email}</span>
          <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-gray-700">
            Sign out
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Medium</span>
          <div className="flex items-center gap-1">
            {MEDIUM_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setMediumFilter(opt === "All" ? "" : opt)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  (opt === "All" && !mediumFilter) || mediumFilter === opt
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        {PRESETS.map(({ label, days }) => (
          <button
            key={label}
            onClick={() => applyPreset(label, days)}
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

        {loading && (
          <span className="ml-auto text-xs text-gray-400">Loading…</span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {utmData && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Sessions",     value: totalSessions.toLocaleString()   },
            { label: "Total New Users",    value: totalNewUsers.toLocaleString()   },
            { label: "Unique Campaigns",   value: uniqueCampaigns.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-semibold text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Trend Chart */}
      {utmData && trendChartData.data.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Sessions Over Time</h2>
          <p className="text-xs text-gray-400 mb-4">
            Top {chartCampaignNames.length} campaign{chartCampaignNames.length !== 1 ? "s" : ""} by sessions
            {search ? ` matching "${search}"` : ""}
            {mediumFilter ? ` · medium: ${mediumFilter}` : ""}
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trendChartData.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v, name) => [v, name]} />
              <Legend />
              {trendChartData.campaigns.map((campaign, i) => (
                <Line
                  key={campaign}
                  type="monotone"
                  dataKey={campaign}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Campaign Table */}
      {utmData && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              Campaign Performance
              <span className="ml-2 text-xs font-normal text-gray-400">
                {filteredCampaigns.length} of {utmData.campaigns.length}
              </span>
            </h2>
            <input
              type="text"
              placeholder="Search campaigns, source, medium…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-md px-3 py-1.5 text-xs text-gray-700 w-56"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">Campaign</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">Medium</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">Content</th>
                  {SORT_COLS.map(({ key, label }) => (
                    <th
                      key={key}
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      {sortKey === key
                        ? <span className="ml-1 text-gray-700">{sortDir === "desc" ? "↓" : "↑"}</span>
                        : <span className="ml-1 text-gray-300">↕</span>
                      }
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                      No campaigns found for this date range.
                    </td>
                  </tr>
                ) : (
                  filteredCampaigns.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate" title={row.campaign}>
                        {row.campaign || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{row.source || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{row.medium || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate" title={row.content}>
                        {row.content && row.content !== "(not set)" ? row.content : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {parseInt(row.sessions ?? "0").toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {parseInt(row.newUsers ?? "0").toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtDuration(row.avgDuration)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtPct(row.engagementRate)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtPct(row.bounceRate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!utmData && !loading && !error && (
        <div className="text-center py-24 text-sm text-gray-400">No data loaded.</div>
      )}
    </div>
  );
}
