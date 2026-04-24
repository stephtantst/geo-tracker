"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const TABS = [
  { label: "Analytics",  href: "/" },
  { label: "Rankings",   href: "/ranking" },
];

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">How this tool works</h2>
            <p className="text-sm text-gray-500 mt-0.5">Understanding the methodology & data accuracy</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 ml-4 mt-0.5"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-gray-700">

          <section>
            <h3 className="font-semibold text-gray-900 mb-2">What this tool tracks</h3>
            <p>
              This tool measures <strong>Generative Engine Optimisation (GEO)</strong> — how often HitPay and competitors are recommended by AI assistants when users ask payment-related questions. Each test run sends a query to one or more LLMs and checks whether HitPay appears in the response.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-2">How tests are run</h3>
            <ul className="space-y-2 list-disc list-inside">
              <li>Queries are sent to <strong>Claude (Sonnet)</strong>, <strong>ChatGPT (GPT-4o)</strong>, <strong>Gemini (1.5 Pro)</strong>, and <strong>Perplexity (Sonar)</strong>.</li>
              <li>Each LLM receives a <strong>neutral system prompt</strong> asking it to act as a business advisor for a specific market (Singapore, Malaysia, or Philippines) and recommend widely-used local solutions.</li>
              <li>Responses are capped at <strong>600 tokens</strong> to keep costs consistent.</li>
              <li>Temperature is set to <strong>1.0</strong> (maximum), so results are intentionally varied — this simulates the range of real-world responses users would see.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-2">How mentions are detected</h3>
            <p>
              A mention is counted when the word <strong>"hitpay"</strong> (case-insensitive) appears anywhere in the LLM's response. The system also records:
            </p>
            <ul className="space-y-1 list-disc list-inside mt-2">
              <li><strong>Position</strong> — whether HitPay was the 1st, 2nd, 3rd… brand named in the response.</li>
              <li><strong>Sentiment</strong> — positive, neutral, or negative, based on keywords in the surrounding text.</li>
              <li><strong>Mention rate</strong> — across multiple runs of the same query, the % of times HitPay was mentioned.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-2">Why results may differ from manual testing</h3>
            <p className="mb-2">
              If you ask ChatGPT or Claude the same question in a browser tab, you may get a different answer. This is expected — and by design — for several reasons:
            </p>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong>System prompt:</strong> This tool injects a specific business-advisor system prompt; browser sessions use the LLM's default behaviour.</li>
              <li><strong>Temperature 1.0:</strong> High randomness means the same query can produce different outputs on each run.</li>
              <li><strong>Token cap:</strong> Responses are cut at 600 tokens; a brand mentioned late in a longer response may be omitted.</li>
              <li><strong>Model versions:</strong> LLM providers update their models regularly; responses can shift over time without any changes on our end.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-2">Accuracy considerations</h3>
            <ul className="space-y-1 list-disc list-inside">
              <li>A single run is a <strong>snapshot</strong>, not a definitive truth — run the same query several times to get a reliable mention rate.</li>
              <li>Mention rate trends over time (the "Over Time" chart) are more meaningful than any individual run.</li>
              <li>The tool tracks a fixed list of ~70 competitors; brands outside this list are not counted.</li>
              <li>Sentiment detection is keyword-based and may not capture nuanced phrasing.</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}

export function NavTabs() {
  const pathname = usePathname();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex items-end gap-1 pt-3">
          {TABS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                pathname === href
                  ? "border border-b-white border-gray-200 bg-white text-gray-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </Link>
          ))}
          <div className="ml-auto pb-2">
            <button
              onClick={() => setShowInfo(true)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="How this tool works"
              title="How this tool works"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>
      </nav>
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </>
  );
}
