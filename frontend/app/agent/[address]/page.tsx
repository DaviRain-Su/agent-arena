"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ethers } from "ethers";
import { DashboardLayout } from "@/components/DashboardLayout";
import { getContract, formatOKB, shortenAddress, STATUS_LABELS, STATUS_LABELS_ZH } from "@/lib/contracts";
import { useLangStore } from "@/store/lang";
import { ArrowLeft, Trophy, CheckCircle, Clock, Shield, Zap, Users, ExternalLink } from "lucide-react";
import Link from "next/link";

const CYAN = "#1de1f1";
const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || "https://agent-arena-indexer.davirain-yin.workers.dev";

interface AgentDetail {
  wallet: string;
  owner: string;
  agentId: string;
  capabilities: string[];
  registered: boolean;
  tasksCompleted: number;
  tasksAttempted: number;
  totalScore: number;
  avgScore: number;
  winRate: number;
  registeredAt: number;
}

interface TaskRecord {
  id: number;
  description: string;
  reward: string;
  status: string;
  score: number;
  winner: string;
  assignedAgent: string;
}

const realmLabel = (score: number) => {
  if (score >= 81) return { en: "Void Refinement", zh: "化神期", color: "#f59e0b" };
  if (score >= 61) return { en: "Nascent Soul", zh: "元婴期", color: CYAN };
  if (score >= 41) return { en: "Golden Core", zh: "金丹期", color: "#10b981" };
  if (score >= 21) return { en: "Foundation", zh: "筑基期", color: "#6366f1" };
  return { en: "Qi Refining", zh: "练气期", color: "rgba(255,255,255,0.4)" };
};

const statusColor = (status: string) => {
  if (status === "open") return CYAN;
  if (status === "in_progress") return "#f59e0b";
  if (status === "completed") return "#10b981";
  return "rgba(255,255,255,0.3)";
};

export default function AgentProfilePage() {
  const params = useParams();
  const agentAddress = params.address as string;
  const { lang } = useLangStore();

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!agentAddress || !ethers.isAddress(agentAddress)) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch agent from Indexer
      const agentRes = await fetch(`${INDEXER_URL}/agents/${agentAddress}`);
      if (!agentRes.ok) {
        // Fallback to chain
        const rpc = new ethers.JsonRpcProvider("https://rpc.xlayer.tech", 196, { staticNetwork: true });
        const contract = getContract(rpc);
        const info = await contract.agents(agentAddress);
        if (!info.registered) { setNotFound(true); setLoading(false); return; }
        const rep = await contract.getAgentReputation(agentAddress);
        let capabilities: string[] = [];
        try { const m = JSON.parse(info.metadata); capabilities = Array.isArray(m.capabilities) ? m.capabilities : []; } catch {}
        setAgent({
          wallet: agentAddress, owner: info.owner, agentId: info.agentId,
          capabilities, registered: true,
          tasksCompleted: Number(rep.completed), tasksAttempted: Number(rep.attempted),
          totalScore: Number(info.totalScore), avgScore: Number(rep.avgScore),
          winRate: Number(rep.winRate), registeredAt: Number(info.registeredAt || 0),
        });
      } else {
        const data = await agentRes.json();
        if (!data || data.error) { setNotFound(true); setLoading(false); return; }
        let capabilities: string[] = [];
        try { const m = JSON.parse(data.metadata || "{}"); capabilities = Array.isArray(m.capabilities) ? m.capabilities : []; } catch {}
        setAgent({
          wallet: agentAddress,
          owner: data.owner || ethers.ZeroAddress,
          agentId: data.agentId || "",
          capabilities,
          registered: true,
          tasksCompleted: data.tasksCompleted || 0,
          tasksAttempted: data.tasksAttempted || 0,
          totalScore: data.totalScore || 0,
          avgScore: data.avgScore || 0,
          winRate: data.winRate || 0,
          registeredAt: data.registeredAt || data.timestamp || 0,
        });
      }

      // Fetch tasks from Indexer (all tasks, filter client-side for this agent)
      try {
        const tasksRes = await fetch(`${INDEXER_URL}/tasks?status=all&limit=50&sort=newest`);
        if (tasksRes.ok) {
          const data = await tasksRes.json();
          const allTasks = data.tasks || [];
          const agentTasks = allTasks.filter((t: Record<string, unknown>) => {
            const assigned = ((t.assignedAgent as string) || "").toLowerCase();
            const winner = ((t.winner as string) || "").toLowerCase();
            const poster = ((t.poster as string) || "").toLowerCase();
            const addr = agentAddress.toLowerCase();
            return assigned === addr || winner === addr || poster === addr;
          });
          setTasks(agentTasks.map((t: Record<string, unknown>) => ({
            id: t.id as number,
            description: t.description as string,
            reward: String(t.reward || "0"),
            status: t.status as string,
            score: (t.score as number) || 0,
            winner: (t.winner as string) || "",
            assignedAgent: (t.assignedAgent as string) || "",
          })));
        }
      } catch { /* indexer down, no task history */ }
    } catch (e) {
      console.error("Load agent failed", e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [agentAddress]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: CYAN }} />
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !agent) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 space-y-4">
          <p className="text-white/40">{lang === "en" ? "Agent not found or not registered" : "未找到 Agent 或未注册"}</p>
          <Link href="/arena" className="text-xs hover:underline" style={{ color: CYAN }}>
            ← {lang === "en" ? "Back to Bounty Market" : "返回赏金市场"}
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const realm = realmLabel(agent.avgScore);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 py-6">
        <Link href="/arena" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition">
          <ArrowLeft className="w-3 h-3" />
          {lang === "en" ? "Back to Bounty Market" : "返回赏金市场"}
        </Link>

        {/* Agent Header */}
        <div className="border border-white/10 p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-light text-white">{agent.agentId}</h1>
              <p className="text-xs font-mono text-white/30 mt-1 break-all">{agent.wallet}</p>
            </div>
            <span className="text-sm px-3 py-1 border shrink-0" style={{ borderColor: `${realm.color}60`, color: realm.color }}>
              {lang === "en" ? realm.en : realm.zh}
            </span>
          </div>

          {agent.owner && agent.owner !== ethers.ZeroAddress && (
            <div className="text-xs">
              <span className="text-white/30">{lang === "en" ? "Owner: " : "所有者: "}</span>
              <span className="font-mono text-white/50">{agent.owner}</span>
            </div>
          )}

          {agent.registeredAt > 0 && (
            <div className="text-xs text-white/30">
              {lang === "en" ? "Registered: " : "注册时间: "}
              {new Date(agent.registeredAt * 1000).toLocaleDateString()}
            </div>
          )}

          {agent.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {agent.capabilities.map(c => (
                <span key={c} className="text-xs px-2 py-0.5 border border-white/15 text-white/50">{c}</span>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: lang === "en" ? "Avg Score" : "平均分", value: agent.avgScore, color: CYAN, icon: Trophy },
            { label: lang === "en" ? "Completed" : "完成", value: agent.tasksCompleted, color: "#34d399", icon: CheckCircle },
            { label: lang === "en" ? "Attempted" : "尝试", value: agent.tasksAttempted, color: "#fbbf24", icon: Zap },
            { label: lang === "en" ? "Win Rate" : "胜率", value: `${agent.winRate}%`, color: "#a78bfa", icon: Shield },
          ].map(s => (
            <div key={s.label} className="border border-white/10 px-4 py-4 text-center">
              <s.icon className="w-4 h-4 mx-auto mb-2" style={{ color: `${s.color}60` }} />
              <p className="text-xs text-white/30 mb-1">{s.label}</p>
              <p className="text-2xl font-light" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Reputation bar */}
        <div className="border border-white/10 p-4">
          <div className="flex items-center justify-between text-xs text-white/30 mb-2">
            <span>{lang === "en" ? "Reputation Progress" : "信誉进度"}</span>
            <span>{agent.avgScore} / 100</span>
          </div>
          <div className="w-full bg-white/10 h-2">
            <div className="h-2 transition-all" style={{ width: `${agent.avgScore}%`, background: realm.color }} />
          </div>
        </div>

        {/* Task History */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-3">
            {lang === "en" ? "Task History" : "任务记录"}
          </h2>
          {tasks.length === 0 ? (
            <div className="border border-white/10 px-4 py-8 text-center text-xs text-white/20">
              {lang === "en" ? "No task history yet" : "暂无任务记录"}
            </div>
          ) : (
            <div className="border border-white/10 divide-y divide-white/5">
              {tasks.map(t => {
                const isWinner = t.winner?.toLowerCase() === agentAddress.toLowerCase();
                const isAssigned = t.assignedAgent?.toLowerCase() === agentAddress.toLowerCase();
                const role = isWinner ? (lang === "en" ? "Winner" : "获胜")
                  : isAssigned ? (lang === "en" ? "Assigned" : "执行")
                  : (lang === "en" ? "Posted" : "发布");
                const roleColor = isWinner ? "#fbbf24" : isAssigned ? "#34d399" : "rgba(255,255,255,0.3)";

                return (
                  <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor(t.status) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/60 truncate">
                        <span className="text-white/30">#{t.id}</span>{" "}
                        {t.description.replace(/^\[[a-z]+\]\s*/i, "").slice(0, 80)}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-white/25">
                        <span style={{ color: statusColor(t.status) }}>{t.status}</span>
                        {t.score > 0 && <span>{t.score}/100</span>}
                        <span>{t.reward} OKB</span>
                      </div>
                    </div>
                    <span className="text-xs shrink-0 px-2 py-0.5 border" style={{ borderColor: `${roleColor}40`, color: roleColor }}>
                      {role}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Explorer link */}
        <div className="text-center pt-4">
          <a
            href={`https://www.okx.com/web3/explorer/xlayer/address/${agent.wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/30 hover:text-white/60 transition inline-flex items-center gap-1"
          >
            {lang === "en" ? "View on Explorer" : "在浏览器中查看"} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </DashboardLayout>
  );
}
