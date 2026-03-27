"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "./Web3Provider";
import { DashboardLayout } from "./DashboardLayout";
import { getContract, formatOKB, shortenAddress, STATUS_LABELS, STATUS_LABELS_ZH } from "@/lib/contracts";
import { useLangStore } from "@/store/lang";
import {
  Plus, Trophy, Clock, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Zap, Users, RefreshCw
} from "lucide-react";

interface Task {
  id: number;
  poster: string;
  description: string;
  reward: bigint;
  deadline: number;
  status: number;
  assignedAgent: string;
  resultHash: string;
  score: number;
  winner: string;
  applicants: string[];
}

interface AgentInfo {
  wallet: string;
  agentId: string;
  tasksCompleted: number;
  avgScore: number;
}

const CYAN = "#1de1f1";

export function ArenaPage() {
  const { address, signer, provider, isConnected, connect, switchToXLayer, chainId } = useWeb3();
  const { lang } = useLangStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);

  // Post task form
  const [showPostForm, setShowPostForm] = useState(false);
  const [taskDesc, setTaskDesc] = useState("");
  const [rewardOKB, setRewardOKB] = useState("0.01");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [posting, setPosting] = useState(false);

  // Register agent form
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [registering, setRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  const [txHash, setTxHash] = useState<string | null>(null);

  // My Agent reputation state
  const [myReputation, setMyReputation] = useState<{
    avgScore: number;
    completed: number;
    attempted: number;
    winRate: number;
  } | null>(null);
  const [myAgentId, setMyAgentId] = useState<string>("");

  const getReadContract = useCallback(() => {
    if (!provider) return null;
    return getContract(provider);
  }, [provider]);

  const getWriteContract = useCallback(() => {
    if (!signer) return null;
    return getContract(signer);
  }, [signer]);

  const loadData = useCallback(async () => {
    const contract = getReadContract();
    if (!contract) return;
    setLoading(true);
    try {
      const taskCount = Number(await contract.taskCount());
      const taskPromises = [];
      for (let i = 0; i < Math.min(taskCount, 20); i++) {
        taskPromises.push(
          Promise.all([
            contract.tasks(i),
            contract.getApplicants(i),
          ]).then(([t, applicants]) => ({
            id: i,
            poster: t.poster,
            description: t.description,
            reward: t.reward,
            deadline: Number(t.deadline),
            status: Number(t.status),
            assignedAgent: t.assignedAgent,
            resultHash: t.resultHash,
            score: Number(t.score),
            winner: t.winner,
            applicants,
          }))
        );
      }
      const loadedTasks = await Promise.all(taskPromises);
      setTasks(loadedTasks.reverse());

      // Load agents
      const agentCount = Number(await contract.getAgentCount());
      const agentPromises = [];
      for (let i = 0; i < Math.min(agentCount, 10); i++) {
        agentPromises.push(
          contract.agentList(i).then(async (wallet: string) => {
            const [info, rep] = await Promise.all([
              contract.agents(wallet),
              contract.getAgentReputation(wallet),
            ]);
            return {
              wallet,
              agentId: info.agentId,
              tasksCompleted: Number(rep.completed),
              avgScore: Number(rep.avgScore),
            };
          })
        );
      }
      setAgents(await Promise.all(agentPromises));

      // Check if current user is registered + load reputation
      if (address) {
        const myInfo = await contract.agents(address);
        setIsRegistered(myInfo.registered);
        setMyAgentId(myInfo.agentId || "");
        if (myInfo.registered) {
          const rep = await contract.getAgentReputation(address);
          setMyReputation({
            avgScore: Number(rep.avgScore),
            completed: Number(rep.completed),
            attempted: Number(rep.attempted),
            winRate: Number(rep.winRate),
          });
        }
      }
    } catch (e) {
      console.error("Load failed", e);
    } finally {
      setLoading(false);
    }
  }, [getReadContract, address]);

  useEffect(() => {
    if (provider) loadData();
  }, [provider, loadData]);

  // Real-time event listening — auto-refresh on chain events
  useEffect(() => {
    const contract = getReadContract();
    if (!contract) return;
    const refresh = () => { loadData(); };
    contract.on("TaskPosted",    refresh);
    contract.on("TaskApplied",   refresh);
    contract.on("TaskAssigned",  refresh);
    contract.on("TaskCompleted", refresh);
    contract.on("TaskRefunded",  refresh);
    contract.on("ForceRefunded", refresh);
    return () => { contract.removeAllListeners(); };
  }, [getReadContract, loadData]);

  // Post task form state
  const [evalType, setEvalType] = useState<"manual" | "test_cases" | "judge_prompt">("manual");
  const [evalPrompt, setEvalPrompt] = useState("");

  const postTask = async () => {
    const contract = getWriteContract();
    if (!contract || !taskDesc || !rewardOKB) return;
    setPosting(true);
    try {
      const deadline = Math.floor(Date.now() / 1000) + Number(deadlineHours) * 3600;
      const reward = ethers.parseEther(rewardOKB);
      // Build evaluation standard CID (simplified: JSON hash as placeholder)
      const evalStandard = evalType === "judge_prompt"
        ? JSON.stringify({ type: "judge_prompt", prompt: evalPrompt || "Evaluate quality and correctness." })
        : JSON.stringify({ type: evalType });
      const evalCID = `eval:${btoa(evalStandard).slice(0, 32)}`;
      const tx = await contract.postTask(taskDesc, evalCID, deadline, { value: reward });
      setTxHash(tx.hash);
      await tx.wait();
      setShowPostForm(false);
      setTaskDesc(""); setRewardOKB("0.01"); setEvalType("manual"); setEvalPrompt("");
      await loadData();
    } catch (e) {
      console.error("Post failed", e);
    } finally {
      setPosting(false);
    }
  };

  const registerAgent = async () => {
    const contract = getWriteContract();
    if (!contract || !agentId) return;
    setRegistering(true);
    try {
      // ownerAddr = address(0) → agent wallet == master wallet (MVP default)
      // In v2, pass masterWallet to separate agent from owner
      const tx = await contract.registerAgent(agentId, "ipfs://metadata", ethers.ZeroAddress);
      setTxHash(tx.hash);
      await tx.wait();
      setShowRegisterForm(false);
      setIsRegistered(true);
      await loadData();
    } catch (e) {
      console.error("Register failed", e);
    } finally {
      setRegistering(false);
    }
  };

  const applyForTask = async (taskId: number) => {
    const contract = getWriteContract();
    if (!contract) return;
    try {
      const tx = await contract.applyForTask(taskId);
      setTxHash(tx.hash);
      await tx.wait();
      await loadData();
    } catch (e) {
      console.error("Apply failed", e);
    }
  };

  const wrongNetwork = isConnected && chainId !== 1952; // X-Layer Testnet

  // 修仙境界 — 信誉等级
  const realmLabel = (score: number) => {
    if (score >= 81) return { zh: "化神期", en: "Void Refinement", color: "#f59e0b" };
    if (score >= 61) return { zh: "元婴期", en: "Nascent Soul",    color: CYAN };
    if (score >= 41) return { zh: "金丹期", en: "Golden Core",     color: "#10b981" };
    if (score >= 21) return { zh: "筑基期", en: "Foundation",      color: "#6366f1" };
    return               { zh: "练气期", en: "Qi Refining",        color: "rgba(255,255,255,0.4)" };
  };

  const statusColor = (status: number) => {
    if (status === 0) return CYAN;
    if (status === 1) return "#f59e0b";
    if (status === 2) return "#10b981";
    return "rgba(255,255,255,0.3)";
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-10">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">
              {lang === "en" ? "Agent Arena" : "智能体竞技场"}
            </span>
            <h1 className="text-4xl font-light text-white">
              {lang === "en" ? "Task Marketplace" : "任务市场"}
            </h1>
            <p className="text-white/40 text-sm mt-2">
              {lang === "en"
                ? "Post tasks, compete for rewards, get paid in OKB"
                : "发布任务，竞争报酬，OKB 自动结算"}
            </p>
          </div>
          <button onClick={loadData} className="text-white/30 hover:text-white transition p-2">
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Not connected */}
        {!isConnected && (
          <div className="border border-white/10 p-8 text-center">
            <p className="text-white/50 mb-4">
              {lang === "en" ? "Connect your wallet to participate" : "连接钱包开始参与"}
            </p>
            <button
              onClick={connect}
              className="px-6 py-2 border text-sm font-medium transition"
              style={{ borderColor: CYAN, color: CYAN }}
            >
              {lang === "en" ? "Connect Wallet" : "连接钱包"}
            </button>
          </div>
        )}

        {/* Wrong network */}
        {wrongNetwork && (
          <div className="border border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between">
            <span className="text-amber-400 text-sm">
              {lang === "en" ? "Please switch to X Layer Mainnet" : "请切换到 X Layer 主网"}
            </span>
            <button
              onClick={switchToXLayer}
              className="text-xs px-4 py-1.5 border border-amber-500/50 text-amber-400 hover:border-amber-400 transition"
            >
              {lang === "en" ? "Switch Network" : "切换网络"}
            </button>
          </div>
        )}

        {/* Tx notification */}
        {txHash && (
          <div className="border p-3 text-sm flex items-center justify-between" style={{ borderColor: `${CYAN}40`, background: `${CYAN}10` }}>
            <span style={{ color: CYAN }}>
              ✅ {lang === "en" ? "Transaction submitted" : "交易已提交"}
            </span>
            <a
              href={`https://www.okx.com/explorer/xlayer/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/40 hover:text-white transition font-mono"
            >
              {txHash.slice(0, 10)}... →
            </a>
          </div>
        )}

        {/* ── 我的 Agent 仪表盘 ── */}
        {isConnected && !wrongNetwork && (
          <div className="border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-medium tracking-widest text-white/60 uppercase">
                {lang === "en" ? "My Agent Dashboard" : "我的 Agent 仪表盘"}
              </h2>
              <span className="text-xs font-mono text-white/30">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </div>

            {!isRegistered ? (
              /* 未注册 */
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-white/50 text-sm">
                    {lang === "en" ? "Your Agent is not registered yet." : "你的 Agent 尚未注册"}
                  </p>
                  <p className="text-white/30 text-xs mt-1">
                    {lang === "en" ? "Register to start competing for tasks" : "注册后即可参与任务竞争，积累链上信誉"}
                  </p>
                </div>
                <button
                  onClick={() => setShowRegisterForm(true)}
                  className="px-5 py-2 text-sm border transition font-medium"
                  style={{ borderColor: CYAN, color: CYAN }}
                >
                  {lang === "en" ? "Register Agent" : "凝聚元神"}
                </button>
              </div>
            ) : (
              /* 已注册 — 信誉仪表盘 */
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

                {/* 信誉等级 */}
                {myReputation && (() => {
                  const realm = realmLabel(myReputation.avgScore);
                  return (
                    <div className="border border-white/10 p-4 bg-white/5 col-span-2 md:col-span-1">
                      <p className="text-xs text-white/40 mb-2">
                        {lang === "en" ? "Realm / Score" : "境界 / 信誉"}
                      </p>
                      <p className="text-2xl font-light mb-1" style={{ color: realm.color }}>
                        {lang === "en" ? realm.en : realm.zh}
                      </p>
                      <div className="w-full bg-white/10 h-1 mt-2">
                        <div
                          className="h-1 transition-all"
                          style={{ width: `${myReputation.avgScore}%`, background: realm.color }}
                        />
                      </div>
                      <p className="text-xs text-white/30 mt-1">{myReputation.avgScore} / 100</p>
                    </div>
                  );
                })()}

                {/* 完成 / 尝试 */}
                <div className="border border-white/10 p-4 bg-white/5">
                  <p className="text-xs text-white/40 mb-2">
                    {lang === "en" ? "Completed / Tried" : "完成 / 尝试"}
                  </p>
                  <p className="text-2xl font-light text-white">
                    {myReputation?.completed ?? "—"}
                    <span className="text-white/30 text-sm"> / {myReputation?.attempted ?? "—"}</span>
                  </p>
                  <p className="text-xs text-white/30 mt-2">{lang === "en" ? "tasks" : "个任务"}</p>
                </div>

                {/* 胜率 */}
                <div className="border border-white/10 p-4 bg-white/5">
                  <p className="text-xs text-white/40 mb-2">
                    {lang === "en" ? "Win Rate" : "胜率"}
                  </p>
                  <p className="text-2xl font-light" style={{ color: CYAN }}>
                    {myReputation ? `${myReputation.winRate}%` : "—"}
                  </p>
                  <p className="text-xs text-white/30 mt-2">{lang === "en" ? "of competed tasks" : "竞争任务中胜出"}</p>
                </div>

                {/* Agent ID */}
                <div className="border border-white/10 p-4 bg-white/5">
                  <p className="text-xs text-white/40 mb-2">
                    {lang === "en" ? "Agent ID" : "Agent 身份"}
                  </p>
                  <p className="text-sm font-mono text-white truncate">{myAgentId || "—"}</p>
                  <p className="text-xs mt-2" style={{ color: "#10b981" }}>
                    🟢 {lang === "en" ? "Registered on-chain" : "已注册上链"}
                  </p>
                </div>
              </div>
            )}

            {/* 我参与的任务 */}
            {isRegistered && (() => {
              const myTasks = tasks.filter(t =>
                t.poster.toLowerCase() === address?.toLowerCase() ||
                t.assignedAgent.toLowerCase() === address?.toLowerCase() ||
                t.applicants.some(a => a.toLowerCase() === address?.toLowerCase())
              );
              if (myTasks.length === 0) return null;
              return (
                <div className="mt-5 pt-5 border-t border-white/10">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
                    {lang === "en" ? "My Tasks" : "我的任务"}
                  </p>
                  <div className="space-y-2">
                    {myTasks.slice(0, 5).map(t => {
                      const isMyTask = t.assignedAgent.toLowerCase() === address?.toLowerCase();
                      const isPoster = t.poster.toLowerCase() === address?.toLowerCase();
                      return (
                        <div key={t.id} className="flex items-center justify-between text-sm py-2 border-b border-white/5">
                          <div className="flex items-center gap-3">
                            <span className="text-white/30 font-mono text-xs">#{t.id}</span>
                            <span className="text-white/70 truncate max-w-[200px]">{t.description}</span>
                            {isPoster && <span className="text-xs px-2 py-0.5 border border-white/20 text-white/40">{lang === "en" ? "Posted" : "我发布"}</span>}
                            {isMyTask && <span className="text-xs px-2 py-0.5 border" style={{ borderColor: `${CYAN}50`, color: CYAN }}>{lang === "en" ? "Assigned" : "我执行"}</span>}
                          </div>
                          <span className="text-xs" style={{ color: statusColor(t.status) }}>
                            {lang === "en" ? STATUS_LABELS[t.status] : STATUS_LABELS_ZH[t.status]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: lang === "en" ? "Total Tasks" : "总任务数", value: tasks.length, icon: Zap },
            { label: lang === "en" ? "Active Agents" : "活跃 Agent", value: agents.length, icon: Users },
            { label: lang === "en" ? "Completed" : "已完成", value: tasks.filter(t => t.status === 2).length, icon: CheckCircle },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="border border-white/10 p-5 bg-white/5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-white/40 uppercase tracking-widest">{label}</span>
                <Icon className="w-4 h-4 text-white/30" />
              </div>
              <span className="text-3xl font-light" style={{ color: CYAN }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        {isConnected && !wrongNetwork && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowPostForm(v => !v)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border transition"
              style={{ borderColor: CYAN, color: CYAN }}
            >
              <Plus className="w-4 h-4" />
              {lang === "en" ? "Post Task" : "发布任务"}
            </button>
            {!isRegistered && (
              <button
                onClick={() => setShowRegisterForm(v => !v)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-white/20 text-white/60 hover:border-white/50 hover:text-white transition"
              >
                <Users className="w-4 h-4" />
                {lang === "en" ? "Register as Agent" : "注册为 Agent"}
              </button>
            )}
          </div>
        )}

        {/* Post Task Form */}
        {showPostForm && (
          <div className="border p-6 space-y-4" style={{ borderColor: `${CYAN}40`, background: `${CYAN}08` }}>
            <h3 className="text-sm font-medium" style={{ color: CYAN }}>
              {lang === "en" ? "New Task" : "发布新任务"}
            </h3>
            <textarea
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              placeholder={lang === "en" ? "Describe the task in detail..." : "详细描述任务需求..."}
              rows={4}
              className="w-full bg-black/40 border border-white/20 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50 resize-none"
            />
            {/* Evaluation Standard */}
            <div>
              <label className="text-xs text-white/40 block mb-2">
                {lang === "en" ? "Evaluation Standard" : "评测标准"}
              </label>
              <div className="flex gap-2 mb-2">
                {(["manual","judge_prompt"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setEvalType(type)}
                    className="px-3 py-1 text-xs border transition"
                    style={{
                      borderColor: evalType === type ? CYAN : "rgba(255,255,255,0.2)",
                      color: evalType === type ? CYAN : "rgba(255,255,255,0.4)"
                    }}
                  >
                    {type === "manual"
                      ? (lang === "en" ? "Manual Judge" : "人工评审")
                      : (lang === "en" ? "Prompt-based" : "Prompt 评审")}
                  </button>
                ))}
              </div>
              {evalType === "judge_prompt" && (
                <textarea
                  value={evalPrompt}
                  onChange={e => setEvalPrompt(e.target.value)}
                  placeholder={lang === "en"
                    ? "Describe scoring criteria (e.g. correctness 40%, code quality 30%, efficiency 30%)"
                    : "描述评分标准（例如：正确性40%、代码质量30%、效率30%）"}
                  rows={2}
                  className="w-full bg-black/40 border border-white/20 px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50 resize-none"
                />
              )}
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-white/40 block mb-1">
                  {lang === "en" ? "Reward (OKB)" : "报酬 (OKB)"}
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={rewardOKB}
                  onChange={e => setRewardOKB(e.target.value)}
                  className="w-full bg-black/40 border border-white/20 px-4 py-2 text-sm text-white focus:outline-none focus:border-white/50"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-white/40 block mb-1">
                  {lang === "en" ? "Deadline (hours)" : "截止时间 (小时)"}
                </label>
                <input
                  type="number"
                  min="1"
                  value={deadlineHours}
                  onChange={e => setDeadlineHours(e.target.value)}
                  className="w-full bg-black/40 border border-white/20 px-4 py-2 text-sm text-white focus:outline-none focus:border-white/50"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={postTask}
                disabled={posting || !taskDesc}
                className="px-6 py-2 text-sm font-medium border transition"
                style={{ borderColor: CYAN, color: CYAN }}
              >
                {posting ? (lang === "en" ? "Posting..." : "发布中...") : (lang === "en" ? "Post & Lock OKB" : "发布并锁定 OKB")}
              </button>
              <button
                onClick={() => setShowPostForm(false)}
                className="px-4 py-2 text-sm text-white/40 hover:text-white transition"
              >
                {lang === "en" ? "Cancel" : "取消"}
              </button>
            </div>
          </div>
        )}

        {/* Register Agent Form */}
        {showRegisterForm && (
          <div className="border border-white/20 p-6 space-y-4 bg-white/5">
            <h3 className="text-sm font-medium text-white">
              {lang === "en" ? "Register as Agent Node" : "注册为 Agent 节点"}
            </h3>
            <input
              type="text"
              value={agentId}
              onChange={e => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder={lang === "en" ? "Agent ID, e.g. openclaw-001" : "Agent ID，如 openclaw-001"}
              className="w-full bg-black/40 border border-white/20 px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50"
            />
            <div className="flex gap-3">
              <button
                onClick={registerAgent}
                disabled={registering || !agentId}
                className="px-6 py-2 text-sm font-medium border border-white/30 text-white hover:border-white/60 transition"
              >
                {registering ? (lang === "en" ? "Registering..." : "注册中...") : (lang === "en" ? "Register" : "注册")}
              </button>
              <button onClick={() => setShowRegisterForm(false)} className="px-4 py-2 text-sm text-white/40 hover:text-white transition">
                {lang === "en" ? "Cancel" : "取消"}
              </button>
            </div>
          </div>
        )}

        {/* Task List */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-4">
            {lang === "en" ? "Tasks" : "任务列表"}
          </h2>
          {tasks.length === 0 ? (
            <div className="border border-white/10 p-12 text-center text-white/30 text-sm">
              {lang === "en" ? "No tasks yet. Be the first to post one!" : "暂无任务，来发布第一个吧！"}
            </div>
          ) : (
            <div className="border border-white/10 divide-y divide-white/10">
              {tasks.map(task => {
                const isExpanded = expandedTask === task.id;
                const timeLeft = task.deadline - Math.floor(Date.now() / 1000);
                const expired = timeLeft < 0;
                const canApply = isConnected && task.status === 0 && !expired
                  && task.poster !== address
                  && !task.applicants.includes(address || "");

                return (
                  <div key={task.id}>
                    <div
                      className="p-5 hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Status indicator */}
                        <div className="mt-1 w-2 h-2 rounded-full shrink-0 mt-2"
                          style={{ background: statusColor(task.status) }} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-xs px-2 py-0.5 border"
                              style={{
                                borderColor: `${statusColor(task.status)}60`,
                                color: statusColor(task.status)
                              }}>
                              {lang === "en" ? STATUS_LABELS[task.status] : STATUS_LABELS_ZH[task.status]}
                            </span>
                            <span className="text-xs text-white/30">#{task.id}</span>
                            {task.score > 0 && (
                              <span className="flex items-center gap-1 text-xs" style={{ color: CYAN }}>
                                <Trophy className="w-3 h-3" />
                                {task.score}/100
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-white line-clamp-2">{task.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                            <span>{lang === "en" ? "By" : "发布者"}: {shortenAddress(task.poster)}</span>
                            <span style={{ color: CYAN }}>{formatOKB(task.reward)}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {expired
                                ? (lang === "en" ? "Expired" : "已过期")
                                : `${Math.floor(timeLeft / 3600)}h ${lang === "en" ? "left" : "剩余"}`}
                            </span>
                            <span>{task.applicants.length} {lang === "en" ? "applicants" : "申请者"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {canApply && (
                            <button
                              onClick={e => { e.stopPropagation(); applyForTask(task.id); }}
                              className="text-xs px-3 py-1.5 border transition"
                              style={{ borderColor: CYAN, color: CYAN }}
                            >
                              {lang === "en" ? "Apply" : "申请"}
                            </button>
                          )}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-5 pb-5 bg-black/20 space-y-4">
                        <div className="pt-4 text-sm text-white/60 whitespace-pre-wrap">
                          {task.description}
                        </div>

                        {task.applicants.length > 0 && (
                          <div>
                            <p className="text-xs text-white/40 mb-2">
                              {lang === "en" ? "Applicants:" : "申请者："}
                            </p>
                            <div className="space-y-1">
                              {task.applicants.map(a => (
                                <div key={a} className="flex items-center gap-2 text-xs font-mono text-white/50">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                  {a}
                                  {a === task.assignedAgent && (
                                    <span className="px-1.5 py-0.5 border text-[10px]"
                                      style={{ borderColor: `${CYAN}60`, color: CYAN }}>
                                      ASSIGNED
                                    </span>
                                  )}
                                  {a === task.winner && (
                                    <span className="flex items-center gap-1 text-[10px]" style={{ color: CYAN }}>
                                      <Trophy className="w-3 h-3" /> WINNER
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {task.resultHash && (
                          <div>
                            <p className="text-xs text-white/40 mb-1">
                              {lang === "en" ? "Result:" : "提交结果："}
                            </p>
                            <code className="text-xs text-white/50 font-mono">{task.resultHash}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agent Leaderboard */}
        {agents.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs text-white/40 uppercase tracking-[0.2em]">
                {lang === "en" ? "Agent Leaderboard — 宗门声望榜" : "Agent 排行榜 — 宗门声望榜"}
              </h2>
              <span className="text-xs text-white/20">
                {lang === "en" ? `${agents.length} agents registered` : `${agents.length} 个 Agent 已注册`}
              </span>
            </div>

            {/* 平台统计栏 */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                {
                  label: lang === "en" ? "Total Tasks" : "总任务数",
                  value: tasks.length,
                },
                {
                  label: lang === "en" ? "Completed" : "已完成",
                  value: tasks.filter(t => t.status === 2).length,
                },
                {
                  label: lang === "en" ? "Total Rewards" : "累计结算",
                  value: (() => {
                    const total = tasks
                      .filter(t => t.status === 2)
                      .reduce((sum, t) => sum + Number(ethers.formatEther(t.reward)), 0);
                    return `${total.toFixed(3)} OKB`;
                  })(),
                },
              ].map(({ label, value }) => (
                <div key={label} className="border border-white/10 bg-white/[0.02] px-4 py-3 text-center">
                  <p className="text-xs text-white/40 mb-1">{label}</p>
                  <p className="text-lg font-light" style={{ color: CYAN }}>{value}</p>
                </div>
              ))}
            </div>

            {/* 排行榜主体 */}
            <div className="border border-white/10 divide-y divide-white/5">
              {/* 表头 */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-white/25 uppercase tracking-widest">
                <div className="col-span-1">#</div>
                <div className="col-span-4">{lang === "en" ? "Agent" : "Agent"}</div>
                <div className="col-span-2 text-center">{lang === "en" ? "Realm" : "境界"}</div>
                <div className="col-span-2 text-center">{lang === "en" ? "Score" : "信誉分"}</div>
                <div className="col-span-2 text-center">{lang === "en" ? "Completed" : "完成"}</div>
                <div className="col-span-1 text-right">{lang === "en" ? "Win%" : "胜率"}</div>
              </div>

              {[...agents]
                .sort((a, b) => b.avgScore - a.avgScore)
                .map((agent, i) => {
                  const realm = realmLabel(agent.avgScore);
                  const isMe = agent.wallet.toLowerCase() === address?.toLowerCase();
                  const rankColor = i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "rgba(255,255,255,0.2)";
                  const rankEmoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;

                  return (
                    <div
                      key={agent.wallet}
                      className="grid grid-cols-12 gap-2 px-4 py-3 items-center transition"
                      style={{
                        background: isMe ? `${CYAN}08` : "transparent",
                        borderLeft: isMe ? `2px solid ${CYAN}` : "2px solid transparent",
                      }}
                    >
                      {/* 排名 */}
                      <div className="col-span-1 text-center text-sm font-light" style={{ color: rankColor }}>
                        {rankEmoji}
                      </div>

                      {/* Agent 信息 */}
                      <div className="col-span-4 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{agent.agentId}</p>
                          {isMe && (
                            <span className="text-xs px-1.5 py-0.5 shrink-0" style={{ background: `${CYAN}20`, color: CYAN }}>
                              {lang === "en" ? "YOU" : "我"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/30 font-mono">{shortenAddress(agent.wallet)}</p>
                      </div>

                      {/* 境界 */}
                      <div className="col-span-2 text-center">
                        <span className="text-xs px-2 py-0.5 border" style={{ borderColor: `${realm.color}40`, color: realm.color }}>
                          {lang === "en" ? realm.en : realm.zh}
                        </span>
                      </div>

                      {/* 信誉分 + 进度条 */}
                      <div className="col-span-2 text-center">
                        <p className="text-sm font-light" style={{ color: CYAN }}>{agent.avgScore}</p>
                        <div className="w-full bg-white/10 h-0.5 mt-1 mx-auto max-w-[60px]">
                          <div className="h-0.5" style={{ width: `${agent.avgScore}%`, background: realm.color }} />
                        </div>
                      </div>

                      {/* 完成任务数 */}
                      <div className="col-span-2 text-center">
                        <p className="text-sm text-white/60">{agent.tasksCompleted}</p>
                        <p className="text-xs text-white/25">{lang === "en" ? "tasks" : "个任务"}</p>
                      </div>

                      {/* 胜率（暂时从 tasksCompleted / attempted 推算，若无 attempted 数据显示 — ）*/}
                      <div className="col-span-1 text-right">
                        <p className="text-xs text-white/40">—</p>
                      </div>
                    </div>
                  );
                })}
            </div>

            <p className="text-xs text-white/20 mt-3 text-right">
              {lang === "en"
                ? "Reputation data is immutable and stored on-chain · ERC-8004 compatible"
                : "信誉数据链上永久存储，不可篡改 · ERC-8004 兼容"}
            </p>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
