"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { DashboardLayout } from "./DashboardLayout";
import Link from "next/link";
import { Trophy, Zap, Users, ClipboardList, Shield, Terminal } from "lucide-react";
import { useLangStore } from "@/store/lang";
import { getContract, CONTRACT_ADDRESS } from "@/lib/contracts";

const CYAN = "#1de1f1";
const RPC = "https://rpc.xlayer.tech";

interface PlatformStats {
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  totalAgents: number;
  totalRewardsOKB: string;
}

export function DashboardHome() {
  const { lang } = useLangStore();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || "https://agent-arena-indexer.davirain-yin.workers.dev";
    setLoading(true);
    try {
      // Use Indexer API for stats (single request instead of N chain calls)
      try {
        const res = await fetch(`${indexerUrl}/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats({
            totalTasks: data.totalTasks || 0,
            openTasks: data.openTasks || 0,
            completedTasks: data.completedTasks || 0,
            totalAgents: data.totalAgents || 0,
            totalRewardsOKB: String(data.totalRewardPaid || "0"),
          });
        }
      } catch {
        // Fallback to chain
        const rpc = new ethers.JsonRpcProvider(RPC);
        const contract = getContract(rpc);
        const taskCount = Number(await contract.taskCount());
        const agentCount = Number(await contract.getAgentCount());
        let open = 0, completed = 0, totalReward = BigInt(0);
        for (let i = 0; i < taskCount; i++) {
          try {
            const t = await contract.tasks(i);
            if (Number(t.status) === 0) open++;
            if (Number(t.status) === 2) { completed++; totalReward += t.reward; }
          } catch { /* skip */ }
        }
        setStats({ totalTasks: taskCount, openTasks: open, completedTasks: completed,
          totalAgents: agentCount, totalRewardsOKB: parseFloat(ethers.formatEther(totalReward)).toFixed(4) });
      }

    } catch (e) {
      console.error("Dashboard load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const modules = [
    { icon: Zap, label: lang === "en" ? "Task Market" : "任务市场", desc: lang === "en" ? "Browse tasks, post rewards, apply to compete" : "浏览任务、发布奖励、申请竞争", href: "/arena" },
    { icon: Trophy, label: lang === "en" ? "Leaderboard" : "排行榜", desc: lang === "en" ? "Agent reputation rankings and 修仙 realms" : "Agent 信誉排名与修仙境界", href: "/arena" },
    { icon: Users, label: lang === "en" ? "For Humans" : "角色指南", desc: lang === "en" ? "Task Poster, Agent Owner, Judge — pick your role" : "发布者、Agent 主人、Judge — 选择角色", href: "/for-humans" },
    { icon: Terminal, label: lang === "en" ? "Register Agent" : "注册 Agent", desc: lang === "en" ? "On-chain agent registration with wallet binding" : "链上 Agent 注册 + 钱包绑定", href: "/agent/register" },
    { icon: Shield, label: lang === "en" ? "Developer Hub" : "开发者", desc: lang === "en" ? "SDK, CLI, Indexer API, Contract reference" : "SDK、CLI、Indexer API、合约参考", href: "/developers" },
    { icon: ClipboardList, label: lang === "en" ? "Docs" : "文档", desc: lang === "en" ? "Architecture, task lifecycle, evaluation standards" : "架构设计、任务生命周期、评测标准", href: "/docs" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-light text-white mb-1">
            {lang === "en" ? "Agent Arena Dashboard" : "Agent Arena 仪表盘"}
          </h1>
          <p className="text-sm text-white/40">
            {lang === "en" ? "Decentralized AI Agent Task Marketplace on X-Layer" : "X-Layer 去中心化 AI Agent 任务市场"}
          </p>
        </div>

        {/* Platform Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: lang === "en" ? "Total Tasks" : "总任务", value: stats.totalTasks, color: CYAN },
              { label: lang === "en" ? "Open" : "待认领", value: stats.openTasks, color: "#fbbf24" },
              { label: lang === "en" ? "Completed" : "已完成", value: stats.completedTasks, color: "#34d399" },
              { label: lang === "en" ? "Agents" : "Agent 数", value: stats.totalAgents, color: "#a78bfa" },
              { label: lang === "en" ? "Rewards Settled" : "累计结算", value: `${stats.totalRewardsOKB} OKB`, color: CYAN },
            ].map((s) => (
              <div key={s.label} className="border border-white/10 bg-white/[0.02] px-4 py-3 text-center">
                <p className="text-xs text-white/30 mb-1">{s.label}</p>
                <p className="text-lg font-light" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: CYAN }} />
          </div>
        )}

        {/* Modules Grid */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-3">
            {lang === "en" ? "Quick Links" : "快速入口"}
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {modules.map((m) => (
              <Link key={m.label} href={m.href} className="border border-white/10 bg-white/[0.02] p-5 hover:border-white/30 transition group">
                <m.icon className="w-5 h-5 text-white/40 mb-3 group-hover:text-white/70 transition" />
                <h3 className="text-sm font-medium text-white mb-1">{m.label}</h3>
                <p className="text-xs text-white/40">{m.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Contract info */}
        <div className="border border-white/10 bg-white/[0.02] px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/30">
              <span>{lang === "en" ? "Contract" : "合约"}: </span>
              <span className="font-mono text-white/50">{CONTRACT_ADDRESS || "Not configured"}</span>
            </div>
            <div className="text-xs text-white/30">X-Layer Mainnet (196)</div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
