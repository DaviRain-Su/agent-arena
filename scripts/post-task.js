#!/usr/bin/env node
// scripts/post-task.js — Post a task to Agent Arena
//
// Usage:
//   node scripts/post-task.js
//   node scripts/post-task.js --reward 0.05 --deadline 2h
//
// Requires: PRIVATE_KEY and CONTRACT_ADDRESS in .env

import { ethers } from "ethers";
import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC_URL       = process.env.XLAYER_RPC || process.env.RPC_URL || "https://rpc.xlayer.tech";
const PRIVATE_KEY   = process.env.PRIVATE_KEY;
const CONTRACT_ADDR = process.env.CONTRACT_ADDRESS;

if (!PRIVATE_KEY)   { console.error("❌ PRIVATE_KEY not set"); process.exit(1); }
if (!CONTRACT_ADDR) { console.error("❌ CONTRACT_ADDRESS not set"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
const artifact = JSON.parse(readFileSync(path.resolve(__dirname, "../artifacts/AgentArena.json"), "utf8"));
const contract = new ethers.Contract(CONTRACT_ADDR, artifact.abi, wallet);

// ─── Task Definition ──────────────────────────────────────────────────────────

const TASK_DESCRIPTION = `Write a JavaScript function called 'fibonacci' that:
1. Takes a number n as argument
2. Returns the nth Fibonacci number (0-indexed: fib(0)=0, fib(1)=1, fib(2)=1, ...)
3. Must handle n=0 and n=1 as base cases
4. Should be efficient (no exponential recursion)

Return ONLY the function code. Start with: function fibonacci(`;

const TEST_CASES = [
  { desc: "fib(0) = 0",  input: [0],  expected: 0 },
  { desc: "fib(1) = 1",  input: [1],  expected: 1 },
  { desc: "fib(2) = 1",  input: [2],  expected: 1 },
  { desc: "fib(5) = 5",  input: [5],  expected: 5 },
  { desc: "fib(10) = 55", input: [10], expected: 55 },
  { desc: "fib(20) = 6765", input: [20], expected: 6765 },
];

const EVALUATION_STANDARD = {
  type: "test_cases",
  functionName: "fibonacci",
  cases: TEST_CASES,
  scoring: { test_weight: 60, quality_weight: 40 },
};

// ─── Parse CLI args ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let rewardOKB = "0.01";
let deadlineHours = 1;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--reward" && args[i + 1]) rewardOKB = args[++i];
  if (args[i] === "--deadline" && args[i + 1]) {
    const val = args[++i];
    deadlineHours = val.endsWith("h") ? parseFloat(val) : parseFloat(val) / 3600;
  }
}

// ─── Post Task ────────────────────────────────────────────────────────────────

async function main() {
  const reward   = ethers.parseEther(rewardOKB);
  const deadline = Math.floor(Date.now() / 1000) + Math.round(deadlineHours * 3600);
  const evalCID  = "eval:" + Buffer.from(JSON.stringify(EVALUATION_STANDARD)).toString("base64");

  console.log("\n🏟️  Posting Task to Agent Arena\n");
  console.log(`  Poster:    ${wallet.address}`);
  console.log(`  Contract:  ${CONTRACT_ADDR}`);
  console.log(`  RPC:       ${RPC_URL}`);
  console.log(`  Reward:    ${rewardOKB} OKB`);
  console.log(`  Deadline:  ${deadlineHours}h (${new Date(deadline * 1000).toLocaleString()})`);
  console.log(`  Tests:     ${TEST_CASES.length} test cases`);
  console.log(`  Task:      fibonacci function\n`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance:   ${ethers.formatEther(balance)} OKB`);
  if (balance < reward) {
    console.error(`\n❌ Insufficient balance. Need ${rewardOKB} OKB, have ${ethers.formatEther(balance)} OKB`);
    process.exit(1);
  }

  process.stdout.write("  Posting task... ");
  const tx = await contract.postTask(TASK_DESCRIPTION, evalCID, deadline, { value: reward });
  const receipt = await tx.wait();

  const event = receipt.logs
    .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "TaskPosted");

  const taskId = event?.args?.taskId;

  console.log("✅");
  console.log(`\n  Task ID:   #${taskId}`);
  console.log(`  Tx:        ${tx.hash}`);

  const explorerBase = RPC_URL.includes("test")
    ? "https://www.okx.com/web3/explorer/xlayer-test/tx/"
    : "https://www.okx.com/web3/explorer/xlayer/tx/";
  console.log(`  Explorer:  ${explorerBase}${tx.hash}`);

  console.log(`\n  Agents can now apply with: arena start`);
  console.log(`  Or apply manually:         contract.applyForTask(${taskId})\n`);
}

main().catch(err => {
  console.error(`\n❌ Failed: ${err.message}`);
  process.exit(1);
});
