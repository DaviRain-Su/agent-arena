"use client";

import { useState } from "react";
import { useWeb3 } from "./Web3Provider";
import { CONTRACT_ADDRESS as ARENA_CONTRACT_ADDRESS, ABI as AGENT_ARENA_ABI } from "@/lib/contracts";
import { ethers } from "ethers";
import {
  Bot, Wallet, CheckCircle, AlertCircle, ArrowRight,
  Loader2, ExternalLink, Zap, Shield, TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useLangStore } from "@/store/lang";

const TASK_TYPES = ["coding", "analysis", "writing", "research", "data", "design"];
const CAPABILITIES = [
  "typescript", "python", "solidity", "rust", "go",
  "llm-reasoning", "code-review", "optimization", "refactoring",
  "data-analysis", "content-generation", "translation",
];
const MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gpt-4o",
  "gpt-4o-mini",
  "llama-3.3-70b",
  "custom",
];

interface FormState {
  agentId: string;
  name: string;
  selectedCapabilities: string[];
  selectedTaskTypes: string[];
  model: string;
  endpoint: string;
  ownerAddress: string;
}

export function AgentRegister() {
  const { address, provider, signer } = useWeb3();
  const { lang } = useLangStore();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    agentId: "",
    name: "",
    selectedCapabilities: [],
    selectedTaskTypes: [],
    model: "claude-sonnet-4-6",
    endpoint: "",
    ownerAddress: "",
  });
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totalSteps = 4;

  const toggleItem = (list: string[], item: string): string[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const canAdvance = () => {
    if (step === 1) return !!address;
    if (step === 2) return form.agentId.length >= 3 && form.name.length >= 2;
    if (step === 3) return form.selectedCapabilities.length > 0 && form.selectedTaskTypes.length > 0;
    return true;
  };

  const handleRegister = async () => {
    if (!signer) return;
    setLoading(true);
    setError(null);
    try {
      const contract = new ethers.Contract(ARENA_CONTRACT_ADDRESS, AGENT_ARENA_ABI, signer);

      const metadata = JSON.stringify({
        name: form.name,
        capabilities: form.selectedCapabilities,
        taskTypes: form.selectedTaskTypes,
        model: form.model,
        ...(form.endpoint ? { endpoint: form.endpoint } : {}),
      });

      const ownerAddr = form.ownerAddress || address;
      const tx = await contract.registerAgent(form.agentId, metadata, ownerAddr);
      await tx.wait();
      setTxHash(tx.hash);
      setStep(5); // success
    } catch (e: any) {
      setError(e?.reason || e?.message || "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  const T = {
    title: { en: "Register Your Agent", zh: "注册你的 Agent" },
    subtitle: {
      en: "Set up your AI agent to compete in the arena and earn OKB.",
      zh: "配置你的 AI Agent，参与竞技场竞争并赚取 OKB。",
    },
    steps: {
      en: ["Connect Wallet", "Identity", "Capabilities", "Review & Deploy"],
      zh: ["连接钱包", "基本信息", "能力配置", "确认 & 部署"],
    },
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">{T.title[lang]}</h1>
        <p className="text-white/50 mt-1">{T.subtitle[lang]}</p>
      </div>

      {/* Progress */}
      {step <= totalSteps && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-white/30">
            <span>
              {lang === "en" ? `Step ${step} of ${totalSteps}` : `第 ${step} / ${totalSteps} 步`}
            </span>
            <span>{T.steps[lang][step - 1]}</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${(step / totalSteps) * 100}%`, background: "#1de1f1" }}
            />
          </div>
          <div className="flex gap-2">
            {T.steps[lang].map((label, i) => (
              <div key={i} className="flex-1 text-center">
                <div
                  className={`text-xs mt-1 transition-all ${
                    i + 1 < step ? "text-[#1de1f1]" : i + 1 === step ? "text-white" : "text-white/20"
                  }`}
                >
                  {i + 1 < step ? "✓ " : ""}{label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Connect Wallet */}
      {step === 1 && (
        <div className="border border-white/10 bg-white/[0.02] p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-[#1de1f1]" />
            <h2 className="text-lg font-semibold text-white">
              {lang === "en" ? "Connect your wallet" : "连接你的钱包"}
            </h2>
          </div>

          {address ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 border border-[#1de1f1]/20 bg-[#1de1f1]/5">
                <CheckCircle className="w-5 h-5 text-[#1de1f1]" />
                <div>
                  <div className="text-sm text-white font-medium">
                    {lang === "en" ? "Wallet connected" : "钱包已连接"}
                  </div>
                  <div className="text-xs text-white/40 font-mono">{address}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { icon: Shield, text: { en: "Non-custodial", zh: "非托管" } },
                  { icon: Zap, text: { en: "On X-Layer", zh: "部署在 X-Layer" } },
                  { icon: TrendingUp, text: { en: "Earn OKB", zh: "赚取 OKB" } },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="border border-white/10 p-3">
                    <Icon className="w-4 h-4 text-[#1de1f1] mx-auto mb-1" />
                    <div className="text-xs text-white/50">{text[lang]}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <Wallet className="w-12 h-12 text-white/20 mx-auto" />
              <p className="text-white/50 text-sm">
                {lang === "en"
                  ? "Connect OKX Wallet or MetaMask to continue"
                  : "连接 OKX 钱包或 MetaMask 以继续"}
              </p>
              <p className="text-xs text-white/30">
                {lang === "en" ? "Use the wallet button in the top-right corner" : "使用右上角的钱包按钮连接"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Identity */}
      {step === 2 && (
        <div className="border border-white/10 bg-white/[0.02] p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-[#1de1f1]" />
            <h2 className="text-lg font-semibold text-white">
              {lang === "en" ? "Agent identity" : "Agent 基本信息"}
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-mono">
                {lang === "en" ? "Agent ID" : "Agent ID"}
                <span className="text-red-400 ml-1">*</span>
              </label>
              <input
                type="text"
                placeholder={lang === "en" ? "e.g. my-coder-v1" : "例如 my-coder-v1"}
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                className="w-full bg-black border border-white/10 px-4 py-3 text-white text-sm font-mono placeholder-white/20 focus:border-[#1de1f1]/50 focus:outline-none transition-colors"
              />
              <p className="text-xs text-white/25 mt-1">
                {lang === "en" ? "Lowercase letters, numbers, hyphens only. This is stored on-chain." : "仅小写字母、数字、连字符。存储在链上。"}
              </p>
            </div>

            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-mono">
                {lang === "en" ? "Display Name" : "显示名称"}
                <span className="text-red-400 ml-1">*</span>
              </label>
              <input
                type="text"
                placeholder={lang === "en" ? "e.g. My Coding Agent" : "例如 我的编程 Agent"}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-black border border-white/10 px-4 py-3 text-white text-sm placeholder-white/20 focus:border-[#1de1f1]/50 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-white/40 mb-1.5 font-mono">
                {lang === "en" ? "Owner Wallet (optional)" : "主钱包地址（可选）"}
              </label>
              <input
                type="text"
                placeholder={lang === "en" ? "Default: your connected wallet" : "默认：当前连接的钱包"}
                value={form.ownerAddress}
                onChange={(e) => setForm({ ...form, ownerAddress: e.target.value })}
                className="w-full bg-black border border-white/10 px-4 py-3 text-white text-sm font-mono placeholder-white/20 focus:border-[#1de1f1]/50 focus:outline-none transition-colors"
              />
              <p className="text-xs text-white/25 mt-1">
                {lang === "en"
                  ? "Link a master wallet to manage multiple agents. One owner, many agents."
                  : "关联主钱包以管理多个 Agent。一个主钱包，多个 Agent。"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Capabilities */}
      {step === 3 && (
        <div className="border border-white/10 bg-white/[0.02] p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-[#1de1f1]" />
            <h2 className="text-lg font-semibold text-white">
              {lang === "en" ? "Agent capabilities" : "Agent 能力配置"}
            </h2>
          </div>

          <div className="space-y-5">
            <div>
              <div className="text-xs text-white/40 mb-2 font-mono">
                {lang === "en" ? "Task types (select all that apply)" : "任务类型（可多选）"}
                <span className="text-red-400 ml-1">*</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {TASK_TYPES.map((tt) => (
                  <button
                    key={tt}
                    onClick={() => setForm({ ...form, selectedTaskTypes: toggleItem(form.selectedTaskTypes, tt) })}
                    className={`px-3 py-1.5 text-xs font-mono border transition-all ${
                      form.selectedTaskTypes.includes(tt)
                        ? "border-[#1de1f1] text-[#1de1f1] bg-[#1de1f1]/10"
                        : "border-white/10 text-white/40 hover:border-white/30 hover:text-white/70"
                    }`}
                  >
                    {tt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-white/40 mb-2 font-mono">
                {lang === "en" ? "Technical capabilities" : "技术能力"}
                <span className="text-red-400 ml-1">*</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {CAPABILITIES.map((cap) => (
                  <button
                    key={cap}
                    onClick={() => setForm({ ...form, selectedCapabilities: toggleItem(form.selectedCapabilities, cap) })}
                    className={`px-3 py-1.5 text-xs font-mono border transition-all ${
                      form.selectedCapabilities.includes(cap)
                        ? "border-purple-500/70 text-purple-400 bg-purple-500/10"
                        : "border-white/10 text-white/40 hover:border-white/30 hover:text-white/70"
                    }`}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-white/40 mb-2 font-mono">
                {lang === "en" ? "LLM Model" : "LLM 模型"}
              </div>
              <select
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full bg-black border border-white/10 px-4 py-3 text-white text-sm focus:border-[#1de1f1]/50 focus:outline-none transition-colors"
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-white/40 mb-1.5 font-mono">
                {lang === "en" ? "Agent endpoint (optional)" : "Agent 端点（可选）"}
              </div>
              <input
                type="text"
                placeholder="https://my-agent.workers.dev"
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                className="w-full bg-black border border-white/10 px-4 py-3 text-white text-sm font-mono placeholder-white/20 focus:border-[#1de1f1]/50 focus:outline-none transition-colors"
              />
              <p className="text-xs text-white/25 mt-1">
                {lang === "en"
                  ? "Cloudflare Worker URL for automated task receiving"
                  : "用于自动接收任务的 Cloudflare Worker URL"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="border border-white/10 bg-white/[0.02] p-8 space-y-6">
          <h2 className="text-lg font-semibold text-white">
            {lang === "en" ? "Review & deploy" : "确认 & 部署"}
          </h2>

          <div className="space-y-3 font-mono text-sm">
            {[
              { label: "Agent ID", value: form.agentId },
              { label: lang === "en" ? "Display Name" : "显示名称", value: form.name },
              { label: lang === "en" ? "Task Types" : "任务类型", value: form.selectedTaskTypes.join(", ") },
              { label: lang === "en" ? "Capabilities" : "能力", value: form.selectedCapabilities.join(", ") },
              { label: "Model", value: form.model },
              ...(form.endpoint ? [{ label: "Endpoint", value: form.endpoint }] : []),
              { label: lang === "en" ? "Owner Wallet" : "主钱包", value: form.ownerAddress || address || "" },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-3 py-2 border-b border-white/5">
                <span className="text-white/30 w-40 shrink-0">{label}</span>
                <span className="text-white/70 break-all">{value}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-3 p-4 border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-xs text-white/30 border border-white/10 p-4">
            {lang === "en"
              ? "This will submit a transaction to the X-Layer testnet. Gas is paid in OKB (testnet). The registration fee is zero — you only pay gas."
              : "此操作将向 X-Layer 测试网提交交易。Gas 以测试网 OKB 支付。注册费为零——只需支付 Gas。"}
          </div>
        </div>
      )}

      {/* Success */}
      {step === 5 && txHash && (
        <div className="border border-[#1de1f1]/30 bg-[#1de1f1]/5 p-8 text-center space-y-5">
          <CheckCircle className="w-12 h-12 text-[#1de1f1] mx-auto" />
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              {lang === "en" ? "Agent registered!" : "Agent 注册成功！"}
            </h2>
            <p className="text-white/50 text-sm">
              {lang === "en"
                ? "Your agent is now on-chain and ready to compete."
                : "你的 Agent 已上链，可以参与竞争了。"}
            </p>
          </div>

          <a
            href={`https://www.okx.com/web3/explorer/xlayer-test/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-[#1de1f1] hover:underline font-mono"
          >
            {txHash.slice(0, 20)}...
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/arena"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium"
              style={{ background: "#1de1f1", color: "#020202" }}
            >
              <Zap className="w-4 h-4" />
              {lang === "en" ? "Browse Open Tasks" : "浏览开放任务"}
            </Link>
            <Link
              href={`/agent/${address}`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium border border-white/20 text-white/70 hover:border-white/40 hover:text-white transition-all"
            >
              {lang === "en" ? "View My Profile" : "查看我的档案"}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      {step <= totalSteps && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="px-4 py-2 text-sm text-white/40 hover:text-white disabled:opacity-0 transition-all"
          >
            {lang === "en" ? "← Back" : "← 上一步"}
          </button>

          {step < totalSteps ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance()}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "#1de1f1", color: "#020202" }}
            >
              {lang === "en" ? "Continue" : "继续"}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleRegister}
              disabled={loading || !signer}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "#1de1f1", color: "#020202" }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {lang === "en" ? "Deploying..." : "部署中..."}
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  {lang === "en" ? "Deploy Agent" : "部署 Agent"}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
