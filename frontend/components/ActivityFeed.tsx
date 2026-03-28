"use client";

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { getContract, shortenAddress, CONTRACT_ADDRESS } from "@/lib/contracts";
import { useLangStore } from "@/store/lang";

const CYAN = "#1de1f1";
const MAX_EVENTS = 50;

interface ArenaEvent {
  id: string;
  type: string;
  icon: string;
  color: string;
  title: string;
  detail: string;
  blockNumber: number;
  txHash: string;
  timestamp: number;
}

function eventMeta(name: string): { icon: string; color: string } {
  switch (name) {
    case "AgentRegistered":  return { icon: "🤖", color: "#a78bfa" };
    case "TaskPosted":       return { icon: "📋", color: "#60a5fa" };
    case "TaskApplied":      return { icon: "🙋", color: "#fbbf24" };
    case "TaskAssigned":     return { icon: "⚡", color: "#f97316" };
    case "ResultSubmitted":  return { icon: "📤", color: "#34d399" };
    case "TaskCompleted":    return { icon: "🏆", color: "#1de1f1" };
    case "TaskRefunded":     return { icon: "↩️", color: "#f87171" };
    case "ForceRefunded":    return { icon: "🛡️", color: "#f87171" };
    case "ConsolationPaid":  return { icon: "🥈", color: "#9ca3af" };
    default:                 return { icon: "📡", color: "#666" };
  }
}

export function ActivityFeed() {
  const { lang } = useLangStore();
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [listening, setListening] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rpc = new ethers.JsonRpcProvider("https://testrpc.xlayer.tech/terigon");
    if (!CONTRACT_ADDRESS) return;
    const contract = getContract(rpc);

    const eventNames = [
      "AgentRegistered", "TaskPosted", "TaskApplied", "TaskAssigned",
      "ResultSubmitted", "TaskCompleted", "TaskRefunded", "ForceRefunded", "ConsolationPaid",
    ];

    // Load recent events (last ~5000 blocks ≈ ~4 hours on X-Layer testnet)
    (async () => {
      try {
        const currentBlock = await rpc.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 5000);
        const allEvents: ArenaEvent[] = [];

        // Fetch block timestamps in parallel after collecting logs
        const blockTimestamps = new Map<number, number>();

        for (const name of eventNames) {
          const filter = contract.filters[name]();
          const logs = await contract.queryFilter(filter, fromBlock, currentBlock);
          for (const log of logs) {
            const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
            if (!parsed) continue;
            const meta = eventMeta(parsed.name);
            allEvents.push({
              id: `${log.transactionHash}-${log.index}`,
              type: parsed.name,
              icon: meta.icon,
              color: meta.color,
              title: formatTitle(parsed.name, parsed.args, lang),
              detail: formatDetail(parsed.name, parsed.args),
              blockNumber: log.blockNumber,
              txHash: log.transactionHash,
              timestamp: 0, // filled below
            });
            blockTimestamps.set(log.blockNumber, 0);
          }
        }

        // Fetch unique block timestamps in parallel
        const uniqueBlocks = Array.from(blockTimestamps.keys());
        await Promise.all(uniqueBlocks.map(async (bn) => {
          const block = await rpc.getBlock(bn);
          if (block) blockTimestamps.set(bn, block.timestamp * 1000);
        }));

        for (const evt of allEvents) {
          evt.timestamp = blockTimestamps.get(evt.blockNumber) || Date.now();
        }

        allEvents.sort((a, b) => b.blockNumber - a.blockNumber);
        setEvents(allEvents.slice(0, MAX_EVENTS));
      } catch {
        // silently fail on initial load
      }
    })();

    // Live listener
    const handlers: Array<{ name: string; handler: (...args: unknown[]) => void }> = [];
    for (const name of eventNames) {
      const handler = (...args: unknown[]) => {
        const event = args[args.length - 1] as ethers.EventLog;
        const meta = eventMeta(name);
        const parsed = contract.interface.parseLog({ topics: event.topics as string[], data: event.data });
        if (!parsed) return;
        // Fetch block timestamp asynchronously, then update the event
        rpc.getBlock(event.blockNumber).then(block => {
          const ts = block ? block.timestamp * 1000 : Date.now();
          setEvents(prev => [{
            id: `${event.transactionHash}-${event.index}`,
            type: name,
            icon: meta.icon,
            color: meta.color,
            title: formatTitle(name, parsed.args, lang),
            detail: formatDetail(name, parsed.args),
            blockNumber: event.blockNumber,
            txHash: event.transactionHash,
            timestamp: ts,
          }, ...prev].slice(0, MAX_EVENTS));
        });
      };
      contract.on(name, handler);
      handlers.push({ name, handler });
    }
    setListening(true);

    return () => {
      handlers.forEach(({ name, handler }) => contract.off(name, handler));
      setListening(false);
    };
  }, [lang]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-white/40 uppercase tracking-[0.2em]">
          {lang === "en" ? "Activity Feed — 链上动态" : "链上活动流"}
        </h2>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${listening ? "bg-green-400 animate-pulse" : "bg-white/20"}`} />
          <span className="text-xs text-white/20">
            {listening ? (lang === "en" ? "Live" : "实时监听") : (lang === "en" ? "Offline" : "离线")}
          </span>
        </div>
      </div>

      <div ref={feedRef} className="border border-white/10 divide-y divide-white/5 max-h-[400px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-white/20">
            {lang === "en" ? "No activity yet" : "暂无链上活动"}
          </div>
        ) : events.map(evt => (
          <div key={evt.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-white/[0.02] transition">
            <span className="text-base shrink-0 mt-0.5">{evt.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/70">{evt.title}</p>
              <p className="text-xs text-white/30 font-mono truncate">{evt.detail}</p>
            </div>
            <a
              href={`https://www.okx.com/web3/explorer/xlayer-test/tx/${evt.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/15 hover:text-white/40 transition shrink-0 font-mono"
            >
              #{evt.blockNumber}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTitle(name: string, args: ethers.Result, lang: string): string {
  switch (name) {
    case "AgentRegistered":
      return lang === "en"
        ? `Agent "${args.agentId}" registered`
        : `Agent「${args.agentId}」已注册`;
    case "TaskPosted":
      return lang === "en"
        ? `Task #${args.taskId} posted — ${parseFloat(ethers.formatEther(args.reward)).toFixed(4)} OKB`
        : `任务 #${args.taskId} 已发布 — ${parseFloat(ethers.formatEther(args.reward)).toFixed(4)} OKB`;
    case "TaskApplied":
      return lang === "en"
        ? `Agent applied for Task #${args.taskId}`
        : `Agent 申请了任务 #${args.taskId}`;
    case "TaskAssigned":
      return lang === "en"
        ? `Task #${args.taskId} assigned`
        : `任务 #${args.taskId} 已指派`;
    case "ResultSubmitted":
      return lang === "en"
        ? `Result submitted for Task #${args.taskId}`
        : `任务 #${args.taskId} 结果已提交`;
    case "TaskCompleted":
      return lang === "en"
        ? `Task #${args.taskId} completed — Score: ${args.score}`
        : `任务 #${args.taskId} 完成 — 评分: ${args.score}`;
    case "TaskRefunded":
      return lang === "en"
        ? `Task #${args.taskId} refunded`
        : `任务 #${args.taskId} 已退款`;
    case "ForceRefunded":
      return lang === "en"
        ? `Task #${args.taskId} force-refunded (judge timeout)`
        : `任务 #${args.taskId} 强制退款（Judge 超时）`;
    case "ConsolationPaid":
      return lang === "en"
        ? `Consolation paid for Task #${args.taskId}`
        : `任务 #${args.taskId} 安慰奖已发放`;
    default:
      return name;
  }
}

function formatDetail(name: string, args: ethers.Result): string {
  switch (name) {
    case "AgentRegistered": return shortenAddress(args.wallet);
    case "TaskPosted":      return `poster: ${shortenAddress(args.poster)}`;
    case "TaskApplied":     return `agent: ${shortenAddress(args.agent)}`;
    case "TaskAssigned":    return `agent: ${shortenAddress(args.agent)}`;
    case "ResultSubmitted": return `agent: ${shortenAddress(args.agent)}`;
    case "TaskCompleted":   return `winner: ${shortenAddress(args.winner)} — ${parseFloat(ethers.formatEther(args.reward)).toFixed(4)} OKB`;
    case "TaskRefunded":    return `poster: ${shortenAddress(args.poster)}`;
    case "ForceRefunded":   return `poster: ${shortenAddress(args.poster)}`;
    case "ConsolationPaid": return `agent: ${shortenAddress(args.agent)} — ${parseFloat(ethers.formatEther(args.amount)).toFixed(4)} OKB`;
    default:                return "";
  }
}
