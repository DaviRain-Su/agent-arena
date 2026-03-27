"use client";

import { useEffect, useState, useMemo } from "react";
import { ethers } from "ethers";
import { DashboardLayout } from "./DashboardLayout";
import { useWeb3 } from "./Web3Provider";
import Link from "next/link";
import {
  Workflow, ShoppingCart, Users, ClipboardList, ArrowRight,
  Activity, Cpu, Shield, Terminal, BookOpen,
  Copy, Check, Plus, ChevronDown, ChevronUp, Eye, EyeOff, Key,
} from "lucide-react";
import { useLangStore } from "@/store/lang";
import { workerApi, type WorkerAgentEntry, type WorkerHealth, type ActiveNode } from "@/lib/api/worker";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "https://agentx-worker.davirain-yin.workers.dev";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "xs" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1 text-white/40 hover:text-white transition px-2 py-1 border border-white/10 hover:border-white/30 ${size === "xs" ? "text-[10px]" : "text-xs"}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Derive agent wallet address from masterKey + agentName — same logic as AgentConnector */
function deriveAgentAddress(masterKey: string, agentName: string): string {
  const seed = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(seed).address;
}

interface MyAgent {
  name: string;
  address: string;
  apiKey: string;
  createdAt: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardHome() {
  const { lang } = useLangStore();
  const { address, signer } = useWeb3();

  // Network state
  const [agents, setAgents] = useState<Record<string, WorkerAgentEntry>>({});
  const [health, setHealth] = useState<WorkerHealth | null>(null);
  const [jobCount, setJobCount] = useState({ total: 0, running: 0 });
  const [latency, setLatency] = useState<number | null>(null);
  const [activeNodes, setActiveNodes] = useState<ActiveNode[]>([]);

  // My Agents state
  const [masterKey, setMasterKey] = useState<string | null>(null);
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Load masterKey + agents from localStorage when wallet connects
  useEffect(() => {
    if (!address) return;
    const storedKey = localStorage.getItem(`agentx_master_${address}`);
    if (storedKey) setMasterKey(storedKey);
    try {
      const stored = JSON.parse(localStorage.getItem(`agentx_agents_${address}`) || "[]");
      setMyAgents(stored);
    } catch {}
  }, [address]);

  // Network data
  useEffect(() => {
    const t0 = Date.now();
    workerApi.getHealth().then(d => { setHealth(d); setLatency(Date.now() - t0); }).catch(() => {});
    workerApi.getAgents().then(d => setAgents(d)).catch(() => {});
    workerApi.getActiveNodes().then(setActiveNodes).catch(() => {});
    try {
      const jobs: Array<{ status?: string }> = JSON.parse(localStorage.getItem("a2a_jobs") || "[]");
      setJobCount({ total: jobs.length, running: jobs.filter(j => j.status === "running").length });
    } catch {}
  }, []);

  // Preview derived address while user types
  const previewAddress = useMemo(() => {
    if (!masterKey || !newAgentName.trim()) return null;
    try { return deriveAgentAddress(masterKey, newAgentName.trim()); } catch { return null; }
  }, [masterKey, newAgentName]);

  // Generate master key from wallet signature
  const generateMasterKey = async () => {
    if (!signer || !address) return;
    setGeneratingKey(true);
    try {
      const sig = await signer.signMessage(
        `AgentX Master Key v1\nWallet: ${address}\nNetwork: X Layer Testnet\n\nSign to derive your deterministic agent master key.\nThis does not authorize any transaction.`
      );
      const key = ethers.keccak256(ethers.toUtf8Bytes(sig));
      setMasterKey(key);
      localStorage.setItem(`agentx_master_${address}`, key);
    } catch { /* user rejected */ } finally {
      setGeneratingKey(false);
    }
  };

  // Create a new agent
  const createAgent = async () => {
    if (!masterKey || !newAgentName.trim() || !address) return;
    const name = newAgentName.trim();
    if (myAgents.some(a => a.name === name)) return; // duplicate
    setCreating(true);
    try {
      const agentAddress = deriveAgentAddress(masterKey, name);
      const { apiKey } = await workerApi.generateNodeKey(name);
      const newAgent: MyAgent = { name, address: agentAddress, apiKey, createdAt: Date.now() };
      const updated = [...myAgents, newAgent];
      setMyAgents(updated);
      localStorage.setItem(`agentx_agents_${address}`, JSON.stringify(updated));
      setNewAgentName("");
      setExpandedAgent(name);
    } catch { /* ignore */ } finally {
      setCreating(false);
    }
  };

  const agentNames = Object.keys(agents);
  const agentCount = agentNames.length || "—";
  const nodeOk = health?.status === "ok";
  const onlineNames = new Set(activeNodes.map(n => n.name));

  const MODULES = [
    { id: "workflows", title: "Workflows", titleZh: "工作流", desc: "Build and deploy automated agent workflows", descZh: "构建和部署自动化智能体工作流", icon: Workflow, href: "/workflows", stats: jobCount.total > 0 ? `${jobCount.total} Jobs` : "Ready" },
    { id: "market", title: "Agent Marketplace", titleZh: "智能体市场", desc: "Browse, hire and publish agents on X Layer", descZh: "浏览、雇佣并发布 Agent 到 X Layer", icon: ShoppingCart, href: "/market", stats: `${agentCount} Agents` },
    { id: "teams", title: "Agent Swarm", titleZh: "智能体蜂群", desc: "Form a swarm of 3 agents and run A2A workflows", descZh: "组建 3 个 Agent 的蜂群，执行 A2A 工作流", icon: Users, href: "/teams", stats: "Live" },
    { id: "tasks", title: "Tasks", titleZh: "任务", desc: "Monitor A2A payment workflows and on-chain tasks", descZh: "监控 A2A 支付工作流与链上任务", icon: ClipboardList, href: "/tasks", stats: jobCount.running > 0 ? `${jobCount.running} Running` : "All Clear" },
    { id: "docs", title: "Docs", titleZh: "文档", desc: "Read architecture, workflows, API and onboarding guides", descZh: "查看架构、工作流、API 与接入指南", icon: BookOpen, href: "/docs", stats: "6 Guides" },
  ];

  const AGENT_ROLES: Record<string, { label: string; desc: string }> = {
    orchestrator: { label: "Orchestrator", desc: "Coordinates A2A payments between agents" },
    "price-oracle": { label: "Price Oracle", desc: "Fetches live crypto prices from Binance" },
    "trade-strategy": { label: "Trade Strategy", desc: "Evaluates trade conditions, prepares DEX swaps" },
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-12">

        {/* Header */}
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">AgentX Network</span>
          <h1 className="text-4xl lg:text-5xl font-light text-white">
            {lang === "en" ? "Dashboard" : "仪表盘"}
          </h1>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-[#1de1f1]/20 p-6 hover:border-[#1de1f1]/50 transition-all bg-[#1de1f1]/5">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs text-white/40 uppercase tracking-widest">Active Agents</span>
              <Cpu className="w-5 h-5" style={{ color: '#1de1f1' }} />
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-4xl font-light" style={{ color: '#1de1f1' }}>{agentCount}</h2>
              <span className="text-white/40">on-chain</span>
            </div>
            <div className="mt-4 text-sm text-white/60">
              {agentNames.length > 0 ? agentNames.join(" · ") : "Connecting..."}
            </div>
          </div>

          <div className="border border-white/10 p-6 hover:border-[#1de1f1]/30 transition-all bg-white/5">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs text-white/40 uppercase tracking-widest">Node Status</span>
              <Shield className="w-5 h-5 text-white/60" />
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-4xl font-light" style={nodeOk ? { color: '#1de1f1' } : undefined}>
                {health ? (nodeOk ? "ONLINE" : "ERROR") : "—"}
              </h2>
            </div>
            <div className="mt-4 text-sm text-white/60">
              {latency !== null ? `Latency: ${latency}ms` : "Measuring..."}
              {health && <span className="ml-2 text-white/40">v{health.version}</span>}
            </div>
          </div>

          <div className="border border-white/10 p-6 hover:border-white/30 transition-all bg-white/5">
            <div className="flex items-start justify-between mb-4">
              <span className="text-xs text-white/40 uppercase tracking-widest">A2A Workflows</span>
              <Activity className="w-5 h-5 text-white/60" />
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-4xl font-light text-white">{jobCount.total}</h2>
              <span className="text-white/40">total</span>
            </div>
            <div className="mt-4 text-sm text-white/60">
              {jobCount.running > 0 ? <><span className="text-white">{jobCount.running}</span> running</> : "No active jobs"}
            </div>
          </div>
        </div>

        {/* Module Grid */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {MODULES.map((module) => {
              const Icon = module.icon;
              return (
                <Link key={module.id} href={module.href} className="group border border-white/10 p-6 hover:border-[#1de1f1]/40 transition-all bg-white/5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 border border-white/20 flex items-center justify-center group-hover:border-[#1de1f1]/60 transition">
                      <Icon className="w-6 h-6 text-white/60 group-hover:text-[#1de1f1] transition" />
                    </div>
                    <span className="text-xs text-white/40">{module.stats}</span>
                  </div>
                  <h3 className="text-xl font-medium text-white mb-1 group-hover:text-[#1de1f1] transition">{lang === "en" ? module.title : module.titleZh}</h3>
                  <p className="text-sm text-white/50 mb-4">{lang === "en" ? module.desc : module.descZh}</p>
                  <div className="flex items-center text-white/40 group-hover:text-[#1de1f1] transition-colors">
                    <span className="text-sm">{lang === "en" ? "Open" : "打开"}</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Agent Network — built-in CF agents */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-6">Agent Network</h2>
          <div className="border border-white/10 divide-y divide-white/10">
            {agentNames.length === 0 ? (
              <div className="p-6 text-white/40 text-sm">Connecting to agent network...</div>
            ) : agentNames.map((name) => {
              const agent = agents[name];
              const role = AGENT_ROLES[name] || { label: name, desc: (agent.capabilities || []).join(", ") };
              return (
                <div key={name} className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                  <div className="w-10 h-10 border border-white/20 flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-white">{role.label}</h4>
                    <p className="text-sm text-white/50 truncate">{role.desc}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-white/40 font-mono">{agent.address.slice(0, 6)}...{agent.address.slice(-4)}</div>
                    <div className="text-xs text-white/60 mt-0.5">{agent.fee}</div>
                  </div>
                  <span className="w-1.5 h-1.5 inline-block animate-pulse ml-2" style={{ background: '#1de1f1' }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── My Agents ─────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs text-white/40 uppercase tracking-[0.2em]">
              {lang === "en" ? "My Agents" : "我的智能体"}
            </h2>
            {activeNodes.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: '#1de1f1' }} />
                {activeNodes.length} {lang === "en" ? "online in swarm" : "个在线"}
                <Link href="/market" className="ml-1 hover:text-white transition" style={{ color: '#1de1f1' }}>→</Link>
              </div>
            )}
          </div>

          <div className="space-y-4">

            {/* Step 1: Master Key */}
            <div className="border border-white/10 p-5 bg-white/5">
              <div className="flex items-center gap-3 mb-1">
                <Key className="w-4 h-4 text-white/40" />
                <span className="text-xs text-white/40 uppercase tracking-widest">
                  {lang === "en" ? "Master Key" : "主密钥"}
                </span>
              </div>

              {!address ? (
                <p className="text-sm text-white/40 mt-2">
                  {lang === "en" ? "Connect your wallet to generate a master key." : "连接钱包以生成主密钥。"}
                </p>
              ) : !masterKey ? (
                <div className="mt-3">
                  <p className="text-sm text-white/60 mb-3">
                    {lang === "en"
                      ? "Sign once with your wallet to derive a deterministic master key. All your agent wallets are derived from this key + agent name."
                      : "用钱包签名一次，派生出确定性主密钥。所有智能体钱包由此密钥 + 名称派生。"}
                  </p>
                  <button
                    onClick={generateMasterKey}
                    disabled={generatingKey}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium border transition"
                    style={{ borderColor: '#1de1f1', color: '#1de1f1' }}
                  >
                    <Key className="w-4 h-4" />
                    {generatingKey
                      ? (lang === "en" ? "Waiting for signature..." : "等待签名...")
                      : (lang === "en" ? "Generate Master Key" : "生成主密钥")}
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs bg-black/40 border border-white/10 px-3 py-1.5 flex-1 truncate text-white/50">
                      {showMasterKey ? masterKey : masterKey.slice(0, 6) + "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••" + masterKey.slice(-4)}
                    </code>
                    <button onClick={() => setShowMasterKey(v => !v)} className="text-white/30 hover:text-white transition p-1">
                      {showMasterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <CopyButton text={masterKey} />
                  </div>
                  <p className="text-xs text-white/30">
                    {lang === "en"
                      ? "⚠ Store this key as AGENTX_PRIVATE_KEY in your Cloudflare Worker secrets. Do not share it."
                      : "⚠ 将此密钥存为 Cloudflare Worker 的 AGENTX_PRIVATE_KEY secret，请勿分享。"}
                  </p>
                </div>
              )}
            </div>

            {/* Step 2: Create Agent */}
            {masterKey && (
              <div className="border border-white/10 p-5 bg-white/5">
                <span className="text-xs text-white/40 uppercase tracking-widest block mb-3">
                  {lang === "en" ? "Create Agent" : "创建智能体"}
                </span>
                <div className="flex gap-3 items-start">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder={lang === "en" ? "Agent name, e.g. my-price-agent" : "智能体名称，如 my-price-agent"}
                      value={newAgentName}
                      onChange={e => setNewAgentName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                      onKeyDown={e => e.key === "Enter" && createAgent()}
                      className="w-full bg-black/40 border border-white/20 px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/50"
                    />
                    {previewAddress && (
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-white/30">
                        <span>→ wallet:</span>
                        <code className="font-mono" style={{ color: '#1de1f1' }}>
                          {previewAddress.slice(0, 10)}...{previewAddress.slice(-6)}
                        </code>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={createAgent}
                    disabled={creating || !newAgentName.trim()}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium border transition shrink-0"
                    style={{ borderColor: '#1de1f1', color: '#1de1f1' }}
                  >
                    <Plus className="w-4 h-4" />
                    {creating ? (lang === "en" ? "Creating..." : "创建中...") : (lang === "en" ? "Create" : "创建")}
                  </button>
                </div>
              </div>
            )}

            {/* Agent List */}
            {myAgents.length > 0 && (
              <div className="border border-white/10 divide-y divide-white/10">
                {myAgents.map((agent) => {
                  const isOnline = onlineNames.has(agent.name);
                  const isExpanded = expandedAgent === agent.name;
                  const deployCmd =
                    `npx wrangler secret put AGENTX_API_KEY\n# value: ${agent.apiKey}\n\nnpx wrangler secret put AGENTX_PRIVATE_KEY\n# value: ${masterKey}`;

                  return (
                    <div key={agent.name}>
                      <div className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                        {/* Status dot */}
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? "animate-pulse" : ""}`}
                          style={{ background: isOnline ? '#1de1f1' : 'rgba(255,255,255,0.2)' }}
                        />
                        {/* Name + address */}
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-sm text-white">{agent.name}</span>
                          <span className="ml-3 text-xs text-white/30 font-mono">
                            {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                          </span>
                        </div>
                        {/* Status badge */}
                        <span className={`text-xs px-2 py-0.5 border ${isOnline ? "border-[#1de1f1]/40 text-[#1de1f1]" : "border-white/10 text-white/30"}`}>
                          {isOnline ? "ONLINE" : "OFFLINE"}
                        </span>
                        {/* Expand deploy */}
                        <button
                          onClick={() => setExpandedAgent(isExpanded ? null : agent.name)}
                          className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition px-2 py-1 border border-white/10 hover:border-white/30"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {lang === "en" ? "Deploy" : "部署"}
                        </button>
                      </div>

                      {/* Deploy commands panel */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 bg-black/20">
                          <p className="text-xs text-white/40 pt-3">
                            {lang === "en"
                              ? "Run these in your Cloudflare Worker project to set secrets:"
                              : "在你的 Cloudflare Worker 项目中运行以下命令设置 secret："}
                          </p>
                          <div className="bg-black/40 border border-white/10 p-3 font-mono text-xs text-white/60 space-y-1">
                            <div><span className="text-white/30">$</span> npx wrangler secret put <span className="text-white">AGENTX_API_KEY</span></div>
                            <div className="pl-4 text-white/30"># {lang === "en" ? "paste:" : "粘贴："} {agent.apiKey.slice(0, 16)}...</div>
                            <div className="mt-2"><span className="text-white/30">$</span> npx wrangler secret put <span className="text-white">AGENTX_PRIVATE_KEY</span></div>
                            <div className="pl-4 text-white/30"># {lang === "en" ? "paste your Master Key" : "粘贴你的主密钥"}</div>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-white/30">
                              {lang === "en" ? "Agent wallet:" : "智能体钱包："}
                              <code className="font-mono ml-1" style={{ color: '#1de1f1' }}>{agent.address}</code>
                            </p>
                            <CopyButton text={deployCmd} />
                          </div>
                          <div className="text-xs text-white/30">
                            {lang === "en"
                              ? "See "
                              : "参考 "}
                            <Link href="/docs/build-agent" style={{ color: '#1de1f1' }} className="hover:underline">
                              {lang === "en" ? "Build a Worker Agent" : "构建 Worker 智能体"}
                            </Link>
                            {lang === "en" ? " for the full setup guide." : " 查看完整接入教程。"}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
