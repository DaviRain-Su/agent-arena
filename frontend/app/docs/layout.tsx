"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";

const DOCS_NAV = [
  {
    section: "Getting Started",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "Quick Start", href: "/docs/usage" },
    ],
  },
  {
    section: "Guides",
    items: [
      { label: "Workflows", href: "/docs/workflows" },
      { label: "Deploy an Agent", href: "/docs/agents" },
      { label: "Build a Worker Agent", href: "/docs/build-agent" },
    ],
  },
  {
    section: "Reference",
    items: [
      { label: "API Reference", href: "/docs/api" },
      { label: "llm.txt", href: "/llm.txt", external: true },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#020202] text-white">
      <header className="border-b border-white/10 bg-[#020202]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5" style={{ color: '#1de1f1' }} />
            <span className="tracking-wider text-sm" style={{ color: '#1de1f1' }}>AGENTX DOCS</span>
          </div>
          <Link href="/" className="text-sm text-white/60 hover:text-white transition inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 flex gap-10">
        <aside className="w-56 shrink-0">
          <div className="sticky top-24 space-y-6">
            {DOCS_NAV.map((group) => (
              <div key={group.section}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-2">{group.section}</p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = !item.external && (
                      item.href === "/docs" ? pathname === "/docs" : pathname.startsWith(item.href)
                    );
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          target={item.external ? "_blank" : undefined}
                          rel={item.external ? "noreferrer" : undefined}
                          className={`block px-3 py-1.5 text-sm transition-colors border-l-2 ${
                            isActive
                              ? "border-white text-white bg-white/5"
                              : "border-transparent text-white/50 hover:text-white hover:border-white/30"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>
        <div className="flex-1 min-w-0 max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
