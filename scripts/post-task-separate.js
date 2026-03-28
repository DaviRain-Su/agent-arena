#!/usr/bin/env node
// scripts/post-task-separate.js
// Posts a task using a SEPARATE wallet (not the agent wallet)
// so the agent can apply for it.
//
// Usage: node scripts/post-task-separate.js
//
// The script will:
// 1. Generate (or reuse) a dedicated "poster" wallet
// 2. Fund it from the judge/deployer wallet
// 3. Post a task with OKB reward
// 4. Your agent daemon will discover and apply for it

import { ethers } from "ethers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC_URL       = process.env.XLAYER_RPC || process.env.RPC_URL || "https://rpc.xlayer.tech";
const FUNDER_KEY    = process.env.PRIVATE_KEY;
const CONTRACT_ADDR = process.env.CONTRACT_ADDRESS;

if (!FUNDER_KEY)    { console.error("❌ PRIVATE_KEY not set in .env"); process.exit(1); }
if (!CONTRACT_ADDR) { console.error("❌ CONTRACT_ADDRESS not set in .env"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const funder   = new ethers.Wallet(FUNDER_KEY, provider);
const artifact = JSON.parse(readFileSync(path.resolve(__dirname, "../artifacts/AgentArena.json"), "utf8"));

// ─── Poster Wallet (persistent, separate from agent) ──────────────────────────

const POSTER_KEY_FILE = path.join(os.homedir(), ".arena", "poster-key.json");

function getPosterWallet() {
  mkdirSync(path.dirname(POSTER_KEY_FILE), { recursive: true });
  if (existsSync(POSTER_KEY_FILE)) {
    const data = JSON.parse(readFileSync(POSTER_KEY_FILE, "utf8"));
    return new ethers.Wallet(data.privateKey, provider);
  }
  const wallet = ethers.Wallet.createRandom().connect(provider);
  writeFileSync(POSTER_KEY_FILE, JSON.stringify({ privateKey: wallet.privateKey, address: wallet.address }), { mode: 0o600 });
  console.log(`  Created new poster wallet: ${wallet.address}`);
  return wallet;
}

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const REWARD_OKB = "0.01";
  const reward     = ethers.parseEther(REWARD_OKB);
  const deadline   = Math.floor(Date.now() / 1000) + 3600;
  const evalCID    = "eval:" + Buffer.from(JSON.stringify(EVALUATION_STANDARD)).toString("base64");

  console.log("\n🏟️  Post Task (Separate Poster Wallet)\n");

  // 1. Get/create poster wallet
  const poster = getPosterWallet();
  console.log(`  Funder:    ${funder.address}`);
  console.log(`  Poster:    ${poster.address}`);
  console.log(`  Contract:  ${CONTRACT_ADDR}`);
  console.log(`  Reward:    ${REWARD_OKB} OKB`);
  console.log(`  Tests:     ${TEST_CASES.length} test cases\n`);

  // 2. Fund poster if needed (reward + gas)
  const posterBal = await provider.getBalance(poster.address);
  const needed    = reward + ethers.parseEther("0.005"); // reward + gas buffer
  if (posterBal < needed) {
    const fundAmount = needed - posterBal + ethers.parseEther("0.005"); // extra buffer
    process.stdout.write(`  Funding poster wallet (${ethers.formatEther(fundAmount)} OKB)... `);
    const tx = await funder.sendTransaction({ to: poster.address, value: fundAmount });
    await tx.wait();
    console.log("✅");
  } else {
    console.log(`  Poster balance: ${ethers.formatEther(posterBal)} OKB (sufficient)`);
  }

  // 3. Post task from poster wallet
  const contract = new ethers.Contract(CONTRACT_ADDR, artifact.abi, poster);
  process.stdout.write("  Posting task... ");
  const tx = await contract.postTask(TASK_DESCRIPTION, evalCID, deadline, { value: reward });
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find((e) => e?.name === "TaskPosted");

  const taskId = event?.args?.taskId;
  console.log("✅");
  console.log(`\n  Task ID:   #${taskId}`);
  console.log(`  Tx:        ${tx.hash}`);
  console.log(`  Poster:    ${poster.address} (NOT your agent)`);

  const explorerBase = RPC_URL.includes("test")
    ? "https://www.okx.com/web3/explorer/xlayer-test/tx/"
    : "https://www.okx.com/web3/explorer/xlayer/tx/";
  console.log(`  Explorer:  ${explorerBase}${tx.hash}`);

  // 4. Wait for agent to apply, then auto-assign
  const AGENT_ADDRESS = process.env.AGENT_ADDRESS || "0xE18756E756f0F471FA3f9559a22334a1be8D9bc9";
  console.log(`\n  Waiting for agent ${AGENT_ADDRESS.slice(0, 10)}... to apply...`);

  for (let i = 0; i < 12; i++) { // wait up to 6 min (12 * 30s)
    await new Promise(r => setTimeout(r, 30_000));
    const applied = await contract.hasApplied(taskId, AGENT_ADDRESS);
    if (applied) {
      process.stdout.write("  Agent applied! Assigning... ");
      const assignTx = await contract.assignTask(taskId, AGENT_ADDRESS);
      await assignTx.wait();
      console.log("✅");
      console.log(`  Assign Tx: ${assignTx.hash}`);
      console.log(`\n  ✅ Task #${taskId} assigned to ${AGENT_ADDRESS}`);
      console.log(`  Agent daemon will now execute and submit result.\n`);
      return;
    }
    process.stdout.write(".");
  }
  console.log(`\n  ⚠️  Agent did not apply within timeout. Assign manually:`);
  console.log(`     node -e "..." or use frontend UI\n`);
}

main().catch(err => {
  console.error(`\n❌ Failed: ${err.message}`);
  process.exit(1);
});
