"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { DashboardLayout } from "./DashboardLayout";
import { useWeb3 } from "./Web3Provider";
import { useLangStore } from "@/store/lang";
import { CONTRACT_ADDRESS, XLAYER_CHAIN, getContract } from "@/lib/contracts";
import {
  Globe, Wallet, Network, FileCode, Server,
  Copy, Check, ExternalLink, LogOut, RefreshCw,
} from "lucide-react";

const CYAN = "#1de1f1";

const DEFAULT_INDEXER =
  process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3001";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 text-white/30 hover:text-white/70 transition"
      title="Copy"
    >
      {copied
        ? <Check className="w-3.5 h-3.5" style={{ color: CYAN }} />
        : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <Icon className="w-4 h-4 text-white/40" />
        <h2 className="text-xs font-medium tracking-widest text-white/50 uppercase">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-white/40 shrink-0 w-32">{label}</span>
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { address, isConnected, walletType, disconnect, connect, switchToXLayer, chainId } = useWeb3();
  const { lang, setLang } = useLangStore();

  const [judgeAddress, setJudgeAddress] = useState<string>("");
  const [minPassScore, setMinPassScore] = useState<number | null>(null);
  const [judgeTimeout, setJudgeTimeout] = useState<number | null>(null);
  const [contractOwner, setContractOwner] = useState<string>("");
  const [loadingContract, setLoadingContract] = useState(false);

  const [indexerUrl, setIndexerUrl] = useState(DEFAULT_INDEXER);
  const [indexerHealth, setIndexerHealth] = useState<"ok" | "error" | "checking" | null>(null);
  const [editingIndexer, setEditingIndexer] = useState(false);
  const [indexerInput, setIndexerInput] = useState(DEFAULT_INDEXER);

  const wrongNetwork = isConnected && chainId !== 1952;

  // Load contract constants
  useEffect(() => {
    if (!CONTRACT_ADDRESS) return;
    setLoadingContract(true);
    const fallback = new ethers.JsonRpcProvider(XLAYER_CHAIN.rpcUrls[0]);
    const contract = getContract(fallback);
    Promise.all([
      contract.judgeAddress().catch(() => ""),
      contract.owner().catch(() => ""),
      contract.MIN_PASS_SCORE().catch(() => null),
      contract.JUDGE_TIMEOUT().catch(() => null),
    ]).then(([judge, owner, minScore, timeout]) => {
      setJudgeAddress(judge as string);
      setContractOwner(owner as string);
      setMinPassScore(minScore !== null ? Number(minScore) : null);
      setJudgeTimeout(timeout !== null ? Number(timeout) / 3600 : null);
    }).catch(console.error)
      .finally(() => setLoadingContract(false));
  }, []);

  const checkIndexer = async (url = indexerUrl) => {
    setIndexerHealth("checking");
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      setIndexerHealth(data.status === "ok" ? "ok" : "error");
    } catch {
      setIndexerHealth("error");
    }
  };

  const walletLabel = walletType === "okx" ? "OKX Wallet" : walletType === "metamask" ? "MetaMask" : "—";

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">
            {lang === "en" ? "Agent Arena" : "智能体竞技场"}
          </span>
          <h1 className="text-4xl font-light text-white">
            {lang === "en" ? "Settings" : "设置"}
          </h1>
          <p className="text-white/40 text-sm mt-2">
            {lang === "en"
              ? "Wallet, language, network and contract configuration"
              : "钱包、语言、网络与合约配置"}
          </p>
        </div>

        {/* ── Wallet ── */}
        <Section icon={Wallet} title={lang === "en" ? "Wallet" : "钱包"}>
          {isConnected ? (
            <>
              <Row label={lang === "en" ? "Address" : "地址"}>
                <span className="font-mono text-xs text-white/70 truncate">{address}</span>
                {address && <CopyButton text={address} />}
              </Row>
              <Row label={lang === "en" ? "Wallet Type" : "钱包类型"}>
                <span className="text-xs px-2 py-0.5 border"
                  style={{ borderColor: `${CYAN}50`, color: CYAN }}>
                  {walletLabel}
                </span>
              </Row>
              <Row label={lang === "en" ? "Network" : "网络"}>
                {wrongNetwork ? (
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-xs">
                      {lang === "en" ? "Wrong network" : "网络不对"}
                    </span>
                    <button
                      onClick={switchToXLayer}
                      className="text-xs px-3 py-1 border border-amber-500/40 text-amber-400 hover:border-amber-400 transition"
                    >
                      {lang === "en" ? "Switch to X-Layer" : "切换到 X-Layer"}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-white/60">
                    X-Layer Testnet
                    <span className="ml-1.5 text-white/30">(chainId 1952)</span>
                  </span>
                )}
              </Row>
              <div className="pt-1">
                <button
                  onClick={disconnect}
                  className="flex items-center gap-2 text-xs px-4 py-2 border border-red-500/30 text-red-400 hover:border-red-500/60 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {lang === "en" ? "Disconnect" : "断开连接"}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-4 space-y-3">
              <p className="text-white/40 text-sm">
                {lang === "en" ? "No wallet connected" : "未连接钱包"}
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
        </Section>

        {/* ── Language ── */}
        <Section icon={Globe} title={lang === "en" ? "Language" : "语言"}>
          <Row label={lang === "en" ? "Interface" : "界面语言"}>
            <div className="flex gap-2">
              {(["en", "zh"] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="px-4 py-1.5 text-xs border transition"
                  style={{
                    borderColor: lang === l ? CYAN : "rgba(255,255,255,0.15)",
                    color: lang === l ? CYAN : "rgba(255,255,255,0.4)",
                    background: lang === l ? `${CYAN}10` : "transparent",
                  }}
                >
                  {l === "en" ? "English" : "中文"}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* ── Network ── */}
        <Section icon={Network} title={lang === "en" ? "Network" : "网络"}>
          <Row label={lang === "en" ? "Chain" : "链名"}>
            <span className="text-white/60 text-xs">X-Layer Testnet</span>
          </Row>
          <Row label="Chain ID">
            <span className="font-mono text-xs text-white/60">1952</span>
            <CopyButton text="1952" />
          </Row>
          <Row label="RPC">
            <span className="font-mono text-xs text-white/40 truncate max-w-[220px]">
              {XLAYER_CHAIN.rpcUrls[0]}
            </span>
            <CopyButton text={XLAYER_CHAIN.rpcUrls[0]} />
          </Row>
          <Row label={lang === "en" ? "Currency" : "原生币"}>
            <span className="text-white/60 text-xs">OKB (18 decimals)</span>
          </Row>
          <Row label={lang === "en" ? "Explorer" : "浏览器"}>
            <a
              href={XLAYER_CHAIN.blockExplorerUrls[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition hover:opacity-80"
              style={{ color: CYAN }}
            >
              okx.com/explorer/xlayer-test
              <ExternalLink className="w-3 h-3" />
            </a>
          </Row>
          {!isConnected || wrongNetwork ? (
            <div className="pt-1">
              <button
                onClick={switchToXLayer}
                className="text-xs px-4 py-2 border transition"
                style={{ borderColor: `${CYAN}40`, color: CYAN }}
              >
                {lang === "en" ? "Add / Switch to X-Layer Testnet" : "添加 / 切换到 X-Layer 测试网"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs text-green-400/80">
                {lang === "en" ? "Connected to X-Layer Testnet" : "已连接 X-Layer 测试网"}
              </span>
            </div>
          )}
        </Section>

        {/* ── Contract ── */}
        <Section icon={FileCode} title={lang === "en" ? "Contract" : "合约"}>
          <Row label={lang === "en" ? "Address" : "合约地址"}>
            {CONTRACT_ADDRESS ? (
              <>
                <span className="font-mono text-xs text-white/60 truncate">{CONTRACT_ADDRESS}</span>
                <CopyButton text={CONTRACT_ADDRESS} />
                <a
                  href={`${XLAYER_CHAIN.blockExplorerUrls[0]}/address/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white/70 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </>
            ) : (
              <span className="text-xs text-white/30">
                {lang === "en" ? "Not configured (set NEXT_PUBLIC_CONTRACT_ADDRESS)" : "未配置 NEXT_PUBLIC_CONTRACT_ADDRESS"}
              </span>
            )}
          </Row>

          {loadingContract ? (
            <div className="flex items-center gap-2 text-xs text-white/30 py-1">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {lang === "en" ? "Loading contract info…" : "加载合约信息中…"}
            </div>
          ) : (
            <>
              <Row label={lang === "en" ? "Judge" : "裁判地址"}>
                {judgeAddress ? (
                  <>
                    <span className="font-mono text-xs text-white/60 truncate">{judgeAddress}</span>
                    <CopyButton text={judgeAddress} />
                  </>
                ) : <span className="text-xs text-white/20">—</span>}
              </Row>
              <Row label={lang === "en" ? "Owner" : "合约 Owner"}>
                {contractOwner ? (
                  <>
                    <span className="font-mono text-xs text-white/60 truncate">{contractOwner}</span>
                    <CopyButton text={contractOwner} />
                  </>
                ) : <span className="text-xs text-white/20">—</span>}
              </Row>
              {minPassScore !== null && (
                <Row label={lang === "en" ? "Min Pass Score" : "最低通过分"}>
                  <span className="text-xs text-white/60">{minPassScore} / 100</span>
                </Row>
              )}
              {judgeTimeout !== null && (
                <Row label={lang === "en" ? "Judge Timeout" : "裁判超时"}>
                  <span className="text-xs text-white/60">
                    {judgeTimeout} {lang === "en" ? "hours" : "小时"}
                  </span>
                </Row>
              )}
            </>
          )}
        </Section>

        {/* ── Indexer ── */}
        <Section icon={Server} title={lang === "en" ? "Indexer API" : "Indexer 接口"}>
          <Row label={lang === "en" ? "API Endpoint" : "接口地址"}>
            {editingIndexer ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  value={indexerInput}
                  onChange={e => setIndexerInput(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/20 px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-white/40"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      setIndexerUrl(indexerInput);
                      setEditingIndexer(false);
                      checkIndexer(indexerInput);
                    }
                    if (e.key === "Escape") setEditingIndexer(false);
                  }}
                  autoFocus
                />
                <button
                  onClick={() => { setIndexerUrl(indexerInput); setEditingIndexer(false); checkIndexer(indexerInput); }}
                  className="text-xs px-3 py-1.5 border transition"
                  style={{ borderColor: `${CYAN}50`, color: CYAN }}
                >
                  {lang === "en" ? "Save" : "保存"}
                </button>
              </div>
            ) : (
              <>
                <span className="font-mono text-xs text-white/50 truncate max-w-[200px]">{indexerUrl}</span>
                <button
                  onClick={() => { setEditingIndexer(true); setIndexerInput(indexerUrl); }}
                  className="text-xs text-white/30 hover:text-white/70 transition px-2 py-0.5 border border-white/10 hover:border-white/30"
                >
                  {lang === "en" ? "Edit" : "修改"}
                </button>
              </>
            )}
          </Row>

          <Row label={lang === "en" ? "Status" : "状态"}>
            <div className="flex items-center gap-2">
              {indexerHealth === null && (
                <span className="text-xs text-white/30">
                  {lang === "en" ? "Not checked" : "未检测"}
                </span>
              )}
              {indexerHealth === "checking" && (
                <span className="flex items-center gap-1.5 text-xs text-white/40">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {lang === "en" ? "Checking…" : "检测中…"}
                </span>
              )}
              {indexerHealth === "ok" && (
                <span className="flex items-center gap-1.5 text-xs text-green-400/80">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {lang === "en" ? "Online" : "在线"}
                </span>
              )}
              {indexerHealth === "error" && (
                <span className="flex items-center gap-1.5 text-xs text-red-400/80">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {lang === "en" ? "Unreachable" : "无法连接"}
                </span>
              )}
              <button
                onClick={() => checkIndexer()}
                className="text-xs text-white/30 hover:text-white/60 transition"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </Row>

          <p className="text-xs text-white/25 pt-1">
            {lang === "en"
              ? "The Indexer caches on-chain events for fast queries. It falls back to direct RPC if unavailable."
              : "Indexer 缓存链上事件以加速查询，不可用时前端直接读 RPC 作为降级。"}
          </p>
        </Section>

        {/* ── About ── */}
        <div className="text-xs text-white/20 text-right space-y-1 pb-4">
          <p>Agent Arena · X-Layer Testnet · ERC-8004 compatible</p>
          <p>
            <a
              href="https://github.com/DaviRain-Su/agent-arena"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/40 transition"
            >
              github.com/DaviRain-Su/agent-arena ↗
            </a>
          </p>
        </div>

      </div>
    </DashboardLayout>
  );
}
