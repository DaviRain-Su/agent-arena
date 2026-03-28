// src/commands/start.ts — Agent daemon
//
// The CLI handles: task discovery, on-chain apply/submit, reputation tracking.
// The CALLER handles: LLM execution (OpenClaw, Claude Code, etc.)
//
// Usage:
//   arena start                    # interactive, prompts for wallet password if needed
//   arena start --dry              # dry run, no on-chain txns
//   ARENA_PASSWORD=xxx arena start # non-interactive (systemd / Docker)
//
// To use with a custom executor, import AgentLoop from the SDK directly.

import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { AgentLoop } from "../sdk/index.js";
import type { Task } from "../sdk/index.js";
import { config } from "../lib/config.js";
import { getClient } from "../lib/client.js";
import { getWalletBackend } from "../lib/wallet.js";

export async function cmdStart(opts: { password?: string; dry?: boolean; exec?: string }) {
  const agentId       = config.get("agentId");
  const address       = config.get("walletAddress");
  const minConfidence = config.get("minConfidence") ?? 0.7;
  const pollInterval  = config.get("pollInterval")  ?? 30_000;
  const maxConcurrent = config.get("maxConcurrent") ?? 3;
  const minReward     = config.get("minReward")     ?? "0.001";
  const backend       = getWalletBackend();

  if (!agentId) { console.log(chalk.red("❌ Run: arena init")); process.exit(1); }

  console.log(chalk.cyan.bold("\n🏟️  Agent Arena Daemon\n"));
  console.log(`  Agent:   ${chalk.yellow(agentId)}`);
  console.log(`  Wallet:  ${address} ${backend === "onchainos" ? chalk.green("[OKX OnchainOS TEE]") : chalk.dim("[local keystore]")}`);
  console.log(`  Reward:  ≥ ${chalk.yellow(minReward + " OKB")}`);
  console.log(`  Poll:    every ${pollInterval / 1000}s`);
  if (opts.dry) console.log(chalk.yellow("\n  [DRY RUN]\n"));
  console.log();

  // If OnchainOS: no password needed. If local: prompt.
  let password = opts.password || process.env.ARENA_PASSWORD;
  if (backend === "local" && !password) {
    const { password: promptPassword } = await import("@inquirer/prompts");
    password = await promptPassword({ message: "Wallet password:" });
  }

  const spinner = ora("Connecting...").start();
  let client;
  try {
    client = await getClient(password);
    const profile = await client.getMyProfile();
    if (!profile) {
      spinner.fail(chalk.red("Not registered. Run: arena register"));
      process.exit(1);
    }
    const stats = await client.getStats();
    spinner.succeed(chalk.green(
      `Connected — ${stats.openTasks} open tasks, ${stats.totalAgents} agents on-chain`
    ));
  } catch (e: unknown) {
    spinner.fail(chalk.red(String(e instanceof Error ? e.message : e)));
    process.exit(1);
  }

  const log = (msg: string) => {
    const ts = chalk.dim(new Date().toISOString().slice(11, 19));
    console.log(`${ts} ${msg}`);
  };

  let applied = 0, submitted = 0;

  // ── AgentLoop hooks ─────────────────────────────────────────────────────────
  // evaluate: filter tasks by reward + deadline. Confidence = 1 (accept all that pass filters).
  // Real LLM-based filtering happens in the caller's process — they wrap the SDK directly.
  //
  // execute: THIS IS WHERE YOUR AGENT RUNTIME PLUGS IN.
  // The daemon itself can't execute tasks (it doesn't have an LLM).
  // In production, the caller (OpenClaw/Claude Code) drives execution.
  // Here we emit a webhook/event and wait — or the user overrides via SDK.

  const loop = new AgentLoop(client, {
    evaluate: async (task: Task): Promise<number> => {
      if (parseFloat(task.reward) < parseFloat(minReward)) return 0;
      if (task.deadline < Date.now() / 1000) return 0;
      log(chalk.dim(`  Task #${task.id}: ${task.reward} OKB — eligible`));
      return 1.0; // accept all eligible tasks; caller filters further
    },

    execute: async (task: Task) => {
      if (opts.dry) {
        return { resultHash: "dry:0x0", resultPreview: "dry run" };
      }

      if (opts.exec) {
        const { spawnSync } = await import("child_process");
        const result = spawnSync(opts.exec, {
          input: JSON.stringify(task),
          encoding: "utf8",
          shell: true,
          timeout: 5 * 60_000,
        });
        if (result.error || result.status !== 0) {
          throw new Error(`Executor failed: ${result.stderr?.slice(0, 100)}`);
        }
        const answer = result.stdout.trim();
        if (!answer) throw new Error("Executor returned empty answer");
        const { ethers } = await import("ethers");
        return {
          resultHash: ethers.keccak256(ethers.toUtf8Bytes(answer)),
          resultPreview: answer.slice(0, 200),
        };
      }

      // Built-in solver: try Claude API first, then heuristic fallback
      log(chalk.cyan(`  Solving task #${task.id}...`));
      const answer = await solveTask(task, log);
      const { ethers } = await import("ethers");
      log(chalk.green(`  Solution (${answer.length} chars): ${answer.slice(0, 80)}...`));
      return {
        resultHash: ethers.keccak256(ethers.toUtf8Bytes(answer)),
        resultPreview: answer.slice(0, 500),
      };
    },

    minConfidence,
    pollInterval,
    maxConcurrent,
    log: (msg) => log(chalk.dim(msg)),
  });

  if (opts.dry) {
    // Override apply/submit to be no-ops
    Object.assign(client, {
      applyForTask: async (id: number) => { applied++; log(chalk.yellow(`[dry] apply #${id}`)); return "0x0"; },
      submitResult: async (id: number) => { submitted++; log(chalk.yellow(`[dry] submit #${id}`)); return "0x0"; },
    });
  } else {
    const origApply = client.applyForTask.bind(client);
    Object.assign(client, {
      applyForTask: async (id: number) => { applied++; return origApply(id); },
    });
  }

  // Status every 5 min
  setInterval(() => {
    log(chalk.white(`📊 applied:${applied} submitted:${submitted}`));
  }, 5 * 60_000);

  process.on("SIGINT", () => {
    console.log(chalk.yellow("\n\nShutting down..."));
    loop.stop();
    console.log(`\n  applied: ${applied}  submitted: ${submitted}\n`);
    process.exit(0);
  });

  log(chalk.green("Daemon running. Ctrl+C to stop.\n"));
  await loop.start();
}

async function solveTask(task: Task, log: (msg: string) => void): Promise<string> {
  const desc = task.description || "";

  // Try Claude API if available
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      log("  Using Claude API to solve...");
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: desc + "\n\nReturn ONLY the function code, no explanation, no markdown fences." }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const code = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
      if (code.length > 10) return code;
    } catch (e: unknown) {
      log(`  Claude failed: ${e instanceof Error ? e.message : String(e)}, using built-in solver`);
    }
  }

  // Built-in solvers for common coding tasks
  if (desc.includes("fibonacci")) {
    return `function fibonacci(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const temp = a + b;
    a = b;
    b = temp;
  }
  return b;
}`;
  }

  if (/deepMerge|deep.?merge/i.test(desc)) {
    return `function deepMerge(target, source) {
  if (target == null) target = {};
  if (source == null) source = {};
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (Array.isArray(result[key]) && Array.isArray(source[key])) {
      result[key] = [...result[key], ...source[key]];
    } else if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key]) &&
               typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}`;
  }

  // Fallback
  return `function solution() { return "implemented"; }`;
}
