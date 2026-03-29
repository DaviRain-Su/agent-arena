// src/commands/post.ts — Post a new task with OKB reward

import chalk from "chalk";
import ora from "ora";
import { config } from "../lib/config.js";
import { getClient } from "../lib/client.js";
import { getWalletBackend } from "../lib/wallet.js";

interface PostOptions {
  description: string;
  reward: string;
  deadline: string;
  evaluation?: string;
  password?: string;
}

export async function cmdPost(opts: PostOptions) {
  const agentId = config.get("agentId");
  const address = config.get("walletAddress");
  const backend = getWalletBackend();

  if (!agentId || !address) {
    console.log(chalk.red("❌ Not initialized. Run: arena init"));
    process.exit(1);
  }

  const rewardOKB = opts.reward;
  const deadlineSec = parseDuration(opts.deadline);
  const deadlineUnix = Math.floor(Date.now() / 1000) + deadlineSec;
  const description = opts.description;

  console.log(chalk.cyan.bold("\n🏟️  Post New Task\n"));
  console.log(`  Agent:       ${chalk.yellow(agentId)}`);
  console.log(`  Wallet:      ${address} ${backend === "onchainos" ? chalk.green("[TEE]") : chalk.dim("[local]")}`);
  console.log(`  Reward:      ${chalk.yellow(rewardOKB + " OKB")}`);
  console.log(`  Deadline:    ${chalk.dim(new Date(deadlineUnix * 1000).toISOString())}`);
  console.log(`  Description: ${chalk.white(description.slice(0, 80))}${description.length > 80 ? "..." : ""}`);
  if (opts.evaluation) console.log(`  Evaluation:  ${chalk.dim(opts.evaluation)}`);
  console.log();

  let password = opts.password || process.env.ARENA_PASSWORD;
  if (backend === "local" && !password) {
    const { password: promptPassword } = await import("@inquirer/prompts");
    password = await promptPassword({ message: "Wallet password:" });
  }

  const spinner = ora("Submitting task on-chain...").start();
  try {
    const client = await getClient(password);
    const { txHash, taskId } = await client.postTask(
      description,
      rewardOKB,
      deadlineUnix,
      opts.evaluation || "",
    );

    spinner.succeed(chalk.green(`Task #${taskId} posted!`));
    console.log(chalk.dim(`   Tx:       ${txHash}`));
    console.log(chalk.dim(`   Reward:   ${rewardOKB} OKB`));
    console.log(chalk.dim(`   Deadline: ${new Date(deadlineUnix * 1000).toISOString()}`));

    const explorerBase = config.get("rpcUrl")?.includes("test")
      ? "https://www.okx.com/web3/explorer/xlayer-test/tx/"
      : "https://www.okx.com/web3/explorer/xlayer/tx/";
    console.log(chalk.dim(`   Explorer: ${explorerBase}${txHash}`));
    console.log(chalk.white(`\nOther agents will now see your task and compete to solve it.\n`));
  } catch (e: unknown) {
    spinner.fail(chalk.red(`Post failed: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  }
}

function parseDuration(input: string): number {
  const match = input.match(/^(\d+)(h|d|m|s)?$/i);
  if (!match) {
    const unix = parseInt(input);
    if (unix > 1e9) return unix - Math.floor(Date.now() / 1000);
    throw new Error(`Invalid deadline: "${input}". Use: 24h, 7d, 30m, or a unix timestamp.`);
  }
  const val = parseInt(match[1]);
  const unit = (match[2] || "h").toLowerCase();
  switch (unit) {
    case "s": return val;
    case "m": return val * 60;
    case "h": return val * 3600;
    case "d": return val * 86400;
    default:  return val * 3600;
  }
}
