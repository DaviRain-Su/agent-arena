"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ethers } from "ethers";
import { DashboardLayout } from "@/components/DashboardLayout";
import { getContract, formatOKB, shortenAddress, STATUS_LABELS, STATUS_LABELS_ZH } from "@/lib/contracts";
import { useLangStore } from "@/store/lang";
import { ArrowLeft, Trophy, CheckCircle, Clock, XCircle } from "lucide-react";

const CYAN = "#1de1f1";

interface AgentDetail {
  wallet: string;
  owner: string;
  agentId: string;
  metadata: string;
  capabilities: string[];
  registered: boolean;
  tasksCompleted: number;
  tasksAttempted: number;
  totalScore: number;
  avgScore: number;
  winRate: number;
}

interface TaskRecord {
  id: number;
  description: string;
  reward: bigint;
  status: number;
  score: number;
  winner: string;
  role: "applicant" | "assigned" | "winner";
}

const realmLabel = (score: number) => {
  if (score >= 81) return { en: "God Transformation", zh: "化神期", color: "#7c3aed" };
  if (score >= 61) return { en: "Nascent Soul", zh: "元婴期", color: "#2563eb" };
  if (score >= 41) return { en: "Core Formation", zh: "结丹期", color: "#059669" };
  if (score >= 21) return { en: "Foundation", zh: "筑基期", color: "#d97706" };
  return { en: "Qi Refining", zh: "练气期", color: "#6b7280" };
};

export default function AgentDetailPage() {
  const params = useParams();
  const agentAddress = params.address as string;
  const { lang } = useLangStore();

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!agentAddress || !ethers.isAddress(agentAddress)) return;
    setLoading(true);
    try {
      const rpc = new ethers.JsonRpcProvider("https://rpc.xlayer.tech");
      const contract = getContract(rpc);

      const [info, rep] = await Promise.all([
        contract.agents(agentAddress),
        contract.getAgentReputation(agentAddress),
      ]);

      if (!info.registered) {
        setAgent(null);
        setLoading(false);
        return;
      }

      let capabilities: string[] = [];
      try {
        const m = JSON.parse(info.metadata);
        capabilities = Array.isArray(m.capabilities) ? m.capabilities : [];
      } catch { /* ignore */ }

      setAgent({
        wallet: agentAddress,
        owner: info.owner,
        agentId: info.agentId,
        metadata: info.metadata,
        capabilities,
        registered: info.registered,
        tasksCompleted: Number(rep.completed),
        tasksAttempted: Number(rep.attempted),
        totalScore: Number(info.totalScore),
        avgScore: Number(rep.avgScore),
        winRate: Number(rep.winRate),
      });

      // Load task history — parallel fetch for all tasks
      const taskCount = Number(await contract.taskCount());
      const indices = Array.from({ length: taskCount }, (_, i) => i);
      const allTasks = await Promise.all(
        indices.map(i => Promise.all([contract.tasks(i), contract.getApplicants(i)]))
      );
      const taskRecords: TaskRecord[] = [];
      for (const [t, applicants] of allTasks) {
        const isApplicant = (applicants as string[]).some(
          (a: string) => a.toLowerCase() === agentAddress.toLowerCase()
        );
        const isAssigned = t.assignedAgent.toLowerCase() === agentAddress.toLowerCase();
        const isWinner = t.winner.toLowerCase() === agentAddress.toLowerCase();
        if (!isApplicant && !isAssigned && !isWinner) continue;
        taskRecords.push({
          id: Number(t.id),
          description: t.description,
          reward: t.reward,
          status: Number(t.status),
          score: Number(t.score),
          winner: t.winner,
          role: isWinner ? "winner" : isAssigned ? "assigned" : "applicant",
        });
      }
      setTasks(taskRecords.reverse());
    } catch (e) {
      console.error("Load agent failed", e);
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

  if (!agent) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 space-y-4">
          <p className="text-white/40">{lang === "en" ? "Agent not found" : "未找到 Agent"}</p>
          <a href="/arena" className="text-xs hover:underline" style={{ color: CYAN }}>
            ← {lang === "en" ? "Back to Arena" : "返回竞技场"}
          </a>
        </div>
      </DashboardLayout>
    );
  }

  const realm = realmLabel(agent.avgScore);
  const statusLabels = lang === "en" ? STATUS_LABELS : STATUS_LABELS_ZH;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 py-6">
        {/* Back link */}
        <a href="/arena" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition">
          <ArrowLeft className="w-3 h-3" />
          {lang === "en" ? "Back to Arena" : "返回竞技场"}
        </a>

        {/* Header */}
        <div className="border border-white/10 p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-light text-white">{agent.agentId}</h1>
              <p className="text-xs font-mono text-white/30 mt-1">{agent.wallet}</p>
            </div>
            <span className="text-sm px-3 py-1 border" style={{ borderColor: `${realm.color}60`, color: realm.color }}>
              {lang === "en" ? realm.en : realm.zh}
            </span>
          </div>

          {agent.owner !== ethers.ZeroAddress && (
            <div className="text-xs">
              <span className="text-white/30">{lang === "en" ? "Owner: " : "主钱包: "}</span>
              <span className="font-mono text-white/50">{agent.owner}</span>
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

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: lang === "en" ? "Avg Score" : "平均分", value: agent.avgScore, color: CYAN },
            { label: lang === "en" ? "Completed" : "完成", value: agent.tasksCompleted, color: "#34d399" },
            { label: lang === "en" ? "Attempted" : "尝试", value: agent.tasksAttempted, color: "#fbbf24" },
            { label: lang === "en" ? "Win Rate" : "胜率", value: `${agent.winRate}%`, color: "#a78bfa" },
          ].map(s => (
            <div key={s.label} className="border border-white/10 px-4 py-3 text-center">
              <p className="text-xs text-white/30 mb-1">{s.label}</p>
              <p className="text-lg font-light" style={{ color: s.color }}>{s.value}</p>
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

        {/* Task history */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-3">
            {lang === "en" ? "Task History" : "任务记录"}
          </h2>
          {tasks.length === 0 ? (
            <div className="border border-white/10 px-4 py-8 text-center text-xs text-white/20">
              {lang === "en" ? "No task history" : "暂无任务记录"}
            </div>
          ) : (
            <div className="border border-white/10 divide-y divide-white/5">
              {tasks.map(t => {
                const roleIcon = t.role === "winner" ? <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                  : t.role === "assigned" ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  : <Clock className="w-3.5 h-3.5 text-white/30" />;
                const roleLabel = t.role === "winner" ? (lang === "en" ? "Winner" : "获胜")
                  : t.role === "assigned" ? (lang === "en" ? "Assigned" : "执行中")
                  : (lang === "en" ? "Applied" : "已申请");
                return (
                  <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                    {roleIcon}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/60 truncate">
                        <span className="text-white/30">#{t.id}</span> {t.description.slice(0, 80)}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-white/25">
                        <span>{statusLabels[t.status]}</span>
                        {t.score > 0 && <span>{lang === "en" ? "Score" : "分"}: {t.score}</span>}
                        <span>{formatOKB(t.reward)}</span>
                      </div>
                    </div>
                    <span className="text-xs text-white/20 shrink-0">{roleLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
