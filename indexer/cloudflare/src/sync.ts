// src/sync.ts — Cron-triggered chain event sync
// Runs every minute via Cloudflare Cron Triggers
// Fetches new events from X-Layer RPC and writes to D1

import type { Env } from "./types.js";
import { getLastBlock, setLastBlock, upsertTask, upsertAgent, addApplicant } from "./db.js";

// Minimal ABI — only the events and view functions we need
const ABI = [
  "event AgentRegistered(address indexed wallet, string agentId)",
  "event TaskPosted(uint256 indexed taskId, address indexed poster, uint256 reward, uint256 deadline)",
  "event TaskApplied(uint256 indexed taskId, address indexed agent)",
  "event TaskAssigned(uint256 indexed taskId, address indexed agent, uint256 judgeDeadline)",
  "event ResultSubmitted(uint256 indexed taskId, address indexed agent, string resultHash)",
  "event TaskCompleted(uint256 indexed taskId, address indexed winner, uint256 reward, uint8 score)",
  "event TaskRefunded(uint256 indexed taskId, address indexed poster, uint256 amount)",
  "event ForceRefunded(uint256 indexed taskId, address indexed poster, uint256 amount)",
  "function tasks(uint256) view returns (uint256,address,string,string,uint256,uint256,uint256,uint256,uint8,address,string,uint8,string,address,address)",
  "function agents(address) view returns (address,address,string,string,uint256,uint256,uint256,bool)",
  "function getAgentReputation(address) view returns (uint256,uint256,uint256,uint256)",
];

const STATUS_MAP: Record<number, string> = {
  0: "open", 1: "in_progress", 2: "completed", 3: "refunded", 4: "disputed",
};

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// ─── JSON-RPC helpers (no ethers dependency in Worker) ───────────────────────

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json() as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

async function getBlockNumber(rpcUrl: string): Promise<number> {
  const hex = await rpcCall(rpcUrl, "eth_blockNumber", []) as string;
  return parseInt(hex, 16);
}

async function getBlockTimestamp(rpcUrl: string, blockHex: string): Promise<number> {
  const block = await rpcCall(rpcUrl, "eth_getBlockByNumber", [blockHex, false]) as { timestamp: string } | null;
  return block ? parseInt(block.timestamp, 16) : Math.floor(Date.now() / 1000);
}

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  return await rpcCall(rpcUrl, "eth_call", [{ to, data }, "latest"]) as string;
}

// ─── ABI encoding helpers (minimal, no ethers) ───────────────────────────────

function encodeSelector(sig: string): string {
  // We'll compute keccak256 via a simple approach using SubtleCrypto
  // For MVP: hardcode the selectors we need
  const selectors: Record<string, string> = {
    "tasks(uint256)":               "0xb5d87e12",
    "agents(address)":              "0xb2bdfa7b",
    "getAgentReputation(address)":  "0xbf91eb55",
  };
  return selectors[sig] || "0x00000000";
}

function encodeUint256(n: bigint | number): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function decodeUint256(hex: string, offset: number): bigint {
  return BigInt("0x" + hex.slice(offset * 2, (offset + 32) * 2));
}

function decodeAddress(hex: string, offset: number): string {
  return "0x" + hex.slice(offset * 2 + 24, offset * 2 + 64);
}

function decodeString(hex: string, offset: number): string {
  try {
    const strOffset = Number(decodeUint256(hex, offset)) * 2;
    const len = Number(decodeUint256(hex, strOffset / 2));
    const strHex = hex.slice(strOffset + 64, strOffset + 64 + len * 2);
    const bytes = new Uint8Array(strHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

// ─── Contract call helpers ────────────────────────────────────────────────────

async function getTaskFromChain(rpcUrl: string, contractAddr: string, taskId: number) {
  try {
    const data = encodeSelector("tasks(uint256)") + encodeUint256(taskId);
    const result = (await ethCall(rpcUrl, contractAddr, data)).slice(2);

    // Decode tuple: (uint256,address,string,string,uint256,uint256,uint256,uint256,uint8,address,string,uint8,string,address,address)
    const id         = Number(decodeUint256(result, 0));
    const poster     = decodeAddress(result, 1);
    const status     = Number(decodeUint256(result, 8));
    const reward     = decodeUint256(result, 4);
    const deadline   = Number(decodeUint256(result, 5));
    const assignedAt = Number(decodeUint256(result, 6));
    const judgeDeadline = Number(decodeUint256(result, 7));
    const assignedAgent = decodeAddress(result, 9);
    const score      = Number(decodeUint256(result, 11));
    const winner     = decodeAddress(result, 13);
    const description    = decodeString(result, Number(decodeUint256(result, 2)) / 32);
    const evaluationCid  = decodeString(result, Number(decodeUint256(result, 3)) / 32);
    const resultHash     = decodeString(result, Number(decodeUint256(result, 10)) / 32);
    const reasonUri      = decodeString(result, Number(decodeUint256(result, 12)) / 32);

    return {
      id, poster, description, evaluationCid,
      rewardWei: reward.toString(),
      deadline,
      assignedAt: assignedAt || null,
      judgeDeadline: judgeDeadline || null,
      status: STATUS_MAP[status] || "open",
      assignedAgent: assignedAgent !== ZERO_ADDR ? assignedAgent : null,
      resultHash: resultHash || null,
      score: score || null,
      winner: winner !== ZERO_ADDR ? winner : null,
      reasonUri: reasonUri || null,
    };
  } catch (e) {
    console.error(`getTaskFromChain #${taskId} failed:`, e);
    return null;
  }
}

async function getAgentFromChain(rpcUrl: string, contractAddr: string, wallet: string) {
  try {
    const data = encodeSelector("agents(address)") + encodeAddress(wallet);
    const result = (await ethCall(rpcUrl, contractAddr, data)).slice(2);
    // Struct layout: wallet(0), owner(1), agentId(2), metadata(3),
    //   tasksCompleted(4), totalScore(5), tasksAttempted(6), registered(7)
    const registered = Number(decodeUint256(result, 7)) === 1;
    if (!registered) return null;

    const repData = encodeSelector("getAgentReputation(address)") + encodeAddress(wallet);
    const repResult = (await ethCall(rpcUrl, contractAddr, repData)).slice(2);

    const agentId  = decodeString(result, Number(decodeUint256(result, 2)) / 32);
    const metadata = decodeString(result, Number(decodeUint256(result, 3)) / 32);
    const tasksCompleted = Number(decodeUint256(repResult, 1));
    const tasksAttempted = Number(decodeUint256(repResult, 2));
    const totalScore = Number(decodeUint256(result, 5));

    const owner = decodeAddress(result, 1);
    return {
      wallet, owner: owner !== ZERO_ADDR ? owner : null,
      agentId, metadata, tasksCompleted, tasksAttempted, totalScore,
    };
  } catch (e) {
    console.error(`getAgentFromChain ${wallet} failed:`, e);
    return null;
  }
}

// ─── Event log decoder ────────────────────────────────────────────────────────

// Event topic0 (keccak256 of signature) — computed from AgentArena.sol events
const TOPICS: Record<string, string> = {
  AgentRegistered: "0xda816ca2fc37b9eecec62ae8263008ec6be1afb38dc28bc9c7c51d7e348da9c2",
  TaskPosted:      "0xcdf01a7fce2cec80e8e617626f3f34f334ed96168dfcbebc5b9fd0a64170337e",
  TaskApplied:     "0x7f4b15de145103c2f48b4429df1c147497eb30d764058cdbdd0e7b7ad82d8fac",
  TaskAssigned:    "0xfdbec991c520c476b24bb9ee9123ea146594b230b424c8140b23c33ac5906242",
  ResultSubmitted: "0xc06b551d984e333ac851ab20b1454a08d92740468f52ff54c0cd5270817f20a9",
  TaskCompleted:   "0x6f86192dffec1db9a9661011e799dea69af8d97961785f45d421ac62a59e606d",
  TaskRefunded:    "0x098446306d18a8ba797caf5ad3be836bc7fadb0fa82d207e934992497bdeaf61",
  ForceRefunded:   "0xa80d00e5ef4409f5bccace50fa19f6ae8a403470d95d8888605016b72021abda",
};

// Reverse lookup: topic0 → event name
const TOPIC_TO_EVENT: Record<string, string> = {};
for (const [name, topic] of Object.entries(TOPICS)) {
  TOPIC_TO_EVENT[topic] = name;
}

async function getLogs(rpcUrl: string, contractAddr: string, fromBlock: number, toBlock: number) {
  return await rpcCall(rpcUrl, "eth_getLogs", [{
    address: contractAddr,
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock:   "0x" + toBlock.toString(16),
  }]) as Array<{
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
  }>;
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncEvents(env: Env): Promise<{ synced: number; newBlock: number }> {
  const rpcUrl    = env.XLAYER_RPC;
  const contract  = env.CONTRACT_ADDRESS;
  const batchSize = parseInt(env.SYNC_BATCH_SIZE || "200");

  const currentBlock = await getBlockNumber(rpcUrl);
  const lastBlock    = await getLastBlock(env.DB);
  const fromBlock    = lastBlock === 0 ? Math.max(0, currentBlock - 5000) : lastBlock + 1;

  if (fromBlock > currentBlock) {
    console.log(`[sync] Already up to date at block ${currentBlock}`);
    return { synced: 0, newBlock: currentBlock };
  }

  const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);
  console.log(`[sync] Processing blocks ${fromBlock} → ${toBlock}`);

  let synced = 0;

  try {
    const logs = await getLogs(rpcUrl, contract, fromBlock, toBlock);
    console.log(`[sync] Got ${logs.length} logs`);

    const taskIds   = new Set<number>();
    const agentAddrs = new Set<string>();
    const applicants: Array<{ taskId: number; agent: string; blockHex: string }> = [];

    for (const log of logs) {
      const t = log.topics;
      if (!t || t.length === 0) continue;

      const eventName = TOPIC_TO_EVENT[t[0]];
      if (!eventName) continue; // unknown event, skip

      switch (eventName) {
        case "AgentRegistered":
          // topics[1] = wallet (indexed)
          if (t.length >= 2) agentAddrs.add("0x" + t[1].slice(26));
          break;
        case "TaskPosted":
          // topics[1] = taskId (indexed), topics[2] = poster (indexed)
          if (t.length >= 2) taskIds.add(parseInt(t[1], 16));
          break;
        case "TaskApplied":
          // topics[1] = taskId (indexed), topics[2] = agent (indexed)
          if (t.length >= 3) {
            const taskId = parseInt(t[1], 16);
            const agent = "0x" + t[2].slice(26);
            taskIds.add(taskId);
            agentAddrs.add(agent);
            applicants.push({ taskId, agent, blockHex: log.blockNumber });
          }
          break;
        case "TaskAssigned":
          // topics[1] = taskId (indexed), topics[2] = agent (indexed)
          if (t.length >= 2) taskIds.add(parseInt(t[1], 16));
          if (t.length >= 3) agentAddrs.add("0x" + t[2].slice(26));
          break;
        case "ResultSubmitted":
          // topics[1] = taskId (indexed), topics[2] = agent (indexed)
          if (t.length >= 2) taskIds.add(parseInt(t[1], 16));
          if (t.length >= 3) agentAddrs.add("0x" + t[2].slice(26));
          break;
        case "TaskCompleted":
          // topics[1] = taskId (indexed), topics[2] = winner (indexed)
          if (t.length >= 2) taskIds.add(parseInt(t[1], 16));
          if (t.length >= 3) agentAddrs.add("0x" + t[2].slice(26));
          break;
        case "TaskRefunded":
        case "ForceRefunded":
          // topics[1] = taskId (indexed), topics[2] = poster (indexed)
          if (t.length >= 2) taskIds.add(parseInt(t[1], 16));
          break;
      }

      synced++;
    }

    // Sync all referenced tasks
    const taskTimestamp = await getBlockTimestamp(rpcUrl, "0x" + toBlock.toString(16));
    for (const taskId of taskIds) {
      const task = await getTaskFromChain(rpcUrl, contract, taskId);
      if (task) {
        await upsertTask(env.DB, { ...task, createdAt: taskTimestamp, postTx: null, judgeTx: null });
        if (task.assignedAgent) agentAddrs.add(task.assignedAgent);
        if (task.winner) agentAddrs.add(task.winner);
      }
    }

    // Add applicants
    for (const a of applicants) {
      const ts = await getBlockTimestamp(rpcUrl, a.blockHex);
      await addApplicant(env.DB, a.taskId, a.agent, ts);
    }

    // Sync all referenced agents
    for (const addr of agentAddrs) {
      if (addr === ZERO_ADDR) continue;
      const agent = await getAgentFromChain(rpcUrl, contract, addr);
      if (agent) {
        await upsertAgent(env.DB, { ...agent, registeredAt: taskTimestamp });
      }
    }

    await setLastBlock(env.DB, toBlock);
    console.log(`[sync] Done. Processed ${synced} logs, ${taskIds.size} tasks, ${agentAddrs.size} agents`);
    return { synced, newBlock: toBlock };

  } catch (e) {
    console.error("[sync] Error:", e);
    return { synced: 0, newBlock: lastBlock };
  }
}
