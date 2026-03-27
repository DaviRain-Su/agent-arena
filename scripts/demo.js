// scripts/demo.js
// Full end-to-end demo: post task → agents compete → judge scores → pay winner
import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL        = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";
const PRIVATE_KEY    = process.env.PRIVATE_KEY;
const CONTRACT_ADDR  = process.env.CONTRACT_ADDRESS;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;

// Three simulated agents with different system prompts (different "personalities")
const AGENT_CONFIGS = [
  {
    id: "openclaw-alpha",
    name: "OpenClaw Alpha",
    systemPrompt: "You are a senior software engineer who prioritizes clean, readable code with good error handling. Write concise, production-quality solutions.",
  },
  {
    id: "codex-beta",
    name: "Codex Beta",
    systemPrompt: "You are a performance-focused engineer. Optimize for speed and efficiency. Use modern language features and best practices.",
  },
  {
    id: "opencode-gamma",
    name: "OpenCode Gamma",
    systemPrompt: "You are a pragmatic engineer who values simplicity above all. Write the simplest possible solution that works correctly.",
  }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadArtifact() {
  const artifact = JSON.parse(
    readFileSync(path.resolve(__dirname, "../artifacts/AgentArena.json"), "utf8")
  );
  const deployment = JSON.parse(
    readFileSync(path.resolve(__dirname, "../artifacts/deployment.json"), "utf8")
  );
  return { artifact, deployment };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function separator(title = "") {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  if (title) console.log(`  ${title}`);
  console.log(line);
}

// ─── Agent: call LLM to solve task ────────────────────────────────────────────

async function runAgent(claude, agentConfig, taskDescription) {
  console.log(`  🤖 ${agentConfig.name} working...`);
  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: agentConfig.systemPrompt,
    messages: [{
      role: "user",
      content: `Solve this programming task. Provide ONLY the code solution, no explanations:\n\n${taskDescription}`
    }]
  });
  return response.content[0].text.trim();
}

// ─── Judge: evaluate all submissions ──────────────────────────────────────────

async function judgeSubmissions(claude, taskDescription, submissions) {
  console.log("\n  ⚖️  Judge evaluating all submissions...");

  const submissionText = submissions.map((s, i) =>
    `=== Agent ${i + 1}: ${s.agentName} ===\n${s.code}`
  ).join("\n\n");

  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: `You are a strict code reviewer. Your default stance is skeptical — assume code has issues unless proven otherwise.
Evaluate each submission on:
- Correctness (0-40): Does it actually solve the task?
- Code Quality (0-30): Readability, structure, naming
- Robustness (0-30): Error handling, edge cases

Return ONLY valid JSON in this exact format:
{
  "scores": [
    {"agentIndex": 0, "score": 85, "summary": "brief reason"},
    {"agentIndex": 1, "score": 72, "summary": "brief reason"},
    {"agentIndex": 2, "score": 91, "summary": "brief reason"}
  ],
  "winner": 2,
  "verdict": "overall comparison in 1 sentence"
}`,
    messages: [{
      role: "user",
      content: `Task: ${taskDescription}\n\nSubmissions:\n${submissionText}`
    }]
  });

  const raw = response.content[0].text.trim();
  // Extract JSON even if wrapped in markdown
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Judge returned invalid JSON: " + raw);
  return JSON.parse(jsonMatch[0]);
}

// ─── Main demo flow ───────────────────────────────────────────────────────────

async function main() {
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");
  if (!CONTRACT_ADDR) throw new Error("CONTRACT_ADDRESS not set (run deploy first)");
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const claude   = new Anthropic({ apiKey: ANTHROPIC_KEY });
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  const { artifact } = loadArtifact();
  const contract = new ethers.Contract(CONTRACT_ADDR, artifact.abi, wallet);

  separator("🏟️  AGENT ARENA — Live Demo");
  console.log(`Contract: ${CONTRACT_ADDR}`);
  console.log(`Wallet:   ${wallet.address}`);

  // ── Step 1: Register agents on-chain ──────────────────────────────────────
  separator("Step 1: Register Agent Nodes");

  // Use separate wallets derived from the main key for each agent
  // (In production each agent has its own wallet; here we simulate)
  const agentWallets = AGENT_CONFIGS.map((_, i) => {
    const derived = ethers.HDNodeWallet.fromSeed(
      ethers.toUtf8Bytes(`agent-seed-${i}-${PRIVATE_KEY.slice(0, 8)}`)
    );
    return new ethers.Wallet(derived.privateKey, provider);
  });

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg        = AGENT_CONFIGS[i];
    const agentWallet = agentWallets[i];
    const agentContract = contract.connect(agentWallet);

    // Fund agent wallet if needed (needs small amount for gas)
    const agentBalance = await provider.getBalance(agentWallet.address);
    if (agentBalance < ethers.parseEther("0.001")) {
      console.log(`  💸 Funding ${cfg.name} wallet for gas...`);
      const tx = await wallet.sendTransaction({
        to: agentWallet.address,
        value: ethers.parseEther("0.002")
      });
      await tx.wait();
    }

    const isRegistered = (await contract.agents(agentWallet.address)).registered;
    if (!isRegistered) {
      console.log(`  📝 Registering ${cfg.name} (${agentWallet.address.slice(0,10)}...)`);
      const tx = await agentContract.registerAgent(cfg.id, "ipfs://QmMockMetadata");
      await tx.wait();
      console.log(`  ✅ Registered`);
    } else {
      console.log(`  ✅ ${cfg.name} already registered`);
    }
  }

  // ── Step 2: Post a task ────────────────────────────────────────────────────
  separator("Step 2: Post Task (with OKB reward)");

  const TASK_DESCRIPTION = `Write a JavaScript function called 'deepMerge' that:
1. Takes two objects as arguments
2. Recursively merges them (nested objects should be merged, not overwritten)
3. Arrays should be concatenated (not replaced)
4. Returns the merged result without mutating inputs
5. Handles null/undefined gracefully`;

  const REWARD      = ethers.parseEther("0.01"); // 0.01 OKB
  const DEADLINE    = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  console.log(`  📋 Task: deepMerge function`);
  console.log(`  💰 Reward: ${ethers.formatEther(REWARD)} OKB`);
  console.log(`  ⏰ Deadline: 1 hour`);

  const postTx = await contract.postTask(TASK_DESCRIPTION, DEADLINE, { value: REWARD });
  const postReceipt = await postTx.wait();

  // Get task ID from event
  const taskPostedEvent = postReceipt.logs
    .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "TaskPosted");

  const taskId = taskPostedEvent.args.taskId;
  console.log(`  ✅ Task #${taskId} posted! TxHash: ${postTx.hash}`);

  // ── Step 3: Agents apply ───────────────────────────────────────────────────
  separator("Step 3: Agents Apply for Task");

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    const agentContract = contract.connect(agentWallets[i]);
    console.log(`  🙋 ${cfg.name} applying...`);
    const tx = await agentContract.applyForTask(taskId);
    await tx.wait();
    console.log(`  ✅ Applied`);
  }

  // ── Step 4: Run agents concurrently ───────────────────────────────────────
  separator("Step 4: Agents Solve the Task (concurrently)");

  const submissions = await Promise.all(
    AGENT_CONFIGS.map(async (cfg, i) => {
      const code = await runAgent(claude, cfg, TASK_DESCRIPTION);
      console.log(`  ✅ ${cfg.name} submitted (${code.length} chars)`);
      return { agentIndex: i, agentName: cfg.name, agentWallet: agentWallets[i], code };
    })
  );

  // Show submissions
  for (const s of submissions) {
    separator(`💻 ${s.agentName}'s Solution`);
    console.log(s.code);
  }

  // ── Step 5: Judge evaluates ────────────────────────────────────────────────
  separator("Step 5: Judge Evaluates All Submissions");

  const judgment = await judgeSubmissions(claude, TASK_DESCRIPTION, submissions);

  console.log("\n  📊 Scores:");
  for (const s of judgment.scores) {
    const name = submissions[s.agentIndex].agentName;
    console.log(`     ${name}: ${s.score}/100 — ${s.summary}`);
  }
  console.log(`\n  🏆 Winner: ${submissions[judgment.winner].agentName}`);
  console.log(`  📝 Verdict: ${judgment.verdict}`);

  // ── Step 6: On-chain: assign, submit result, judge & pay ──────────────────
  separator("Step 6: On-Chain Settlement");

  const winnerSubmission = submissions[judgment.winner];
  const winnerWallet     = winnerSubmission.agentWallet;

  // Poster assigns task to winner (or judge could force-assign)
  console.log(`  🔗 Assigning task to winner on-chain...`);
  const assignTx = await contract.assignTask(taskId, winnerWallet.address);
  await assignTx.wait();
  console.log(`  ✅ Task assigned`);

  // Winner submits result
  console.log(`  📤 Winner submitting result...`);
  const winnerContract = contract.connect(winnerWallet);
  const submitTx = await winnerContract.submitResult(taskId, "ipfs://QmWinnerResult");
  await submitTx.wait();
  console.log(`  ✅ Result submitted`);

  // Judge releases payment
  console.log(`  💸 Judge releasing payment...`);
  // Note: judgeAndPay must be called from judgeAddress wallet
  // In this demo, we use the main wallet as judge (set JUDGE_ADDRESS = deployer)
  const winnerScore = judgment.scores.find(s => s.agentIndex === judgment.winner).score;
  const judgeTx = await contract.judgeAndPay(taskId, winnerScore, winnerWallet.address);
  const judgeReceipt = await judgeTx.wait();

  const completedEvent = judgeReceipt.logs
    .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === "TaskCompleted");

  separator("🎉 Demo Complete!");
  console.log(`  Task #${taskId} completed on-chain`);
  console.log(`  Winner: ${winnerSubmission.agentName} (${winnerWallet.address})`);
  console.log(`  Score:  ${winnerScore}/100`);
  console.log(`  Reward: ${ethers.formatEther(REWARD)} OKB paid`);
  console.log(`  TxHash: ${judgeTx.hash}`);
  console.log(`  🔍 https://www.okx.com/explorer/xlayer/tx/${judgeTx.hash}`);

  separator("📈 Network State");
  const agentCount = await contract.getAgentCount();
  const totalTasks = await contract.taskCount();
  console.log(`  Registered Agents: ${agentCount}`);
  console.log(`  Total Tasks:       ${totalTasks}`);

  for (const s of submissions) {
    const { avgScore, completed } = await contract.getAgentReputation(s.agentWallet.address);
    console.log(`  ${s.agentName}: ${completed} tasks done, avg score ${avgScore}`);
  }
}

main().catch(err => {
  console.error("\n❌ Demo failed:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
