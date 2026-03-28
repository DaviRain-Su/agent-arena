// local-indexer/src/listener.js — Chain event listener (polling, no eth_newFilter)
// X-Layer testnet only supports eth_getLogs, not eth_newFilter/subscriptions.

import { ethers } from "ethers";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getLastBlock, setLastBlock,
  upsertTask, upsertAgent, addApplicant,
} from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ARTIFACT_PATH = process.env.ARTIFACT_PATH ||
  path.resolve(__dirname, "../../artifacts/AgentArena.json");

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "10000"); // ms
const BATCH = 50; // X-Layer testnet RPC limit: 100 blocks max per eth_getLogs

const STATUS_MAP = ["open", "in_progress", "completed", "refunded", "disputed"];

const ALL_EVENTS = [
  "AgentRegistered", "TaskPosted", "TaskApplied",
  "TaskAssigned", "ResultSubmitted", "TaskCompleted",
  "ConsolationPaid", "TaskRefunded", "ForceRefunded",
];

export async function startListener(provider, contractAddress) {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

  console.log(`[listener] Watching contract ${contractAddress}`);

  // ── Initial sync from last known block ────────────────────────────────────
  const currentBlock = await provider.getBlockNumber();
  const startBlock = getLastBlock() || currentBlock;

  if (startBlock < currentBlock) {
    console.log(`[listener] Backfilling from block ${startBlock} to ${currentBlock}...`);
    await processRange(contract, provider, startBlock, currentBlock);
    setLastBlock(currentBlock);
    console.log("[listener] Backfill complete.");
  } else {
    setLastBlock(currentBlock);
  }

  // ── Polling loop ──────────────────────────────────────────────────────────
  console.log(`[listener] Polling every ${POLL_INTERVAL / 1000}s...`);
  poll(contract, provider);
}

async function poll(contract, provider) {
  while (true) {
    await sleep(POLL_INTERVAL);
    try {
      const lastSynced = getLastBlock();
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastSynced) continue;

      await processRange(contract, provider, lastSynced + 1, currentBlock);
      setLastBlock(currentBlock);
    } catch (e) {
      console.error("[listener] Poll error:", e.message);
    }
  }
}

async function processRange(contract, provider, fromBlock, toBlock) {
  for (let start = fromBlock; start <= toBlock; start += BATCH) {
    const end = Math.min(start + BATCH - 1, toBlock);
    for (const eventName of ALL_EVENTS) {
      try {
        if (!contract.filters[eventName]) continue;
        const filter = contract.filters[eventName]();
        const events = await contract.queryFilter(filter, start, end);
        for (const ev of events) {
          await handleEvent(contract, provider, eventName, ev);
        }
      } catch (e) {
        // Non-fatal: log and continue
        if (!e.message?.includes("block range")) {
          console.warn(`[listener] ${eventName} [${start}-${end}] error:`, e.message);
        }
      }
    }
  }
}

async function handleEvent(contract, provider, eventName, ev) {
  const { args, blockNumber, transactionHash } = ev;
  switch (eventName) {
    case "AgentRegistered":
      console.log(`[event] AgentRegistered: ${args.agentId} @ ${args.wallet}`);
      await syncAgent(contract, args.wallet, blockNumber, provider);
      break;
    case "TaskPosted":
      console.log(`[event] TaskPosted #${args.taskId} reward=${ethers.formatEther(args.reward)} OKB`);
      await syncTask(contract, provider, Number(args.taskId), blockNumber, transactionHash);
      break;
    case "TaskApplied": {
      console.log(`[event] TaskApplied #${args.taskId} by ${args.agent}`);
      const block = await provider.getBlock(blockNumber);
      addApplicant(Number(args.taskId), args.agent, block.timestamp);
      break;
    }
    case "TaskAssigned":
      console.log(`[event] TaskAssigned #${args.taskId} → ${args.agent}`);
      await syncTask(contract, provider, Number(args.taskId), blockNumber);
      break;
    case "ResultSubmitted":
      console.log(`[event] ResultSubmitted #${args.taskId}`);
      await syncTask(contract, provider, Number(args.taskId), blockNumber);
      break;
    case "TaskCompleted":
      console.log(`[event] TaskCompleted #${args.taskId} winner=${args.winner} score=${args.score}`);
      await syncTask(contract, provider, Number(args.taskId), blockNumber, null, transactionHash);
      await syncAgent(contract, args.winner, blockNumber, provider);
      break;
    case "ConsolationPaid":
      console.log(`[event] ConsolationPaid #${args.taskId} → ${args.agent}`);
      break;
    case "TaskRefunded":
    case "ForceRefunded":
      console.log(`[event] ${eventName} #${args.taskId}`);
      await syncTask(contract, provider, Number(args.taskId), blockNumber);
      break;
  }
}

// ── Sync helpers ──────────────────────────────────────────────────────────────

async function syncTask(contract, provider, taskId, blockNumber, postTx = null, judgeTx = null) {
  try {
    const t = await contract.tasks(taskId);
    const block = await provider.getBlock(blockNumber);
    upsertTask({
      id: taskId,
      poster: t.poster,
      description: t.description,
      evaluationCid: t.evaluationCID || "",
      rewardWei: t.reward.toString(),
      deadline: Number(t.deadline),
      assignedAt: t.assignedAt ? Number(t.assignedAt) : null,
      judgeDeadline: t.judgeDeadline ? Number(t.judgeDeadline) : null,
      status: STATUS_MAP[Number(t.status)] || "open",
      assignedAgent: t.assignedAgent !== ethers.ZeroAddress ? t.assignedAgent : null,
      resultHash: t.resultHash || null,
      score: t.score ? Number(t.score) : null,
      winner: t.winner !== ethers.ZeroAddress ? t.winner : null,
      reasonUri: t.reasonURI || null,
      createdAt: block.timestamp,
      postTx,
      judgeTx,
    });
  } catch (e) {
    console.error(`[listener] syncTask #${taskId} failed:`, e.message);
  }
}

async function syncAgent(contract, wallet, blockNumber, provider) {
  try {
    const [info, rep, block] = await Promise.all([
      contract.agents(wallet),
      contract.getAgentReputation(wallet),
      provider.getBlock(blockNumber),
    ]);
    if (!info.registered) return;
    upsertAgent({
      wallet,
      owner: info.owner !== ethers.ZeroAddress ? info.owner : null,
      agentId: info.agentId,
      metadata: info.metadata,
      tasksCompleted: Number(rep.completed),
      tasksAttempted: Number(rep.attempted),
      totalScore: Number(info.totalScore),
      registeredAt: block ? block.timestamp : blockNumber,
    });
  } catch (e) {
    console.error(`[listener] syncAgent ${wallet} failed:`, e.message);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
