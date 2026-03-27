"use client";

import { useWeb3 } from "./Web3Provider";
import { useLangStore } from "@/store/lang";
import { t, translations } from "@/lib/i18n";
import Link from "next/link";
import { Workflow, ShoppingCart, Users, ClipboardList, LogOut, Globe } from "lucide-react";

const MENU_ITEMS: { id: string; label: "navWorkflows" | "navMarket" | "navTeams" | "navTasks"; icon: typeof Workflow; href: string; desc: string }[] = [
  { id: "workflows", label: "navWorkflows", icon: Workflow, href: "/workflows", desc: "Build & Deploy" },
  { id: "market", label: "navMarket", icon: ShoppingCart, href: "/market", desc: "Browse & Publish" },
  { id: "teams", label: "navTeams", icon: Users, href: "/teams", desc: "Create Squads" },
  { id: "tasks", label: "navTasks", icon: ClipboardList, href: "/tasks", desc: "Monitor Tasks" },
];

export function MainMenu() {
  const { address, disconnect } = useWeb3();
  const { lang, toggleLang } = useLangStore();

  return (
    <div className="min-h-screen bg-black crt-screen flex flex-col">
      <div className="scanline" />

      {/* Header */}
      <header className="border-b border-[var(--phosphor-dim)]/50 p-6">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold terminal-text">{t('appName', lang)}</div>
            <div className="dim text-sm tracking-widest">// SYSTEM READY</div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleLang}
              className="flex items-center gap-2 px-4 py-2 border border-[var(--phosphor-dim)] hover:border-[var(--phosphor-main)] transition"
            >
              <Globe className="w-4 h-4" />
              {lang === 'en' ? 'EN' : '中文'}
            </button>
            <div className="text-sm">
              <span className="dim">OPERATOR: </span>
              <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
            </div>
            <button onClick={disconnect} className="crt-button flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              [ {t('disconnect', lang)} ]
            </button>
          </div>
        </div>
      </header>

      {/* Main Menu Grid */}
      <main className="flex-1 container mx-auto px-8 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 terminal-text">SELECT MODULE</h2>
            <p className="text-lg dim">Choose a system module to access</p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="crt-panel p-8 hover:border-[var(--phosphor-main)] transition-all duration-300 group"
                >
                  <div className="flex items-start gap-6">
                    <div className="w-20 h-20 border-2 border-[var(--phosphor-main)] flex items-center justify-center group-hover:bg-[var(--phosphor-main)] group-hover:text-black transition-all duration-300">
                      <Icon className="w-10 h-10" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold mb-2">{t(item.label as keyof typeof translations.en, lang)}</h3>
                      <p className="text-sm dim mb-4">{item.desc}</p>
                      <div className="text-[var(--phosphor-main)] text-sm">[ ACCESS MODULE → ]</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--phosphor-dim)]/50 py-6">
        <div className="container mx-auto px-8 text-center text-xs dim tracking-wider">
          AGENTX PROTOCOL v1.0.0 // X-LAYER TESTNET // SECURE CONNECTION
        </div>
      </footer>
    </div>
  );
}
