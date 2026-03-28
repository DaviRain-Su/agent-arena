// scripts/demo.js — Agent Arena End-to-End Demo
// 3 Claude Agents compete on a real coding task with test case execution
// Uses OKX OnchainOS for Agent wallet management (falls back to local wallet)
//
// Usage:
//   node scripts/demo.js              (OnchainOS enabled)
//   USE_ONCHAINOS=false node scripts/demo.js  (local wallet fallback)

import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { createRequire } from "module";
import { createHash } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

import { NodeVMProvider, runTests, calcScore } from "../sandbox/dist/index.js";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── ANSI Colors ──────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  dim:   "\x1b[2m",
  cyan:  "\x1b[36m",
  green: "\x1b[32m",
  red:   "\x1b[31m",
  yellow:"\x1b[33m",
  blue:  "\x1b[34m",
  magenta:"\x1b[35m",
  white: "\x1b[37m",
};
const B = (s) => `${c.bold}${s}${c.reset}`;
const G = (s) => `${c.green}${s}${c.reset}`;
const R = (s) => `${c.red}${s}${c.reset}`;
const Y = (s) => `${c.yellow}${s}${c.reset}`;
const Cy = (s) => `${c.cyan}${s}${c.reset}`;
const Di = (s) => `${c.dim}${s}${c.reset}`;

// ─── Config ───────────────────────────────────────────────────────────────────
const RPC_URL         = process.env.XLAYER_RPC || "https://testrpc.xlayer.tech/terigon";
const PRIVATE_KEY     = process.env.PRIVATE_KEY;
const CONTRACT_ADDR   = process.env.CONTRACT_ADDRESS;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const USE_ONCHAINOS   = process.env.USE_ONCHAINOS !== "false";
const XLAYER_CHAIN_ID = "1952";

// 3 Agent identities
const AGENT_CONFIGS = [
  {
    id: "openclaw-alpha",
    name: "OpenClaw Alpha",
    emoji: "🦅",
    color: c.cyan,
    systemPrompt: "You are a senior engineer who prioritizes clean, readable code with excellent error handling. Write production-quality TypeScript."
  },
  {
    id: "codex-beta",
    name: "Codex Beta",
    emoji: "⚡",
    color: c.yellow,
    systemPrompt: "You are a performance-focused engineer. Optimize for correctness and speed. Use modern TypeScript features and idiomatic patterns."
  },
  {
    id: "opencode-gamma",
    name: "OpenCode Gamma",
    emoji: "🎯",
    color: c.magenta,
    systemPrompt: "You are a pragmatic engineer who values simplicity above all. Write the simplest possible correct TypeScript solution — no over-engineering."
  }
];

// ─── Task with Test Cases ─────────────────────────────────────────────────────
const TASK_DESCRIPTION = `Write a TypeScript function called 'deepMerge' that:
1. Takes two objects as arguments (Record<string, unknown>)
2. Recursively merges nested objects (deep merge, not shallow)
3. Arrays should be concatenated (not replaced)
4. Returns the merged result without mutating either input
5. Handles null/undefined values gracefully (treat as empty object)

Return ONLY the function code, no imports, no exports, no explanations.
Start with: function deepMerge(`;

const TEST_CASES = [
  {
    desc: "Basic nested merge",
    input: [{ a: 1, b: { c: 2 } }, { b: { d: 3 }, e: 4 }],
    expected: { a: 1, b: { c: 2, d: 3 }, e: 4 }
  },
  {
    desc: "Array concatenation",
    input: [{ arr: [1, 2] }, { arr: [3, 4] }],
    expected: { arr: [1, 2, 3, 4] }
  },
  {
    desc: "Null/undefined handling",
    input: [{ a: null }, { a: 1, b: undefined }],
    expected: { a: null, b: undefined }
  },
  {
    desc: "No mutation of inputs",
    input: [{ x: { y: 1 } }, { x: { z: 2 } }],
    expected: { x: { y: 1, z: 2 } }
  },
  {
    desc: "Deep nesting",
    input: [{ a: { b: { c: 1 } } }, { a: { b: { d: 2 } } }],
    expected: { a: { b: { c: 1, d: 2 } } }
  }
];

const EVALUATION_STANDARD = {
  type: "test_cases",
  description: "deepMerge function must pass all 5 test cases",
  cases: TEST_CASES,
  scoring: {
    test_weight: 60,    // 60 points from test pass rate
    quality_weight: 40  // 40 points from LLM code quality review
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sep(title = "", color = c.cyan) {
  const line = "─".repeat(58);
  if (title) {
    const pad = Math.max(0, 58 - title.length - 4);
    console.log(`\n${color}┌${line}┐${c.reset}`);
    console.log(`${color}│ ${c.reset}${B(title)}${" ".repeat(pad)}${color} │${c.reset}`);
    console.log(`${color}└${line}┘${c.reset}`);
  } else {
    console.log(`${color}${line}${c.reset}`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Sandbox-based Test Execution ─────────────────────────────────────────────
// Uses @agent-arena/sandbox (NodeVMProvider now, Sandbank DaytonaAdapter in V2)
const sandboxProvider = new NodeVMProvider();

async function runTestCases(agentCode) {
  return runTests(sandboxProvider, agentCode, "deepMerge", TEST_CASES);
}

function calcTestScore(results) {
  return calcScore(results, EVALUATION_STANDARD.scoring.test_weight);
}

// ─── OnchainOS helpers ────────────────────────────────────────────────────────
function onchainos(args) {
  const result = spawnSync("onchainos", args, { encoding: "utf8", env: { ...process.env } });
  if (result.error) return { ok: false, stdout: "", stderr: result.error.message, code: -1 };
  return { ok: true, stdout: result.stdout || "", stderr: result.stderr || "", code: result.status };
}

async function getAgentWallet(agentId, provider) {
  if (!USE_ONCHAINOS) {
    const seed = ethers.keccak256(ethers.toUtf8Bytes(`agent:${agentId}:${PRIVATE_KEY?.slice(0, 16)}`));
    return new ethers.Wallet(seed, provider);
  }
  const status = onchainos(["wallet", "status"]);
  if (!status.ok || status.code !== 0) {
    const seed = ethers.keccak256(ethers.toUtf8Bytes(`agent:${agentId}:${PRIVATE_KEY?.slice(0, 16)}`));
    return new ethers.Wallet(seed, provider);
  }
  const addrResult = onchainos(["wallet", "addresses", "--chain", XLAYER_CHAIN_ID]);
  if (addrResult.ok) {
    const match = addrResult.stdout.match(/0x[a-fA-F0-9]{40}/);
    if (match) return { address: match[0], isOnchainOS: true };
  }
  const seed = ethers.keccak256(ethers.toUtf8Bytes(`agent:${agentId}:${PRIVATE_KEY?.slice(0, 16)}`));
  return new ethers.Wallet(seed, provider);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!PRIVATE_KEY)   throw new Error("PRIVATE_KEY not set");
  if (!CONTRACT_ADDR) throw new Error("CONTRACT_ADDRESS not set — run deploy.js first");
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const claude   = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const judgeWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const artifact = JSON.parse(readFileSync(path.resolve(__dirname, "../artifacts/AgentArena.json"), "utf8"));
  const contract = new ethers.Contract(CONTRACT_ADDR, artifact.abi, judgeWallet);

  // ── Header ──────────────────────────────────────────────────────────────────
  console.clear();
  console.log(`\n${c.cyan}${c.bold}`);
  console.log(`  ╔═══════════════════════════════════════════╗`);
  console.log(`  ║         🏟️  AGENT ARENA LIVE DEMO          ║`);
  console.log(`  ║     Decentralized AI Task Marketplace      ║`);
  console.log(`  ╚═══════════════════════════════════════════╝${c.reset}`);
  console.log(`\n  ${Di("Contract:")}  ${CONTRACT_ADDR}`);
  console.log(`  ${Di("Judge:")}     ${judgeWallet.address}`);
  console.log(`  ${Di("Network:")}   X-Layer Testnet (chainId: ${XLAYER_CHAIN_ID})`);
  console.log(`  ${Di("Wallet:")}    ${USE_ONCHAINOS ? G("OKX Agentic Wallet (TEE)") : Y("Local Derived Wallet")}`);

  // ── Step 1: Agent Wallets ────────────────────────────────────────────────────
  sep("Step 1 — Initialize Agent Wallets");
  const agentWallets = [];
  for (const cfg of AGENT_CONFIGS) {
    process.stdout.write(`  ${cfg.emoji} ${cfg.color}${cfg.name}${c.reset} ... `);
    const wallet = await getAgentWallet(cfg.id, provider);
    agentWallets.push(wallet);
    const addr = wallet.address || await wallet.getAddress?.();
    console.log(G("✓") + `  ${Di(addr)}`);

    // Fund if local wallet and low balance
    if (!wallet.isOnchainOS) {
      const bal = await provider.getBalance(addr);
      if (bal < ethers.parseEther("0.002")) {
        process.stdout.write(`     ${Di("Funding for gas...")} `);
        const tx = await judgeWallet.sendTransaction({ to: addr, value: ethers.parseEther("0.003") });
        await tx.wait();
        console.log(G("✓"));
      }
    }
  }

  // ── Step 2: Register Agents ──────────────────────────────────────────────────
  sep("Step 2 — Register Agent Nodes On-Chain");
  const agentContracts = agentWallets.map(w =>
    w.isOnchainOS ? contract : contract.connect(w)
  );

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    const addr = agentWallets[i].address || await agentWallets[i].getAddress?.();
    const info = await contract.agents(addr);
    process.stdout.write(`  ${cfg.emoji} ${cfg.color}${cfg.name}${c.reset} ... `);
    if (!info.registered) {
      const metadata = JSON.stringify({ capabilities: ["coding", "typescript"], model: "claude" });
      const tx = await agentContracts[i].registerAgent(cfg.id, metadata);
      await tx.wait();
      console.log(G("✓ Registered") + `  ${Di(tx.hash.slice(0, 18) + "...")}`);
    } else {
      console.log(G("✓ Already registered"));
    }
  }

  // ── Step 3: Post Task ────────────────────────────────────────────────────────
  sep("Step 3 — Post Task with OKB Escrow");
  const REWARD   = ethers.parseEther("0.01");
  const DEADLINE = Math.floor(Date.now() / 1000) + 3600;
  const evalCID  = "eval:" + createHash("sha256").update(JSON.stringify(EVALUATION_STANDARD)).digest("hex").slice(0, 16);

  console.log(`  ${Di("Task:")}     TypeScript deepMerge function`);
  console.log(`  ${Di("Reward:")}   ${ethers.formatEther(REWARD)} OKB`);
  console.log(`  ${Di("Tests:")}    ${TEST_CASES.length} test cases (real execution)`);
  console.log(`  ${Di("EvalCID:")}  ${evalCID}`);
  process.stdout.write(`\n  Locking ${ethers.formatEther(REWARD)} OKB in escrow ... `);

  const postTx = await contract.postTask(TASK_DESCRIPTION, evalCID, DEADLINE, { value: REWARD });
  const postReceipt = await postTx.wait();
  const taskPostedEvent = postReceipt.logs
    .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "TaskPosted");
  const taskId = taskPostedEvent.args.taskId;

  console.log(G("✓"));
  console.log(`  ${Di("Task #:")}   ${taskId}`);
  console.log(`  ${Di("Explorer:")} https://www.okx.com/web3/explorer/xlayer-test/tx/${postTx.hash}`);

  // ── Step 4: Apply ────────────────────────────────────────────────────────────
  sep("Step 4 — Agents Apply for Task");
  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    process.stdout.write(`  ${cfg.emoji} ${cfg.color}${cfg.name}${c.reset} applying ... `);
    const tx = await agentContracts[i].applyForTask(taskId);
    await tx.wait();
    console.log(G("✓ Applied"));
  }

  // ── Step 5: Execute (Real!) ──────────────────────────────────────────────────
  sep("Step 5 — Agents Solve Task (Parallel Execution)");
  console.log(`  ${Di("Running 3 Claude instances concurrently...")}\n`);

  const spinners = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  let spinIdx = 0;
  const solveStart = Date.now();

  // Show live progress
  const status = AGENT_CONFIGS.map(() => "solving");
  const printStatus = () => {
    process.stdout.write("\r");
    AGENT_CONFIGS.forEach((cfg, i) => {
      const s = status[i];
      const icon = s === "solving" ? Y(spinners[spinIdx % spinners.length]) : G("✓");
      process.stdout.write(`  ${icon} ${cfg.color}${cfg.id}${c.reset}  `);
    });
  };

  const spinInterval = setInterval(() => { spinIdx++; printStatus(); }, 80);

  const solutions = await Promise.all(
    AGENT_CONFIGS.map(async (cfg, i) => {
      const response = await claude.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        system: cfg.systemPrompt,
        messages: [{ role: "user", content: TASK_DESCRIPTION }]
      });
      status[i] = "done";
      return { agentIndex: i, agentName: cfg.name, cfg, code: response.content[0].text.trim() };
    })
  );

  clearInterval(spinInterval);
  printStatus();
  console.log(`\n\n  ${Di("All agents finished in")} ${((Date.now() - solveStart) / 1000).toFixed(1)}s`);

  // ── Step 6: Real Test Execution ──────────────────────────────────────────────
  sep("Step 6 — Execute Test Cases (Real Code Runs)");

  const testResults = await Promise.all(solutions.map(async s => {
    const results = await runTestCases(s.code);
    const testScore = calcTestScore(results);
    return { ...s, testResults: results, testScore };
  }));

  for (const s of testResults) {
    const cfg = s.cfg;
    const passed = s.testResults.filter(r => r.passed).length;
    console.log(`\n  ${cfg.emoji} ${cfg.color}${B(cfg.name)}${c.reset}`);
    for (const r of s.testResults) {
      const icon = r.passed ? G("✓") : R("✗");
      const label = r.passed ? G("PASS") : R("FAIL");
      console.log(`     ${icon} ${r.desc.padEnd(30)} ${label}`);
      if (!r.passed && r.error) console.log(`       ${Di("Error: " + r.error.slice(0, 60))}`);
    }
    const bar = "█".repeat(passed) + "░".repeat(TEST_CASES.length - passed);
    console.log(`     ${Di("Tests:")} [${bar}] ${passed}/${TEST_CASES.length} → ${c.bold}${s.testScore} pts${c.reset}`);
  }

  // ── Step 7: LLM Code Quality Review ─────────────────────────────────────────
  sep("Step 7 — Judge: Code Quality Review (LLM)");
  console.log(`  ${Di("Evaluating code quality for 40% of score...")}\n`);

  const codeBlock = testResults.map((s, i) =>
    `=== Agent ${i + 1}: ${s.agentName} ===\n${s.code}`
  ).join("\n\n");

  const judgeResponse = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: `You are a strict code reviewer. Default stance: skeptical. Evaluate code on:
- Readability & naming (0-15)
- Error handling & edge cases (0-15)  
- TypeScript type safety (0-10)
Return ONLY valid JSON, no explanation outside JSON:
{"scores":[{"agentIndex":0,"qualityScore":28},{"agentIndex":1,"qualityScore":35},{"agentIndex":2,"qualityScore":31}],"reasoning":["reason0","reason1","reason2"]}`,
    messages: [{ role: "user", content: `Task: deepMerge function\n\n${codeBlock}` }]
  });

  const raw = judgeResponse.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const qualityJudgment = JSON.parse(jsonMatch[0]);

  // ── Final Scores ─────────────────────────────────────────────────────────────
  sep("📊 Final Scores", c.green);

  const finalScores = testResults.map((s, i) => {
    const quality = qualityJudgment.scores.find(q => q.agentIndex === i);
    const qualityScore = quality?.qualityScore || 0;
    const total = s.testScore + qualityScore;
    const reasoning = qualityJudgment.reasoning?.[i] || "";
    return { ...s, qualityScore, total, reasoning };
  });

  finalScores.sort((a, b) => b.total - a.total);

  for (let rank = 0; rank < finalScores.length; rank++) {
    const s = finalScores[rank];
    const cfg = s.cfg;
    const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉";
    const bar = "█".repeat(Math.floor(s.total / 10)) + "░".repeat(10 - Math.floor(s.total / 10));
    console.log(`\n  ${medal} ${cfg.color}${B(cfg.name)}${c.reset}`);
    console.log(`     ${Di("Tests:")}   ${s.testScore}/60   ${Di("Quality:")} ${s.qualityScore}/40   ${c.bold}Total: ${s.total}/100${c.reset}`);
    console.log(`     [${Cy(bar)}]`);
    if (s.reasoning) console.log(`     ${Di(s.reasoning.slice(0, 80))}`);
  }

  const winner = finalScores[0];
  const secondPlace = finalScores[1];
  console.log(`\n  ${c.cyan}${c.bold}🏆 WINNER: ${winner.agentName} (${winner.total}/100)${c.reset}`);

  // ── Step 8: On-Chain Settlement ──────────────────────────────────────────────
  sep("Step 8 — On-Chain Settlement");

  const winnerAddr = agentWallets[winner.agentIndex].address || await agentWallets[winner.agentIndex].getAddress?.();
  const secondAddr = agentWallets[secondPlace.agentIndex].address || await agentWallets[secondPlace.agentIndex].getAddress?.();

  // Assign to winner
  process.stdout.write(`  Assigning task to winner ... `);
  const assignTx = await contract.assignTask(taskId, winnerAddr);
  await assignTx.wait();
  console.log(G("✓"));

  // Winner submits result
  process.stdout.write(`  Winner submitting result ... `);
  const resultHash = `eval:${createHash("sha256").update(winner.code).digest("hex").slice(0, 16)}`;
  const submitTx = await agentContracts[winner.agentIndex].submitResult(taskId, resultHash);
  await submitTx.wait();
  console.log(G("✓"));

  // Judge releases payment
  process.stdout.write(`  Judge releasing ${ethers.formatEther(REWARD)} OKB ... `);
  const reasonURI = `reason:score=${winner.total},tests=${winner.testResults.filter(r=>r.passed).length}/${TEST_CASES.length}`;
  const judgeTx = await contract.judgeAndPay(taskId, winner.total, winnerAddr, reasonURI);
  await judgeTx.wait();
  console.log(G("✓"));
  console.log(`  ${Di("Tx:")} https://www.okx.com/web3/explorer/xlayer-test/tx/${judgeTx.hash}`);

  // Consolation prize (10%)
  const consolation = REWARD / 10n;
  process.stdout.write(`  Consolation prize (10%) to ${secondPlace.agentName} ... `);
  const consoleTx = await contract.payConsolation(taskId, secondAddr, { value: consolation });
  await consoleTx.wait();
  console.log(G("✓"));

  // ── Summary ──────────────────────────────────────────────────────────────────
  sep("🎉 Demo Complete!", c.green);
  console.log(`\n  ${B("Task #" + taskId)} completed on X-Layer Testnet`);
  console.log(`  ${Di("Winner:")}  ${winner.agentName} (${winnerAddr.slice(0,10)}...)`);
  console.log(`  ${Di("Score:")}   ${winner.total}/100 (${winner.testResults.filter(r=>r.passed).length}/${TEST_CASES.length} tests passed)`);
  console.log(`  ${Di("Reward:")}  ${ethers.formatEther(REWARD)} OKB auto-paid on-chain`);
  console.log(`  ${Di("2nd:")}     ${secondPlace.agentName} received ${ethers.formatEther(consolation)} OKB consolation`);
  console.log(`  ${Di("Judge:")}   Reason stored on-chain: ${reasonURI}`);
  console.log(`  ${Di("Wallet:")}  ${USE_ONCHAINOS ? "OKX Agentic Wallet (TEE)" : "Local derived wallet"}`);

  sep("📈 Network State");
  const agentCount = await contract.getAgentCount();
  const totalTasks = await contract.taskCount();
  console.log(`\n  Registered Agents: ${B(agentCount.toString())}`);
  console.log(`  Total Tasks:       ${B(totalTasks.toString())}`);
  for (const s of finalScores) {
    const addr = agentWallets[s.agentIndex].address || await agentWallets[s.agentIndex].getAddress?.();
    const rep = await contract.getAgentReputation(addr);
    const wallet = agentWallets[s.agentIndex].isOnchainOS ? Di("[TEE]") : Di("[local]");
    console.log(`  ${s.cfg.emoji} ${s.cfg.color}${s.agentName}${c.reset}: ${rep.completed} tasks, win rate ${rep.winRate}% ${wallet}`);
  }
  console.log();
}

main().catch(err => {
  console.error(`\n${R("❌ Demo failed:")} ${err.message}`);
  process.exit(1);
});
