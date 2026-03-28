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

config();

// Config
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xb31BD3846416b3d061ccb646ca9cf176ecCE1B18";
const RPC_URL = process.env.RPC_URL || "https://testrpc.xlayer.tech/terigon";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "30000");

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

  private async poll() {
    const currentBlock = await this.provider.getBlockNumber();
    if (currentBlock <= this.lastBlock) return;

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
      const submission = await this.fetchSubmission(resultHash);
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

        // Submit on-chain
        const tx = await this.contract.judgeAndPay(
          taskId,
          evaluation.score,
          evaluation.winner,
          evaluation.reasonURI
        );
        console.log(`   Tx: ${tx.hash}`);
        await tx.wait();
        console.log(`   ✅ Settled\n`);
        
        // Mark as judged
        this.judgedTasks.add(taskId);
      } catch (e) {
        console.error(`   ❌ Evaluation failed: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }

    this.lastBlock = currentBlock;
    saveLastBlock(currentBlock);
  }

  /**
   * Fetch submission content from various sources
   * - ipfs://...  -> fetch from IPFS gateway
   * - eval:...    -> base64 decoded content (for testing)
   * - http://...  -> direct fetch
   * - raw text    -> return as-is
   */
  private async fetchSubmission(resultHash: string): Promise<string | null> {
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
    // Parse evaluation standard from task.evaluationCID
    const evalType = this.parseEvalType(task.evaluationCID);

    if (evalType === "test_cases") {
      return this.evaluateWithTestCases(task, submission);
    } else if (evalType === "judge_prompt" && anthropic) {
      return this.evaluateWithClaude(task, submission);
    } else {
      // Default: automatic evaluation
      return this.evaluateAutomatic(task, submission);
    }
  }

  private parseEvalType(evaluationCID: string): "manual" | "test_cases" | "judge_prompt" {
    if (evaluationCID.startsWith("eval:")) {
      try {
        const decoded = JSON.parse(Buffer.from(evaluationCID.slice(5), "base64").toString());
        return decoded.type || "manual";
      } catch {
        return "manual";
      }
    }
    return "manual";
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
   * Evaluate using test cases extracted from the task description
   * This is a placeholder - real implementation would run actual tests
   */
  private async evaluateWithTestCases(task: Task, submission: string): Promise<EvaluationResult> {
    console.log(`   Running test case evaluation...`);
    
    // TODO: Implement actual test case execution
    // For now, do a basic sanity check on the submission
    
    let correctness = 0;
    
    // Check if submission looks like valid code
    const hasFunction = /function|def|fn\s/.test(submission);
    const hasLogic = submission.length > 50;
    const noSyntaxError = !submission.includes("SyntaxError") && !submission.includes("Error:");
    
    if (hasFunction && hasLogic && noSyntaxError) {
      correctness = 40; // Base score for valid-looking code
      
      // Check for basic correctness indicators
      if (submission.includes("return") || submission.includes("print")) {
        correctness += 20;
      }
    }
    
    // Code quality heuristics
    let codeQuality = 10;
    const hasComments = submission.includes("//") || submission.includes("/*") || submission.includes("#");
    const hasProperIndent = submission.match(/^\s{2,4}/m);
    const reasonableLength = submission.length < 5000;
    
    if (hasComments) codeQuality += 10;
    if (hasProperIndent) codeQuality += 5;
    if (reasonableLength) codeQuality += 5;
    
    // Efficiency heuristics  
    let efficiency = 10;
    const noNestedLoops = (submission.match(/for|while/g) || []).length <= 2;
    const usesRecursion = submission.includes(submission.match(/function|def/)?.[0] || "");
    
    if (noNestedLoops) efficiency += 5;
    if (!usesRecursion) efficiency += 5; // iterative often better than recursive
    
    const score = Math.min(100, correctness + codeQuality + efficiency);
    const breakdown = { correctness, codeQuality, efficiency };
    
    return {
      score,
      winner: task.assignedAgent,
      reasonURI: this.generateReasonURI(score, breakdown, "test-cases", task, submission),
      breakdown
    };
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
        throw new Error("Claude response did not contain valid JSON");
      }

      const result = JSON.parse(jsonMatch[0]);
      
      // Validate and normalize
      const score = Math.min(100, Math.max(0, Math.round(result.score || 75)));
      const breakdown = {
        correctness: Math.min(40, Math.max(0, result.breakdown?.correctness || 30)),
        codeQuality: Math.min(30, Math.max(0, result.breakdown?.codeQuality || 25)),
        efficiency: Math.min(30, Math.max(0, result.breakdown?.efficiency || 20))
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
