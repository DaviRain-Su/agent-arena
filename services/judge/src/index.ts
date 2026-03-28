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
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load ABI from artifacts
const ABI = JSON.parse(
  readFileSync(join(__dirname, "../../../artifacts/AgentArena.json"), "utf8")
).abi;

// Config
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0xb31BD3846416b3d061ccb646ca9cf176ecCE1B18";
const RPC_URL = process.env.RPC_URL || "https://testrpc.xlayer.tech/terigon";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || "30000");

if (!PRIVATE_KEY) {
  console.error("❌ PRIVATE_KEY required");
  process.exit(1);
}

// Claude client (optional - if not provided, uses test case evaluation only)
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
  reasonURI: string;    // IPFS CID or direct string
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

  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.signer = new ethers.Wallet(PRIVATE_KEY!, this.provider);
    this.contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, this.signer);
  }

  async start() {
    console.log("⚖️  Agent Arena Judge Service\n");
    console.log(`Judge Address: ${this.signer.address}`);
    console.log(`Contract:      ${CONTRACT_ADDRESS}`);
    console.log(`RPC:           ${RPC_URL}`);
    console.log(`Claude API:    ${anthropic ? "✅ Enabled" : "⚠️  Disabled (test cases only)"}\n`);

    // Verify judge address matches contract
    const judgeAddress = await this.contract.judgeAddress();
    if (judgeAddress.toLowerCase() !== this.signer.address.toLowerCase()) {
      console.error(`❌ Judge address mismatch!`);
      console.error(`   Contract expects: ${judgeAddress}`);
      console.error(`   Your key:         ${this.signer.address}`);
      process.exit(1);
    }

    this.lastBlock = await this.provider.getBlockNumber();
    console.log(`Starting from block ${this.lastBlock}\n`);

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
      const taskId = Number(event.args?.taskId);
      const agent = event.args?.agent;
      const resultHash = event.args?.resultHash;
      
      console.log(`📥 Task #${taskId} submitted by ${agent}`);
      console.log(`   Result: ${resultHash}`);

      // Fetch task details
      const task = await this.contract.tasks(taskId) as Task;
      
      // Check if already judged
      if (task.status !== 1) { // Not InProgress
        console.log(`   Skipping: status = ${task.status}`);
        continue;
      }

      // Evaluate
      try {
        const evaluation = await this.evaluate(task, resultHash);
        console.log(`   Score: ${evaluation.score}/100`);
        console.log(`   Winner: ${evaluation.winner}`);

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
      } catch (e) {
        console.error(`   ❌ Evaluation failed: ${e instanceof Error ? e.message : String(e)}\n`);
      }
    }

    this.lastBlock = currentBlock;
  }

  private async evaluate(task: Task, resultHash: string): Promise<EvaluationResult> {
    // Parse evaluation standard from task.evaluationCID
    const evalType = this.parseEvalType(task.evaluationCID);
    
    // Fetch submission content (simplified - assume resultHash is the answer)
    // In production, fetch from IPFS or other storage
    const submission = resultHash;

    if (evalType === "test_cases") {
      return this.evaluateWithTestCases(task, submission);
    } else if (evalType === "judge_prompt" && anthropic) {
      return this.evaluateWithClaude(task, submission);
    } else {
      // Default: manual/automatic fallback
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

  private async evaluateWithTestCases(task: Task, submission: string): Promise<EvaluationResult> {
    // Simple test case evaluation (60% of score)
    // Run submission against test cases
    // For demo: assume 60% correctness
    
    const correctness = 60;
    const codeQuality = 20;  // Would need code analysis
    const efficiency = 10;   // Would need performance testing
    
    const score = correctness + codeQuality + efficiency;
    
    return {
      score,
      winner: task.assignedAgent,
      reasonURI: `ipfs://eval-${Date.now()}`,
      breakdown: { correctness, codeQuality, efficiency }
    };
  }

  private async evaluateWithClaude(task: Task, submission: string): Promise<EvaluationResult> {
    if (!anthropic) {
      throw new Error("Claude API not configured");
    }

    const prompt = `You are an expert code reviewer. Evaluate this solution:

Task: ${task.description}

Submission: ${submission}

Score from 0-100 based on:
- Correctness (40%): Does it solve the problem?
- Code Quality (30%): Clean, readable, maintainable?
- Efficiency (30%): Optimized solution?

Respond ONLY with JSON: {"score": number, "breakdown": {"correctness": number, "codeQuality": number, "efficiency": number}, "feedback": "string"}`;

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    });

    const content = response.content[0].type === "text" ? response.content[0].text : "";
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Claude response did not contain valid JSON");
    }

    const result = JSON.parse(jsonMatch[0]);
    
    return {
      score: Math.min(100, Math.max(0, result.score)),
      winner: task.assignedAgent,
      reasonURI: `ipfs://claude-eval-${Date.now()}`,
      breakdown: result.breakdown || { correctness: 0, codeQuality: 0, efficiency: 0 }
    };
  }

  private async evaluateAutomatic(task: Task, submission: string): Promise<EvaluationResult> {
    // Default automatic evaluation
    // For MVP: pass with minimum score if submission exists
    console.log(`   Using automatic evaluation (submission received)`);
    
    return {
      score: 75,  // Default passing score
      winner: task.assignedAgent,
      reasonURI: `ipfs://auto-eval-${Date.now()}`,
      breakdown: { correctness: 30, codeQuality: 25, efficiency: 20 }
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
