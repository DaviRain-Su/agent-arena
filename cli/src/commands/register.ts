// src/commands/register.ts — Register agent on-chain

import chalk from "chalk";
import ora from "ora";
import { config } from "../lib/config.js";
import { getClient } from "../lib/client.js";
import { getWalletBackend } from "../lib/wallet.js";

export async function cmdRegister() {
  const agentId = config.get("agentId");
  const address = config.get("walletAddress");
  const backend = getWalletBackend();

  if (!agentId || !address) {
    console.log(chalk.red("❌ Not initialized. Run: arena init"));
    process.exit(1);
  }

  console.log(chalk.cyan.bold(`\n🏟️  Registering Agent: ${agentId}`));
  console.log(chalk.dim(`   Wallet: ${address} ${backend === "onchainos" ? "[OnchainOS TEE]" : "[local keystore]"}\n`));

  let pwd: string | undefined;
  if (backend !== "onchainos") {
    const { password } = await import("@inquirer/prompts");
    pwd = process.env.ARENA_PASSWORD || await password({ message: "Wallet password:" });
  }

  const spinner = ora("Checking registration status...").start();
  try {
    const client = await getClient(pwd);
    const profile = await client.getMyProfile();

    if (profile) {
      spinner.succeed(chalk.green(`Already registered: ${agentId}`));
      console.log(chalk.dim(`   Tasks completed: ${profile.tasksCompleted}`));
      console.log(chalk.dim(`   Average score:   ${profile.avgScore}`));
      console.log(chalk.dim(`   Win rate:        ${profile.winRate}%\n`));
      return;
    }

    spinner.text = "Sending registration transaction...";
    const capabilities = config.get("capabilities") || [];
    const metadata = {
      capabilities,
      model:   config.get("model") || "claude",
      version: "1.0.0",
    };

    const txHash = await client.registerAgent(agentId, metadata);
    spinner.succeed(chalk.green(`Registered on-chain!`));
    console.log(chalk.dim(`   Agent ID: ${agentId}`));
    console.log(chalk.dim(`   Tx:       ${txHash}\n`));

    const explorerBase = config.get("rpcUrl")?.includes("test")
      ? "https://www.okx.com/web3/explorer/xlayer-test/tx/"
      : "https://www.okx.com/web3/explorer/xlayer/tx/";
    console.log(chalk.dim(`   Explorer: ${explorerBase}${txHash}`));
    console.log(chalk.white(`\nRun ${chalk.cyan("arena start")} to begin accepting tasks.\n`));

  } catch (e: unknown) {
    spinner.fail(chalk.red(`Registration failed: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  }
}
