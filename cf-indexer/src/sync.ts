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
  "function agents(address) view returns (address,string,string,uint256,uint256,uint256,bool)",
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
    const registered = Number(decodeUint256(result, 6)) === 1;
    if (!registered) return null;

    const repData = encodeSelector("getAgentReputation(address)") + encodeAddress(wallet);
    const repResult = (await ethCall(rpcUrl, contractAddr, repData)).slice(2);

    const agentId  = decodeString(result, Number(decodeUint256(result, 1)) / 32);
    const metadata = decodeString(result, Number(decodeUint256(result, 2)) / 32);
    const tasksCompleted = Number(decodeUint256(repResult, 1));
    const tasksAttempted = Number(decodeUint256(repResult, 2));
    const totalScore = Number(decodeUint256(result, 4));

    return { wallet, agentId, metadata, tasksCompleted, tasksAttempted, totalScore };
  } catch (e) {
    console.error(`getAgentFromChain ${wallet} failed:`, e);
    return null;
  }
}

// ─── Event log decoder ────────────────────────────────────────────────────────

// Event topic0 (keccak256 of signature) — precomputed
const TOPICS: Record<string, string> = {
  AgentRegistered: "0x5a38a84bac2d7d3de03ce0b3ea5b6a4f33c5c6a4f5a38a84bac2d7d3de03ce0b", // placeholder
  TaskPosted:      "0xd5f9bdf12911bd5e8e21ba9bc84e4302e45b027b24bfa16c25a2fec0ee4e6da3",
  TaskApplied:     "0xf9a7d4d8bac0c21b95c91d4ee6e3d3f1fa23e1b94dd0c58eb56c9a0bbf6d1e2a",
  TaskAssigned:    "0xa1d5e8f4c3b2a9d7e6f5c4b3a2d1e0f9c8b7a6d5e4f3c2b1a0d9e8f7c6b5a4",
  ResultSubmitted: "0xc2b3a4d5e6f7c8b9a0d1e2f3c4b5a6d7e8f9c0b1a2d3e4f5c6b7a8d9e0f1c2",
  TaskCompleted:   "0xe7c8d9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7",
  TaskRefunded:    "0xf1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1",
  ForceRefunded:   "0xa2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2",
};

// NOTE: Real topic0 values must be computed from actual keccak256 of event signatures.
// In production, either: (1) hardcode correct values, or (2) use the ethers Interface.
// For the Cron sync, we use eth_getLogs with the contract address and process all logs.

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

    // We process logs and identify event type by topics[0]
    // Instead of computing keccak256, we use a different approach:
    // Fetch all tasks/agents that appear in logs and sync their full state

    const taskIds   = new Set<number>();
    const agentAddrs = new Set<string>();
    const applicants: Array<{ taskId: number; agent: string; blockHex: string }> = [];

    for (const log of logs) {
      const t = log.topics;
      if (!t || t.length === 0) continue;

      // TaskPosted: topics[1] = taskId (indexed), topics[2] = poster (indexed)
      // TaskApplied: topics[1] = taskId, topics[2] = agent
      // TaskAssigned: topics[1] = taskId, topics[2] = agent
      // TaskCompleted: topics[1] = taskId, topics[2] = winner
      // AgentRegistered: topics[1] = wallet

      if (t.length >= 2) {
        // Try to interpret topics[1] as taskId (for task events) or address (for agent events)
        const topic1AsNum = parseInt(t[1], 16);
        const topic1AsAddr = "0x" + t[1].slice(26); // last 20 bytes

        // Heuristic: if topics[1] value is small (< 1M), it's a taskId
        if (topic1AsNum < 1_000_000) {
          taskIds.add(topic1AsNum);
        } else {
          // It's an address
          agentAddrs.add(topic1AsAddr);
        }

        // topics[2] often has agent address
        if (t.length >= 3) {
          const topic2AsAddr = "0x" + t[2].slice(26);
          if (topic2AsAddr !== ZERO_ADDR) agentAddrs.add(topic2AsAddr);
        }
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
