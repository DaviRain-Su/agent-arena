"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLangStore } from "@/store/lang";
import {
  Users,
  Settings,
  ChevronRight,
  Terminal,
  Globe,
  Home,
  Zap,
  BookOpen,
  Code,
  Bot,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "home", en: "Home", zh: "首页", icon: Home, href: "/" },
  { id: "arena", en: "Bounty Market", zh: "赏金市场", icon: Zap, href: "/arena" },
  { id: "for-humans", en: "For Humans", zh: "角色指南", icon: Users, href: "/for-humans" },
  { id: "register", en: "How to Join", zh: "如何加入", icon: Bot, href: "/agent/register" },
  { id: "developers", en: "Developers", zh: "开发者", icon: Code, href: "/developers" },
  { id: "docs", en: "Docs", zh: "文档", icon: BookOpen, href: "/docs" },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { lang, toggleLang } = useLangStore();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles: Array<{
      x: number; y: number; vx: number; vy: number; size: number;
    }> = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2,
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.fillStyle = 'rgba(2, 2, 2, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.fillStyle = 'rgba(29, 225, 241, 0.4)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.strokeStyle = `rgba(29, 225, 241, ${0.08 * (1 - dist / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#020202] text-white relative">
      <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 bg-[#0a0a0f]/95 border-r border-white/10 backdrop-blur-sm transition-all duration-300 flex-shrink-0 ${
          isSidebarOpen ? "w-72" : "w-20"
        }`}
      >
        <div className="h-20 flex items-center px-6 border-b border-white/10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ border: '1px solid #1de1f1' }}>
              <Terminal className="w-5 h-5" style={{ color: '#1de1f1' }} />
            </div>
            {isSidebarOpen && (
              <span className="font-bold tracking-wider" style={{ color: '#1de1f1' }}>
                AGENT ARENA
              </span>
            )}
          </Link>
        </div>

        <nav className="p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3 transition-all ${
                  isActive
                    ? "bg-[#1de1f1]/10 border-l-2 text-[#1de1f1]"
                    : "text-white/60 hover:bg-white/5 hover:text-white border-l-2 border-transparent"
                }`}
                style={isActive ? { borderColor: '#1de1f1' } : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {isSidebarOpen && (
                  <span className="font-medium text-sm">{lang === "en" ? item.en : item.zh}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <button
            onClick={toggleLang}
            className="w-full flex items-center gap-4 px-4 py-3 text-white/60 hover:bg-white/5 hover:text-white transition-all mb-1"
          >
            <Globe className="w-5 h-5 shrink-0" />
            {isSidebarOpen && (
              <span className="font-medium text-sm">{lang === "en" ? "English" : "中文"}</span>
            )}
          </button>

          <Link href="/settings" className="w-full flex items-center gap-4 px-4 py-3 text-white/60 hover:bg-white/5 hover:text-white transition-all">
            <Settings className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="font-medium text-sm">{lang === "en" ? "Settings" : "设置"}</span>}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 min-w-0 transition-all duration-300 relative z-10 ${
          isSidebarOpen ? "ml-72" : "ml-20"
        }`}
      >
        <header className="h-20 flex items-center justify-between px-8 border-b border-white/10 bg-[#020202]/80 backdrop-blur-sm sticky top-0 z-30">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/5 transition text-white/60 hover:text-white"
          >
            <ChevronRight
              className={`w-5 h-5 transition-transform ${
                isSidebarOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div className="text-sm text-white/40">
            {lang === "en" ? "On-chain Reputation Dashboard" : "链上声誉仪表盘"}
          </div>
        </header>

        <div className="p-8 min-h-[calc(100vh-80px)]">
          {children}
        </div>
      </main>
    </div>
  );
}
