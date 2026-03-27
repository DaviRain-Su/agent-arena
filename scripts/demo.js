// scripts/demo.js
// Full end-to-end demo using OKX OnchainOS for Agent wallet management
// Agents register on-chain, compete for a task, get paid via smart contract
//
// Prerequisites:
//   1. onchainos CLI installed (npx onchainos or from onchainos-skills)
//   2. OKX API credentials in .env (OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE)
//   3. Contract deployed: CONTRACT_ADDRESS in .env
//   4. Anthropic API key in .env (ANTHROPIC_API_KEY)
//   5. JUDGE_ADDRESS (wallet that calls judgeAndPay) funded with OKB

import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL        = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";
const PRIVATE_KEY    = process.env.PRIVATE_KEY;          // Judge / deployer wallet
const CONTRACT_ADDR  = process.env.CONTRACT_ADDRESS;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const USE_ONCHAINOS  = process.env.USE_ONCHAINOS !== "false"; // default on

// X-Layer chain ID for onchainos
const XLAYER_CHAIN_ID = "196";

// Three Agent identities — each gets an Agentic Wallet via OnchainOS
const AGENT_CONFIGS = [
  {
    id: "openclaw-alpha",
    name: "OpenClaw Alpha",
    systemPrompt: "You are a senior software engineer who prioritizes clean, readable code with excellent error handling. Write production-quality solutions.",
  },
  {
    id: "codex-beta",
    name: "Codex Beta",
    systemPrompt: "You are a performance-focused engineer. Optimize for speed and correctness. Use modern language features and idiomatic patterns.",
  },
  {
    id: "opencode-gamma",
    name: "OpenCode Gamma",
    systemPrompt: "You are a pragmatic engineer who values simplicity above all. Write the simplest possible correct solution — no over-engineering.",
  }
];

// ─── OnchainOS helpers ────────────────────────────────────────────────────────

/**
 * Run an onchainos CLI command and return stdout.
 * Falls back gracefully if onchainos is not installed.
 */
function onchainos(args, opts = {}) {
  const cmd = ["onchainos", ...args].join(" ");
  try {
    const result = spawnSync("onchainos", args, {
      encoding: "utf8",
      env: { ...process.env },
      ...opts,
    });
    if (result.error) throw result.error;
    return { ok: true, stdout: result.stdout || "", stderr: result.stderr || "", code: result.status };
  } catch (err) {
    return { ok: false, stdout: "", stderr: err.message, code: -1 };
  }
}

/**
 * Get or create an Agentic Wallet for an Agent via OnchainOS.
 * Returns the agent's wallet address on X-Layer.
 */
async function getAgentWallet(agentId) {
  if (!USE_ONCHAINOS) {
    // Fallback: derive deterministic wallet from private key + agent id
    const seed = ethers.keccak256(ethers.toUtf8Bytes(`agent:${agentId}:${PRIVATE_KEY?.slice(0, 16)}`));
    return new ethers.Wallet(seed);
  }

  console.log(`  🔑 [OnchainOS] Getting Agentic Wallet for ${agentId}...`);

  // Check wallet status
  const status = onchainos(["wallet", "status"]);
  if (!status.ok || status.code !== 0) {
    console.log(`  ⚠️  OnchainOS not available, falling back to local wallet`);
    const seed = ethers.keccak256(ethers.toUtf8Bytes(`agent:${agentId}:${PRIVATE_KEY?.slice(0, 16)}`));
    return new ethers.Wallet(seed);
  }

  // Get address for this agent on X-Layer
  const addrResult = onchainos(["wallet", "addresses", "--chain", XLAYER_CHAIN_ID]);
  if (addrResult.ok && addrResult.code === 0) {
    // Parse EVM address from output
    const match = addrResult.stdout.match(/0x[a-fA-F0-9]{40}/);
    if (match) {
      console.log(`  ✅ Agentic Wallet: ${match[0]}`);
      // Return a signer-like object backed by OnchainOS TEE
      return createOnchainOSSigner(match[0], agentId);
    }
  }

  console.log(`  ⚠️  Could not get OnchainOS wallet, using derived wallet`);
  const seed = ethers.keccak256(ethers.toUtf8Bytes(`agent:${agentId}:${PRIVATE_KEY?.slice(0, 16)}`));
  return new ethers.Wallet(seed);
}

/**
 * Creates a signer object backed by OnchainOS TEE signing.
 * Signs transactions via `onchainos wallet send` instead of exposing private key.
 */
function createOnchainOSSigner(address, agentId) {
  return {
    address,
    agentId,
    isOnchainOS: true,
    getAddress: () => Promise.resolve(address),
    // For contract calls that need signing, use onchainos gateway
    sendTransaction: async (tx) => {
      console.log(`  🔗 [OnchainOS TEE] Signing tx for ${agentId}...`);
      // Use onchainos wallet contract-call for contract interactions
      const result = onchainos([
        "wallet", "contract-call",
        "--chain", XLAYER_CHAIN_ID,
        "--to", tx.to,
        "--data", tx.data || "0x",
        "--amt", tx.value ? tx.value.toString() : "0",
      ]);
      if (!result.ok) throw new Error(`OnchainOS tx failed: ${result.stderr}`);
      // Parse tx hash from output
      const hashMatch = result.stdout.match(/0x[a-fA-F0-9]{64}/);
      return { hash: hashMatch?.[0] || "pending", wait: () => Promise.resolve({ status: 1 }) };
    },
  };
}

/**
 * Check balance of an agent wallet via OnchainOS.
 */
function checkAgentBalance(address) {
  if (!USE_ONCHAINOS) return null;
  const result = onchainos(["wallet", "balance", "--chain", XLAYER_CHAIN_ID]);
  if (result.ok && result.code === 0) {
    console.log(`  💰 [OnchainOS] Balance check for ${address.slice(0,10)}...`);
    const match = result.stdout.match(/OKB[\s:]+([0-9.]+)/i);
    return match ? parseFloat(match[1]) : null;
  }
  return null;
}

/**
 * Broadcast a pre-signed transaction via OnchainOS Gateway.
 */
function broadcastViGateway(signedTx) {
  console.log(`  📡 [OnchainOS Gateway] Broadcasting transaction...`);
  const result = onchainos(["gateway", "broadcast", "--chain", XLAYER_CHAIN_ID, "--signed-tx", signedTx]);
  if (result.ok && result.code === 0) {
    const hashMatch = result.stdout.match(/0x[a-fA-F0-9]{64}/);
    return hashMatch?.[0] || null;
  }
  return null;
}

/**
 * Estimate gas via OnchainOS Gateway.
 */
function estimateGas(to, data, value = "0") {
  if (!USE_ONCHAINOS) return null;
  const result = onchainos([
    "gateway", "gas",
    "--chain", XLAYER_CHAIN_ID,
    "--to", to,
    "--data", data,
    "--value", value,
  ]);
  if (result.ok && result.code === 0) {
    const match = result.stdout.match(/gasLimit[:\s]+([0-9]+)/i);
    return match ? match[1] : null;
  }
  return null;
}

// ─── ABI & Contract helpers ───────────────────────────────────────────────────

function loadArtifact() {
  const artifact = JSON.parse(readFileSync(path.resolve(__dirname, "../artifacts/AgentArena.json"), "utf8"));
  const deployment = JSON.parse(readFileSync(path.resolve(__dirname, "../artifacts/deployment.json"), "utf8"));
  return { artifact, deployment };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function separator(title = "") {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  if (title) console.log(`  ${title}`);
  console.log(line);
}

// ─── Agent task execution (Claude LLM) ────────────────────────────────────────

async function runAgent(claude, agentConfig, taskDescription) {
  console.log(`  🤖 ${agentConfig.name} solving task...`);
  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: agentConfig.systemPrompt,
    messages: [{ role: "user", content: `Solve this task. Provide ONLY the code solution:\n\n${taskDescription}` }]
  });
  return response.content[0].text.trim();
}

// ─── Judge evaluation ─────────────────────────────────────────────────────────

async function judgeSubmissions(claude, taskDescription, submissions) {
  console.log("\n  ⚖️  Judge Agent evaluating all submissions...");
  const submissionText = submissions.map((s, i) =>
    `=== Agent ${i + 1}: ${s.agentName} ===\n${s.code}`
  ).join("\n\n");

  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: `You are a strict code reviewer. Default stance: skeptical. Assume code has issues unless proven otherwise.
Evaluate on: Correctness (0-40), Code Quality (0-30), Robustness (0-30).
Return ONLY valid JSON:
{
  "scores": [{"agentIndex":0,"score":85,"summary":"reason"},{"agentIndex":1,"score":72,"summary":"reason"},{"agentIndex":2,"score":91,"summary":"reason"}],
  "winner": 2,
  "verdict": "one sentence comparison"
}`,
    messages: [{ role: "user", content: `Task: ${taskDescription}\n\nSubmissions:\n${submissionText}` }]
  });

  const raw = response.content[0].text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Judge returned invalid JSON");
  return JSON.parse(jsonMatch[0]);
}

// ─── Main demo flow ───────────────────────────────────────────────────────────

async function main() {
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");
  if (!CONTRACT_ADDR) throw new Error("CONTRACT_ADDRESS not set — run deploy.js first");
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const claude   = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const judgeWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const { artifact } = loadArtifact();
  const judgeContract = new ethers.Contract(CONTRACT_ADDR, artifact.abi, judgeWallet);

  separator("🏟️  AGENT ARENA — Live Demo (powered by OKX OnchainOS)");
  console.log(`Contract:  ${CONTRACT_ADDR}`);
  console.log(`Judge:     ${judgeWallet.address}`);
  console.log(`Network:   X-Layer Mainnet (chainId: ${XLAYER_CHAIN_ID})`);
  console.log(`OnchainOS: ${USE_ONCHAINOS ? "✅ enabled" : "⚠️  disabled (set USE_ONCHAINOS=true)"}`);

  // ── Step 1: Set up Agent Wallets via OnchainOS ─────────────────────────────
  separator("Step 1: Initialize Agent Wallets via OnchainOS Agentic Wallet");

  const agentWallets = await Promise.all(
    AGENT_CONFIGS.map(cfg => getAgentWallet(cfg.id))
  );

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    const wallet = agentWallets[i];
    const addr = wallet.address || await wallet.getAddress();
    console.log(`  ${cfg.name}: ${addr}`);

    // Fund agent wallet for gas if using local wallet
    if (!wallet.isOnchainOS) {
      const provider_ = new ethers.JsonRpcProvider(RPC_URL);
      const agentWalletWithProvider = wallet.connect(provider_);
      const balance = await provider_.getBalance(addr);
      if (balance < ethers.parseEther("0.002")) {
        console.log(`  💸 Funding ${cfg.name} for gas...`);
        const tx = await judgeWallet.sendTransaction({ to: addr, value: ethers.parseEther("0.003") });
        await tx.wait();
      }
    } else {
      // Use OnchainOS to check balance
      checkAgentBalance(addr);
    }
  }

  // ── Step 2: Register Agents on-chain ──────────────────────────────────────
  separator("Step 2: Register Agent Nodes on X-Layer");

  const agentContracts = agentWallets.map(w => {
    if (w.isOnchainOS) {
      // For OnchainOS wallets, use judge wallet for registration (TEE signs separately)
      // In production, each agent would have their own onchainos session
      return judgeContract;
    }
    const provider_ = new ethers.JsonRpcProvider(RPC_URL);
    return judgeContract.connect(w.connect(provider_));
  });

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    const addr = agentWallets[i].address || await agentWallets[i].getAddress();
    const info = await judgeContract.agents(addr);
    if (!info.registered) {
      console.log(`  📝 Registering ${cfg.name}...`);
      const metadata = JSON.stringify({ capabilities: ["coding", "analysis"], model: "claude" });
      const tx = await agentContracts[i].registerAgent(cfg.id, metadata);
      await tx.wait();
      console.log(`  ✅ Registered — tx: ${tx.hash}`);
    } else {
      console.log(`  ✅ ${cfg.name} already registered`);
    }
  }

  // ── Step 3: Post Task ──────────────────────────────────────────────────────
  separator("Step 3: Post Task with OKB Reward (Escrow)");

  const TASK_DESCRIPTION = `Write a TypeScript function called 'deepMerge' that:
1. Takes two objects as arguments (Record<string, unknown>)
2. Recursively merges nested objects (deep merge, not shallow)
3. Arrays should be concatenated (not replaced)
4. Returns the merged result without mutating either input
5. Handles null/undefined gracefully
6. Is fully type-safe`;

  const REWARD   = ethers.parseEther("0.01");
  const DEADLINE = Math.floor(Date.now() / 1000) + 3600;

  console.log(`  📋 Task: TypeScript deepMerge function`);
  console.log(`  💰 Reward: ${ethers.formatEther(REWARD)} OKB`);
  console.log(`  ⏰ Deadline: 1 hour`);

  // Optional: estimate gas via OnchainOS before posting
  if (USE_ONCHAINOS) {
    const iface = new ethers.Interface(artifact.abi);
    const calldata = iface.encodeFunctionData("postTask", [TASK_DESCRIPTION, DEADLINE]);
    const gasEst = estimateGas(CONTRACT_ADDR, calldata, REWARD.toString());
    if (gasEst) console.log(`  ⛽ Estimated gas (OnchainOS): ${gasEst}`);
  }

  const postTx = await judgeContract.postTask(TASK_DESCRIPTION, DEADLINE, { value: REWARD });
  const postReceipt = await postTx.wait();
  const taskPostedEvent = postReceipt.logs
    .map(log => { try { return judgeContract.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "TaskPosted");
  const taskId = taskPostedEvent.args.taskId;

  console.log(`  ✅ Task #${taskId} posted!`);
  console.log(`  🔍 https://www.okx.com/explorer/xlayer/tx/${postTx.hash}`);

  // ── Step 4: Agents Apply ───────────────────────────────────────────────────
  separator("Step 4: Agents Apply for Task");

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    console.log(`  🙋 ${cfg.name} applying...`);
    const tx = await agentContracts[i].applyForTask(taskId);
    await tx.wait();
    console.log(`  ✅ Applied`);
  }

  // ── Step 5: Execute Tasks Concurrently ────────────────────────────────────
  separator("Step 5: Agents Solve the Task (parallel execution)");

  const submissions = await Promise.all(
    AGENT_CONFIGS.map(async (cfg, i) => {
      const code = await runAgent(claude, cfg, TASK_DESCRIPTION);
      console.log(`  ✅ ${cfg.name} done (${code.length} chars)`);
      return {
        agentIndex: i,
        agentName: cfg.name,
        agentAddress: agentWallets[i].address || await agentWallets[i].getAddress(),
        agentWallet: agentWallets[i],
        code,
      };
    })
  );

  // Print solutions
  for (const s of submissions) {
    separator(`💻 ${s.agentName}`);
    console.log(s.code);
  }

  // ── Step 6: Judge Evaluates ────────────────────────────────────────────────
  separator("Step 6: Judge Agent Evaluates All Submissions");

  const judgment = await judgeSubmissions(claude, TASK_DESCRIPTION, submissions);
  console.log("\n  📊 Scores:");
  for (const s of judgment.scores) {
    const name = submissions[s.agentIndex].agentName;
    const bar = "█".repeat(Math.floor(s.score / 10)) + "░".repeat(10 - Math.floor(s.score / 10));
    console.log(`     ${name.padEnd(20)} [${bar}] ${s.score}/100`);
    console.log(`       └─ ${s.summary}`);
  }
  console.log(`\n  🏆 Winner: ${submissions[judgment.winner].agentName}`);
  console.log(`  📝 ${judgment.verdict}`);

  // ── Step 7: On-chain Settlement via OnchainOS ─────────────────────────────
  separator("Step 7: On-Chain Settlement (OKB Auto-Payment)");

  const winnerIdx     = judgment.winner;
  const winnerSub     = submissions[winnerIdx];
  const winnerAddress = winnerSub.agentAddress;
  const winnerScore   = judgment.scores.find(s => s.agentIndex === winnerIdx).score;

  // Assign task to winner
  console.log(`  🔗 Assigning task to winner...`);
  const assignTx = await judgeContract.assignTask(taskId, winnerAddress);
  await assignTx.wait();

  // Winner submits result
  console.log(`  📤 Submitting result on-chain...`);
  const resultHash = `text:${Buffer.from(winnerSub.code.slice(0, 200)).toString("base64")}`;
  const submitTx = await agentContracts[winnerIdx].submitResult(taskId, resultHash);
  await submitTx.wait();

  // Judge releases payment
  console.log(`  💸 Judge releasing payment via smart contract...`);
  const judgeTx = await judgeContract.judgeAndPay(taskId, winnerScore, winnerAddress);
  const judgeReceipt = await judgeTx.wait();

  // Optional: track via OnchainOS Gateway
  if (USE_ONCHAINOS) {
    console.log(`  📡 [OnchainOS Gateway] Tracking settlement tx...`);
    const trackResult = onchainos(["gateway", "orders", "--chain", XLAYER_CHAIN_ID, "--hash", judgeTx.hash]);
    if (trackResult.ok) console.log(`  ✅ ${trackResult.stdout.split("\n")[0]}`);
  }

  separator("🎉 Demo Complete!");
  console.log(`  Task #${taskId} completed on X-Layer`);
  console.log(`  Winner:  ${winnerSub.agentName} (${winnerAddress})`);
  console.log(`  Score:   ${winnerScore}/100`);
  console.log(`  Reward:  ${ethers.formatEther(REWARD)} OKB auto-paid`);
  console.log(`  Wallet:  ${winnerSub.agentWallet.isOnchainOS ? "OKX Agentic Wallet (TEE)" : "Derived local wallet"}`);
  console.log(`  TxHash:  ${judgeTx.hash}`);
  console.log(`\n  🔍 https://www.okx.com/explorer/xlayer/tx/${judgeTx.hash}`);

  separator("📈 Network State");
  const agentCount = await judgeContract.getAgentCount();
  const totalTasks  = await judgeContract.taskCount();
  console.log(`  Registered Agents: ${agentCount}`);
  console.log(`  Total Tasks:       ${totalTasks}`);
  for (const s of submissions) {
    const { avgScore, completed } = await judgeContract.getAgentReputation(s.agentAddress);
    const wallet = s.agentWallet.isOnchainOS ? "[OnchainOS TEE]" : "[local]";
    console.log(`  ${s.agentName}: ${completed} tasks, avg score ${avgScore} ${wallet}`);
  }
}

main().catch(err => {
  console.error("\n❌ Demo failed:", err.message);
  process.exit(1);
});
