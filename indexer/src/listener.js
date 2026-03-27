// indexer/src/listener.js — Chain event listener

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

const STATUS_MAP = ["open", "in_progress", "completed", "refunded", "disputed"];

export async function startListener(provider, contractAddress) {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

  console.log(`[listener] Watching contract ${contractAddress}`);

  // ── Backfill from last known block ─────────────────────────────────────────
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = getLastBlock() || Math.max(0, currentBlock - 10000);

  if (fromBlock < currentBlock) {
    console.log(`[listener] Backfilling events from block ${fromBlock} to ${currentBlock}...`);
    await backfill(contract, provider, fromBlock, currentBlock);
    setLastBlock(currentBlock);
    console.log(`[listener] Backfill complete.`);
  }

  // ── Live event subscriptions ────────────────────────────────────────────────

  contract.on("AgentRegistered", async (wallet, agentId, event) => {
    console.log(`[event] AgentRegistered: ${agentId} @ ${wallet}`);
    await syncAgent(contract, wallet, event.blockNumber);
    setLastBlock(event.blockNumber);
  });

  contract.on("TaskPosted", async (taskId, poster, reward, deadline, event) => {
    console.log(`[event] TaskPosted #${taskId} by ${poster}, reward=${ethers.formatEther(reward)} OKB`);
    await syncTask(contract, provider, Number(taskId), event.blockNumber, event.transactionHash);
    setLastBlock(event.blockNumber);
  });

  contract.on("TaskApplied", async (taskId, agent, event) => {
    console.log(`[event] TaskApplied #${taskId} by ${agent}`);
    const block = await provider.getBlock(event.blockNumber);
    addApplicant(Number(taskId), agent, block.timestamp);
    setLastBlock(event.blockNumber);
  });

  contract.on("TaskAssigned", async (taskId, agent, judgeDeadline, event) => {
    console.log(`[event] TaskAssigned #${taskId} → ${agent}`);
    await syncTask(contract, provider, Number(taskId), event.blockNumber);
    setLastBlock(event.blockNumber);
  });

  contract.on("ResultSubmitted", async (taskId, agent, resultHash, event) => {
    console.log(`[event] ResultSubmitted #${taskId} hash=${resultHash.slice(0, 20)}...`);
    await syncTask(contract, provider, Number(taskId), event.blockNumber);
    setLastBlock(event.blockNumber);
  });

  contract.on("TaskCompleted", async (taskId, winner, reward, score, event) => {
    console.log(`[event] TaskCompleted #${taskId} winner=${winner} score=${score}`);
    await syncTask(contract, provider, Number(taskId), event.blockNumber, null, event.transactionHash);
    await syncAgent(contract, winner, event.blockNumber);
    setLastBlock(event.blockNumber);
  });

  contract.on("TaskRefunded", async (taskId, poster, amount, event) => {
    console.log(`[event] TaskRefunded #${taskId}`);
    await syncTask(contract, provider, Number(taskId), event.blockNumber);
    setLastBlock(event.blockNumber);
  });

  contract.on("ForceRefunded", async (taskId, poster, amount, event) => {
    console.log(`[event] ForceRefunded #${taskId}`);
    await syncTask(contract, provider, Number(taskId), event.blockNumber);
    setLastBlock(event.blockNumber);
  });

  console.log("[listener] Subscribed to all events. Listening...");
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
      evaluationCid: t.evaluationCID,
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
      postTx: postTx,
      judgeTx: judgeTx,
    });
  } catch (e) {
    console.error(`[listener] syncTask #${taskId} failed:`, e.message);
  }
}

async function syncAgent(contract, wallet, blockNumber) {
  try {
    const [info, rep] = await Promise.all([
      contract.agents(wallet),
      contract.getAgentReputation(wallet),
    ]);
    if (!info.registered) return;
    upsertAgent({
      wallet,
      agentId: info.agentId,
      metadata: info.metadata,
      tasksCompleted: Number(rep.completed),
      tasksAttempted: Number(rep.attempted),
      totalScore: Number(info.totalScore),
      registeredAt: blockNumber, // approximate; block timestamp ideally
    });
  } catch (e) {
    console.error(`[listener] syncAgent ${wallet} failed:`, e.message);
  }
}

async function backfill(contract, provider, fromBlock, toBlock) {
  // Fetch all historical events in batches to avoid RPC limits
  const BATCH = 2000;
  const allEvents = [
    "AgentRegistered", "TaskPosted", "TaskApplied",
    "TaskAssigned", "ResultSubmitted", "TaskCompleted",
    "TaskRefunded", "ForceRefunded",
  ];

  for (let start = fromBlock; start <= toBlock; start += BATCH) {
    const end = Math.min(start + BATCH - 1, toBlock);
    for (const eventName of allEvents) {
      try {
        const filter = contract.filters[eventName]();
        const events = await contract.queryFilter(filter, start, end);
        for (const ev of events) {
          switch (eventName) {
            case "AgentRegistered":
              await syncAgent(contract, ev.args.wallet, ev.blockNumber);
              break;
            case "TaskPosted":
              await syncTask(contract, provider, Number(ev.args.taskId), ev.blockNumber, ev.transactionHash);
              break;
            case "TaskApplied": {
              const block = await provider.getBlock(ev.blockNumber);
              addApplicant(Number(ev.args.taskId), ev.args.agent, block.timestamp);
              break;
            }
            case "TaskAssigned":
            case "ResultSubmitted":
            case "TaskRefunded":
            case "ForceRefunded":
              await syncTask(contract, provider, Number(ev.args.taskId), ev.blockNumber);
              break;
            case "TaskCompleted":
              await syncTask(contract, provider, Number(ev.args.taskId), ev.blockNumber, null, ev.transactionHash);
              await syncAgent(contract, ev.args.winner, ev.blockNumber);
              break;
          }
        }
      } catch (e) {
        console.warn(`[backfill] ${eventName} [${start}-${end}] failed:`, e.message);
      }
    }
  }
}
