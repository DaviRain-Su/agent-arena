// src/commands/start.ts — Start the agent daemon

import { password } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { AgentLoop } from "@agent-arena/sdk";
import type { Task } from "@agent-arena/sdk";
import { config } from "../lib/config.js";
import { getClient } from "../lib/client.js";
import { evaluate, execute } from "../lib/llm.js";

function formatTask(t: Task): string {
  const reward = chalk.yellow(`${t.reward} OKB`);
  const deadline = new Date(t.deadline * 1000).toLocaleString();
  const desc = t.description.slice(0, 60) + (t.description.length > 60 ? "..." : "");
  return `#${t.id} [${reward}] ${desc} | due ${deadline}`;
}

export async function cmdStart(opts: { password?: string; dry?: boolean }) {
  const agentId = config.get("agentId");
  const address = config.get("walletAddress");
  const minConfidence = config.get("minConfidence") ?? 0.7;
  const pollInterval  = config.get("pollInterval")  ?? 30_000;
  const maxConcurrent = config.get("maxConcurrent") ?? 3;
  const minReward     = config.get("minReward")     ?? "0.001";

  if (!agentId || !address) {
    console.log(chalk.red("❌ Not initialized. Run: arena init"));
    process.exit(1);
  }

  console.log(chalk.cyan.bold("\n🏟️  Agent Arena Daemon\n"));
  console.log(chalk.white(`  Agent:      ${chalk.yellow(agentId)}`));
  console.log(chalk.white(`  Wallet:     ${address}`));
  console.log(chalk.white(`  Confidence: ${chalk.yellow(`≥${minConfidence}`)}`));
  console.log(chalk.white(`  Min reward: ${chalk.yellow(`${minReward} OKB`)}`));
  console.log(chalk.white(`  Concurrent: ${chalk.yellow(String(maxConcurrent))}`));
  console.log(chalk.white(`  Poll:       ${chalk.yellow(`${pollInterval / 1000}s`)}`));
  if (opts.dry) console.log(chalk.yellow("\n  [DRY RUN — won't submit transactions]\n"));
  console.log();

  const pwd = opts.password || await password({ message: "Wallet password:" });

  const spinner = ora("Connecting...").start();
  let client;
  try {
    client = await getClient(pwd);
    const profile = await client.getMyProfile();
    if (!profile) {
      spinner.fail(chalk.red("Agent not registered. Run: arena register"));
      process.exit(1);
    }
    const stats = await client.getStats();
    spinner.succeed(chalk.green(`Connected — ${stats.openTasks} open tasks, ${stats.totalAgents} agents`));
  } catch (e: unknown) {
    spinner.fail(chalk.red(`Connection failed: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  }

  const log = (msg: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`${chalk.dim(ts)} ${msg}`);
  };

  let tasksEvaluated = 0;
  let tasksApplied   = 0;
  let tasksExecuted  = 0;
  let tasksSubmitted = 0;

  const loop = new AgentLoop(client, {
    evaluate: async (task: Task): Promise<number> => {
      // Skip tasks below min reward
      if (parseFloat(task.reward) < parseFloat(minReward)) {
        log(chalk.dim(`Skip #${task.id}: reward ${task.reward} OKB < min ${minReward} OKB`));
        return 0;
      }

      // Skip tasks already past deadline
      if (task.deadline < Date.now() / 1000) {
        log(chalk.dim(`Skip #${task.id}: expired`));
        return 0;
      }

      tasksEvaluated++;
      const spin = ora({ text: chalk.dim(`Evaluating #${task.id}...`), prefixText: "" }).start();
      try {
        const confidence = await evaluate(task);
        if (confidence >= minConfidence) {
          spin.succeed(chalk.green(`  #${task.id} confidence=${confidence.toFixed(2)} — will apply`));
        } else {
          spin.info(chalk.dim(`  #${task.id} confidence=${confidence.toFixed(2)} — skip`));
        }
        return confidence;
      } catch (e: unknown) {
        spin.fail(chalk.red(`  #${task.id} evaluate failed`));
        return 0;
      }
    },

    execute: async (task: Task) => {
      tasksExecuted++;
      log(chalk.cyan(`\n▶ Executing task #${task.id}`));
      log(chalk.dim(`  ${task.description.slice(0, 100)}...`));

      const spin = ora("  Running LLM...").start();
      try {
        const result = await execute(task);
        spin.succeed(chalk.green(`  Done — ${result.resultHash.slice(0, 30)}...`));
        log(chalk.dim(`  Preview: ${result.resultPreview.slice(0, 80)}...`));
        tasksSubmitted++;
        return {
          resultHash:    opts.dry ? "dry-run:0x0" : result.resultHash,
          resultPreview: result.resultPreview,
        };
      } catch (e: unknown) {
        spin.fail(chalk.red(`  Execution failed: ${e instanceof Error ? e.message : String(e)}`));
        throw e;
      }
    },

    minConfidence,
    pollInterval,
    maxConcurrent,
    log: (msg: string) => log(chalk.dim(msg)),
  });

  // Intercept apply to count + support dry run
  const origApply = client.applyForTask.bind(client);
  if (opts.dry) {
    (client as unknown as Record<string, unknown>).applyForTask = async (taskId: number) => {
      tasksApplied++;
      log(chalk.yellow(`[dry] Would apply for task #${taskId}`));
      return "dry-run-hash";
    };
    (client as unknown as Record<string, unknown>).submitResult = async (taskId: number) => {
      log(chalk.yellow(`[dry] Would submit result for task #${taskId}`));
      return "dry-run-hash";
    };
  } else {
    (client as unknown as Record<string, unknown>).applyForTask = async (taskId: number) => {
      tasksApplied++;
      return origApply(taskId);
    };
  }

  // Status line every 5 minutes
  const statusInterval = setInterval(() => {
    log(chalk.white.bold(
      `📊 Stats — evaluated:${tasksEvaluated} applied:${tasksApplied} executed:${tasksExecuted} submitted:${tasksSubmitted}`
    ));
  }, 5 * 60_000);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log(chalk.yellow("\n\nShutting down..."));
    loop.stop();
    clearInterval(statusInterval);
    console.log(chalk.white.bold(
      `\nSession summary:\n  Evaluated: ${tasksEvaluated}\n  Applied:   ${tasksApplied}\n  Executed:  ${tasksExecuted}\n  Submitted: ${tasksSubmitted}\n`
    ));
    process.exit(0);
  });

  log(chalk.green("Daemon started. Ctrl+C to stop.\n"));
  await loop.start();
}
