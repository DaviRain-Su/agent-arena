#!/usr/bin/env node
/**
 * Agent Arena Judge Service
 * 
 * Automated daemon that:
 * 1. Listens for ResultSubmitted events on-chain
 * 2. Fetches agent submission content (from IPFS or direct)
 * 3. Evaluates using Claude API (LLM-as-judge)
 * 4. Calls judgeAndPay() on-chain to settle
 * 
 * Environment:
 *   PRIVATE_KEY        - Judge wallet private key (must match contract's judgeAddress)
 *   CONTRACT_ADDRESS   - AgentArena contract address
 *   RPC_URL            - X-Layer RPC endpoint
 *   ANTHROPIC_API_KEY  - Claude API key for evaluation
 *   POLL_INTERVAL_MS   - Event polling interval (default: 30000)
 */

import { ethers } from "ethers";
import { config } from "dotenv";
import { Anthropic } from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import os from "os";
import { AGENT_ARENA_ABI } from "./abi.js";
import { NodeVMProvider, runTests, calcScore } from "@agent-arena/sandbox";
import type { TestCase } from "@agent-arena/sandbox";

config();

// Config
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xad869d5901A64F9062bD352CdBc75e35Cd876E09";
const RPC_URL = process.env.RPC_URL || "https://testrpc.xlayer.tech/terigon";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "30000");
const INDEXER_URL = process.env.INDEXER_URL || "http://localhost:3001";

if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY required");
  process.exit(1);
}

// Persistent state file for lastBlock tracking
const STATE_FILE = join(os.homedir(), ".arena", "judge-block.json");

function loadLastBlock(): number {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return typeof data.lastBlock === "number" ? data.lastBlock : 0;
  } catch {
    return 0;
  }
}

function saveLastBlock(block: number): void {
  try {
    mkdirSync(join(os.homedir(), ".arena"), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ lastBlock: block }));
  } catch (e) {
    console.error(`Warning: failed to persist lastBlock: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Claude client (optional - if not provided, uses automatic evaluation only)
const anthropic = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Interfaces
interface Task {
  id: number;
  poster: string;
  description: string;
  evaluationCID: string;
  reward: bigint;
  deadline: number;
  status: number;
  assignedAgent: string;
  resultHash: string;
}

interface EvaluationResult {
  score: number;        // 0-100
  winner: string;       // agent address
  reasonURI: string;    // data URI with full report
  breakdown: {
    correctness: number;
    codeQuality: number;
    efficiency: number;
  };
}

// Main Judge Service
class JudgeService {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private contract: ethers.Contract;
  private running = false;
  private lastBlock: number = 0;
  // Track already judged tasks to avoid re-judging
  private judgedTasks = new Set<number>();
  // Track InProgress tasks to monitor for judge deadline expiry
  private inProgressTasks = new Set<number>();

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.signer = new ethers.Wallet(PRIVATE_KEY!, this.provider);
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, AGENT_ARENA_ABI, this.signer);
  }

  async start() {
    console.log("⚖️  Agent Arena Judge Service\n");
    console.log(`Judge Address: ${this.signer.address}`);
    console.log(`Contract:      ${CONTRACT_ADDRESS}`);
    console.log(`RPC:           ${RPC_URL}`);
    console.log(`Claude API:    ${anthropic ? "✅ Enabled" : "⚠️  Disabled (automatic only)"}\n`);

    // Verify judge address matches contract
    const judgeAddress = await this.contract.judgeAddress();
    if (judgeAddress.toLowerCase() !== this.signer.address.toLowerCase()) {
      console.error(`❌ Judge address mismatch!`);
      console.error(`   Contract expects: ${judgeAddress}`);
      console.error(`   Your key:         ${this.signer.address}`);
      process.exit(1);
    }

    const savedBlock = loadLastBlock();
    if (savedBlock > 0) {
      this.lastBlock = savedBlock;
      console.log(`Resuming from saved block ${this.lastBlock}\n`);
    } else {
      this.lastBlock = await this.provider.getBlockNumber();
      console.log(`Starting from block ${this.lastBlock}\n`);
    }

    // Backfill InProgress task set from historical events
    await this.loadInProgressTasks();

    this.running = true;
    while (this.running) {
      try {
        await this.poll();
      } catch (e) {
        console.error(`Poll error: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(POLL_INTERVAL);
    }
  }

  stop() {
    this.running = false;
  }

  private async loadInProgressTasks() {
    console.log("Loading historical InProgress tasks...");
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const events = await this.contract.queryFilter(
        this.contract.filters.TaskAssigned(),
        0,
        currentBlock
      );
      for (const event of events) {
        const taskId = Number((event as any).args?.taskId);
        if (!this.judgedTasks.has(taskId)) {
          this.inProgressTasks.add(taskId);
        }
      }
      console.log(`Monitoring ${this.inProgressTasks.size} InProgress task(s) for judge deadline\n`);
    } catch (e) {
      console.warn(`Warning: could not load InProgress tasks: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }

  private async checkForceRefundable() {
    const toRemove: number[] = [];
    for (const taskId of this.inProgressTasks) {
      if (this.judgedTasks.has(taskId)) {
        toRemove.push(taskId);
        continue;
      }
      try {
        const refundable: boolean = await this.contract.isJudgeTimeoutReached(taskId);
        if (refundable) {
          console.log(`⏰ Task #${taskId} judge deadline exceeded — calling forceRefund()`);
          const tx = await this.contract.forceRefund(taskId);
          await tx.wait();
          console.log(`   ✅ Refunded task #${taskId} (${tx.hash.slice(0, 18)}...)\n`);
          toRemove.push(taskId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Task already settled or not found — remove from tracking
        if (msg.includes("not InProgress") || msg.includes("already") || msg.includes("INVALID_ARGUMENT")) {
          toRemove.push(taskId);
        } else {
          console.warn(`   ⚠️  forceRefund check failed for task #${taskId}: ${msg.slice(0, 80)}`);
        }
      }
    }
    for (const id of toRemove) this.inProgressTasks.delete(id);
  }

  private async poll() {
    const currentBlock = await this.provider.getBlockNumber();
    if (currentBlock <= this.lastBlock) return;

    // Query TaskAssigned events to track new InProgress tasks
    const assignedEvents = await this.contract.queryFilter(
      this.contract.filters.TaskAssigned(),
      this.lastBlock + 1,
      currentBlock
    );
    for (const event of assignedEvents) {
      const taskId = Number((event as any).args?.taskId);
      this.inProgressTasks.add(taskId);
    }

    // Check for tasks whose judge deadline has expired
    await this.checkForceRefundable();

    // Query ResultSubmitted events
    const events = await this.contract.queryFilter(
      this.contract.filters.ResultSubmitted(),
      this.lastBlock + 1,
      currentBlock
    );

    for (const event of events) {
      const evt = event as any;
      const taskId = Number(evt.args?.taskId);
      const agent = evt.args?.agent as string;
      const resultHash = evt.args?.resultHash as string;
      
      // Skip already judged tasks
      if (this.judgedTasks.has(taskId)) {
        console.log(`⏭️  Task #${taskId} already judged, skipping`);
        continue;
      }
      
      console.log(`📥 Task #${taskId} submitted by ${agent}`);
      console.log(`   Result CID: ${resultHash}`);

      // Fetch task details
      const task = await this.contract.tasks(taskId) as Task;
      
      // Check if already judged (on-chain status)
      if (task.status !== 1) { // Not InProgress
        console.log(`   Skipping: status = ${task.status} (not InProgress)`);
        this.judgedTasks.add(taskId);
        continue;
      }

      // Fetch actual submission content
      const submission = await this.fetchSubmission(resultHash, taskId);
      if (!submission) {
        console.error(`   ❌ Failed to fetch submission content from ${resultHash}`);
        continue;
      }

      // Evaluate
      try {
        const evaluation = await this.evaluate(task, submission);
        console.log(`   Score: ${evaluation.score}/100`);
        console.log(`   Breakdown:`, evaluation.breakdown);
        console.log(`   Winner: ${evaluation.winner}`);
        console.log(`   Report: ${evaluation.reasonURI.slice(0, 80)}...`);

        // Submit on-chain (with retry)
        const txHash = await this.submitWithRetry(taskId, evaluation);
        console.log(`   ✅ Settled (${txHash.slice(0, 18)}...)\n`);
        
        // Mark as judged
        this.judgedTasks.add(taskId);
      } catch (e) {
        console.error(`   ❌ Evaluation failed: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }

    this.lastBlock = currentBlock;
    saveLastBlock(currentBlock);
  }

  private async submitWithRetry(taskId: number, evaluation: EvaluationResult, maxRetries = 3): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const tx = await this.contract.judgeAndPay(
          taskId, evaluation.score, evaluation.winner, evaluation.reasonURI
        );
        console.log(`   Tx: ${tx.hash}`);
        await tx.wait();
        return tx.hash;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt === maxRetries - 1) throw e;
        const delay = 5000 * (attempt + 1);
        console.log(`   ⚠️  Tx failed (attempt ${attempt + 1}/${maxRetries}): ${msg.slice(0, 60)}`);
        console.log(`   Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
    throw new Error("Unreachable");
  }

  /**
   * Fetch submission content from various sources (priority order):
   * 1. Local indexer (POST /results/:taskId stores content before on-chain submit)
   * 2. eval:...    -> base64 decoded content (for testing)
   * 3. ipfs://...  -> fetch from IPFS gateway
   * 4. http://...  -> direct fetch
   * 5. raw text    -> return as-is
   */
  private async fetchSubmission(resultHash: string, taskId?: number): Promise<string | null> {
    // Try local indexer first (stores full content keyed by taskId)
    if (taskId !== undefined) {
      try {
        const resp = await fetch(`${INDEXER_URL}/results/${taskId}`, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          const data = await resp.json() as { content?: string };
          if (data.content) {
            console.log(`   📦 Fetched submission from local indexer`);
            return data.content;
          }
        }
      } catch {
        // Indexer unavailable — fall through to other methods
      }
    }

    // Handle eval: base64 encoded content (used in testing)
    if (resultHash.startsWith("eval:")) {
      try {
        return Buffer.from(resultHash.slice(5), "base64").toString("utf8");
      } catch {
        return resultHash; // return raw if decode fails
      }
    }

    // Handle ipfs:// URIs
    if (resultHash.startsWith("ipfs://")) {
      const cid = resultHash.slice(7);
      const gateways = [
        `https://ipfs.io/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
      ];
      
      for (const gateway of gateways) {
        try {
          const response = await fetch(gateway, { signal: AbortSignal.timeout(10000) });
          if (response.ok) {
            return await response.text();
          }
        } catch {
          continue;
        }
      }
      return null;
    }

    // Handle http/https URLs
    if (resultHash.startsWith("http://") || resultHash.startsWith("https://")) {
      try {
        const response = await fetch(resultHash, { signal: AbortSignal.timeout(10000) });
        if (response.ok) {
          return await response.text();
        }
      } catch {
        return null;
      }
    }

    // Return raw string (for testing/simple submissions)
    return resultHash;
  }

  private async evaluate(task: Task, submission: string): Promise<EvaluationResult> {
    const evalStandard = this.parseEvalStandard(task.evaluationCID, task.description);

    if (evalStandard.type === "test_cases") {
      // cases may be empty — evaluateWithTestCases handles both paths:
      //   cases.length > 0 → run test cases in sandbox
      //   cases.length === 0 → sandbox execution check (syntax/runtime)
      return this.evaluateWithTestCases(task, submission, evalStandard.cases, evalStandard.functionName);
    } else if ((evalStandard.type === "judge_prompt" || evalStandard.type === "manual") && anthropic) {
      return this.evaluateWithClaude(task, submission);
    } else {
      return this.evaluateAutomatic(task, submission);
    }
  }

  private parseEvalStandard(evaluationCID: string, description: string): {
    type: "manual" | "test_cases" | "judge_prompt";
    cases: TestCase[];
    functionName: string;
  } {
    // Try decoding base64 evaluationCID
    if (evaluationCID.startsWith("eval:")) {
      try {
        const decoded = JSON.parse(Buffer.from(evaluationCID.slice(5), "base64").toString());
        if (decoded.type === "test_cases" && Array.isArray(decoded.cases)) {
          return { type: "test_cases", cases: decoded.cases, functionName: decoded.functionName || "solution" };
        }
        return { type: decoded.type || "manual", cases: [], functionName: "" };
      } catch {
        // Not base64 JSON — fall through to heuristic
      }
    }

    // Heuristic: extract function name from task description
    const fnMatch = description.match(/function\s+called\s+['"]?(\w+)['"]?/i)
      ?? description.match(/write\s+(?:a\s+)?(\w+)\s*\(/i);
    const functionName = fnMatch?.[1] ?? "";

    // If we found a function name, treat as test_cases (the sandbox can still run the code)
    if (functionName) {
      return { type: "test_cases", cases: [], functionName };
    }

    return { type: "manual", cases: [], functionName: "" };
  }

  /**
   * Generate a reasonURI that contains full evaluation details
   * Uses base64 data URI since IPFS upload is async/complex
   */
  private generateReasonURI(
    score: number, 
    breakdown: EvaluationResult["breakdown"], 
    method: string,
    task: Task, 
    submission: string
  ): string {
    const report = {
      taskId: task.id,
      taskDescription: task.description,
      timestamp: Date.now(),
      score,
      breakdown,
      submissionPreview: submission.slice(0, 500),
      method,
      note: "Full evaluation report - base64 encoded for transparency. Decode at base64decode.org"
    };
    
    const jsonStr = JSON.stringify(report, null, 2);
    const base64 = Buffer.from(jsonStr).toString("base64");
    
    // data URI format - contains full details, can be decoded by anyone
    return `data:application/json;base64,${base64}`;
  }

  /**
   * Evaluate by running code in a sandboxed VM.
   * If test cases are provided (from evaluationCID), runs them.
   * Otherwise does a basic syntax/execution check.
   * V2: swap NodeVMProvider → Sandbank DaytonaAdapter for container isolation.
   */
  private async evaluateWithTestCases(
    task: Task,
    submission: string,
    cases: TestCase[],
    functionName: string,
  ): Promise<EvaluationResult> {
    const provider = new NodeVMProvider();

    // If we have explicit test cases, run them for the correctness score (60 pts)
    if (cases.length > 0) {
      console.log(`   Running ${cases.length} test cases in sandbox...`);
      const results = await runTests(provider, submission, functionName, cases);
      const correctness = calcScore(results, 60);

      for (const r of results) {
        console.log(`     ${r.passed ? "✓" : "✗"} ${r.desc}${r.error ? ` — ${r.error.slice(0, 60)}` : ""}`);
      }

      // Quality + efficiency via heuristics (40 pts total)
      const codeQuality = this.heuristicQuality(submission, 20);
      const efficiency = this.heuristicEfficiency(submission, 20);
      const score = Math.min(100, correctness + codeQuality + efficiency);
      const breakdown = { correctness, codeQuality, efficiency };

      return {
        score,
        winner: task.assignedAgent,
        reasonURI: this.generateReasonURI(score, breakdown, "sandbox-tests", task, submission),
        breakdown,
      };
    }

    // No explicit test cases — do a basic execution check
    console.log(`   Running sandbox execution check...`);
    const sandbox = await provider.create({ timeout: 5000 });
    try {
      const { exitCode, stderr } = await sandbox.exec(submission, { timeout: 3000 });
      const runs = exitCode === 0;
      const correctness = runs ? 40 : 15;
      const codeQuality = this.heuristicQuality(submission, 30);
      const efficiency = this.heuristicEfficiency(submission, 30);
      const score = Math.min(100, correctness + codeQuality + efficiency);
      const breakdown = { correctness, codeQuality, efficiency };

      if (!runs) console.log(`     Execution error: ${stderr.slice(0, 80)}`);

      return {
        score,
        winner: task.assignedAgent,
        reasonURI: this.generateReasonURI(score, breakdown, "sandbox-exec", task, submission),
        breakdown,
      };
    } finally {
      await provider.destroy(sandbox.id);
    }
  }

  private heuristicQuality(code: string, max: number): number {
    let pts = Math.round(max * 0.4);
    if (/\/\/|\/\*|#/.test(code)) pts += Math.round(max * 0.2);
    if (/^\s{2,4}/m.test(code)) pts += Math.round(max * 0.2);
    if (code.length < 5000) pts += Math.round(max * 0.2);
    return Math.min(max, pts);
  }

  private heuristicEfficiency(code: string, max: number): number {
    let pts = Math.round(max * 0.5);
    if ((code.match(/for|while/g) || []).length <= 2) pts += Math.round(max * 0.25);
    if (code.length < 3000) pts += Math.round(max * 0.25);
    return Math.min(max, pts);
  }

  private async evaluateWithClaude(task: Task, submission: string): Promise<EvaluationResult> {
    if (!anthropic) {
      throw new Error("Claude API not configured");
    }

    console.log(`   Sending to Claude for evaluation...`);

    const prompt = `You are an expert code reviewer. Evaluate this solution objectively.

TASK DESCRIPTION:
${task.description}

SUBMITTED SOLUTION:
\`\`\`
${submission}
\`\`\`

Evaluate based on:
1. Correctness (40 points): Does it solve the problem? Handle edge cases?
2. Code Quality (30 points): Clean, readable, well-structured? Proper naming?
3. Efficiency (30 points): Good time/space complexity? No unnecessary operations?

Respond with ONLY a JSON object in this exact format:
{"score": 85, "breakdown": {"correctness": 35, "codeQuality": 25, "efficiency": 25}, "feedback": "Brief explanation of the score"}`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",  // Fixed model ID
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      });

      const content = response.content[0].type === "text" ? response.content[0].text : "";
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log(`   Claude response had no JSON, falling back to automatic`);
        return this.evaluateAutomatic(task, submission);
      }

      let result: Record<string, unknown>;
      try {
        result = JSON.parse(jsonMatch[0]);
      } catch {
        console.log(`   Claude JSON parse failed, falling back to automatic`);
        return this.evaluateAutomatic(task, submission);
      }

      // Validate score is a finite number
      const rawScore = typeof result.score === "number" && isFinite(result.score) ? result.score : NaN;
      if (isNaN(rawScore)) {
        console.log(`   Invalid score from Claude (${result.score}), falling back to automatic`);
        return this.evaluateAutomatic(task, submission);
      }

      const score = Math.min(100, Math.max(0, Math.round(rawScore)));
      const bd = (result.breakdown && typeof result.breakdown === "object") ? result.breakdown as Record<string, unknown> : {};
      const toNum = (v: unknown, max: number, fallback: number) => {
        const n = typeof v === "number" && isFinite(v) ? v : fallback;
        return Math.min(max, Math.max(0, Math.round(n)));
      };
      const breakdown = {
        correctness: toNum(bd.correctness, 40, 30),
        codeQuality: toNum(bd.codeQuality, 30, 25),
        efficiency: toNum(bd.efficiency, 30, 20),
      };
      
      return {
        score,
        winner: task.assignedAgent,
        reasonURI: this.generateReasonURI(score, breakdown, "claude", task, submission),
        breakdown
      };
    } catch (e) {
      console.error(`   Claude evaluation failed: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`   Falling back to automatic evaluation...`);
      return this.evaluateAutomatic(task, submission);
    }
  }

  private async evaluateAutomatic(task: Task, submission: string): Promise<EvaluationResult> {
    console.log(`   Using automatic evaluation...`);
    
    // Basic sanity checks
    const hasContent = submission.length > 20;
    const looksLikeCode = /[{}();=]|function|def|class/.test(submission);
    
    let score: number;
    let breakdown: EvaluationResult["breakdown"];
    
    if (!hasContent || !looksLikeCode) {
      // Submission is garbage - fail it
      score = 30;
      breakdown = { correctness: 10, codeQuality: 10, efficiency: 10 };
    } else {
      // Pass with minimum viable score
      score = 75;
      breakdown = { correctness: 30, codeQuality: 25, efficiency: 20 };
    }
    
    return {
      score,
      winner: task.assignedAgent,
      reasonURI: this.generateReasonURI(score, breakdown, "automatic", task, submission),
      breakdown
    };
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start
const service = new JudgeService();

process.on("SIGINT", () => {
  console.log("\n\nShutting down judge service...");
  service.stop();
  process.exit(0);
});

service.start().catch(console.error);
