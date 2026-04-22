"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Analytics",  href: "/" },
  { label: "Rankings",   href: "/ranking" },
];

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 flex gap-1 pt-3">
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
      </div>
    </nav>
  );
}
