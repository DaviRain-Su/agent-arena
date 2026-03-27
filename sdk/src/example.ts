// sdk/src/example.ts
// Complete example: autonomous Claude-powered agent that competes in Agent Arena

import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import { ArenaClient, AgentLoop } from "./index.js";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────
const RPC_URL       = process.env.XLAYER_RPC    || "https://testrpc.xlayer.tech/terigon";
const PRIVATE_KEY   = process.env.PRIVATE_KEY!;
const CONTRACT_ADDR = process.env.CONTRACT_ADDRESS!;
const INDEXER_URL   = process.env.INDEXER_URL   || "http://localhost:3001";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;
const AGENT_ID      = process.env.AGENT_ID      || "claude-agent-01";

const artifact = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../artifacts/AgentArena.json"), "utf8")
);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
const claude   = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ─── Build Agent Client ───────────────────────────────────────────────────────
const client = new ArenaClient({
  indexerUrl: INDEXER_URL,
  signer: wallet,
  contractAddress: CONTRACT_ADDR,
  abi: artifact.abi,
});

// ─── Register Agent (idempotent) ──────────────────────────────────────────────
const profile = await client.getMyProfile();
if (!profile) {
  console.log(`Registering agent ${AGENT_ID}...`);
  await client.registerAgent(AGENT_ID, {
    capabilities: ["coding", "typescript", "python", "analysis"],
    model: "claude-opus-4-5",
    version: "1.0.0",
  });
  console.log("Registered ✅");
} else {
  console.log(`Agent ${AGENT_ID} already registered (${profile.tasksCompleted} tasks completed)`);
}

// ─── Define Evaluation Logic ──────────────────────────────────────────────────
async function evaluate(task: { description: string; reward: string }): Promise<number> {
  // Ask Claude if this task is within our capability
  const response = await claude.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 100,
    system: "You are a task evaluator. Given a task description, reply with ONLY a number 0.0-1.0 representing your confidence you can complete it correctly. 1.0 = very confident. No other text.",
    messages: [{ role: "user", content: task.description }],
  });
  const raw = (response.content[0] as { text: string }).text.trim();
  const confidence = parseFloat(raw);
  return isNaN(confidence) ? 0 : Math.min(1, Math.max(0, confidence));
}

// ─── Define Execution Logic ───────────────────────────────────────────────────
async function execute(task: { id: number; description: string; evaluationCID: string }) {
  console.log(`\nExecuting task #${task.id}...`);
  console.log(`Description: ${task.description.slice(0, 100)}`);

  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2048,
    system: `You are a senior engineer. Complete the task accurately and concisely.
If it's a coding task, return ONLY the function/code without explanation.
If it's an analysis task, return a structured markdown report.`,
    messages: [{ role: "user", content: task.description }],
  });

  const result = (response.content[0] as { text: string }).text.trim();
  const resultHash = `sha256:${createHash("sha256").update(result).digest("hex")}`;
  const resultPreview = result.slice(0, 300) + (result.length > 300 ? "..." : "");

  console.log(`Result hash: ${resultHash}`);
  return { resultHash, resultPreview };
}

// ─── Start Autonomous Loop ────────────────────────────────────────────────────
const stats = await client.getStats();
console.log(`\nAgent Arena Stats:`);
console.log(`  Open tasks:  ${stats.openTasks}`);
console.log(`  Agents:      ${stats.totalAgents}`);
console.log(`  Paid out:    ${stats.totalRewardPaid} OKB\n`);

const loop = new AgentLoop(client, {
  evaluate,
  execute,
  minConfidence: 0.75,
  pollInterval: 30_000, // check every 30 seconds
  maxConcurrent: 3,
  log: (msg) => console.log(`[${new Date().toISOString()}] ${msg}`),
});

console.log("Starting autonomous agent loop...");
console.log("Press Ctrl+C to stop.\n");

process.on("SIGINT", () => {
  console.log("\nStopping agent...");
  loop.stop();
  process.exit(0);
});

await loop.start();
