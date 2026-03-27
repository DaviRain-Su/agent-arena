// src/commands/init.ts — Interactive first-time setup

import { input, password, select, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { config } from "../lib/config.js";
import { createWallet, importWallet } from "../lib/wallet.js";

export async function cmdInit() {
  console.log(chalk.cyan.bold("\n🏟️  Agent Arena — Initial Setup\n"));

  // 1. Contract & Indexer
  const contractAddress = await input({
    message: "Contract address (from deploy.js):",
    validate: (v) => v.startsWith("0x") && v.length === 42 ? true : "Enter a valid 0x address",
  });

  const indexerUrl = await input({
    message: "Indexer URL:",
    default: "https://agent-arena-indexer.workers.dev",
  });

  const rpcUrl = await input({
    message: "X-Layer RPC URL:",
    default: "https://testrpc.xlayer.tech/terigon",
  });

  config.set("contractAddress", contractAddress);
  config.set("indexerUrl", indexerUrl);
  config.set("rpcUrl", rpcUrl);

  // 2. Agent identity
  const agentId = await input({
    message: "Agent ID (unique name):",
    default: `agent-${Date.now().toString(36)}`,
  });
  config.set("agentId", agentId);

  // 3. Wallet
  const walletAction = await select({
    message: "Wallet:",
    choices: [
      { name: "Create new wallet", value: "create" },
      { name: "Import existing private key", value: "import" },
    ],
  });

  const pwd = await password({ message: "Set wallet password (used to encrypt keystore):" });
  const pwd2 = await password({ message: "Confirm password:" });
  if (pwd !== pwd2) {
    console.log(chalk.red("❌ Passwords don't match."));
    process.exit(1);
  }

  const spinner = ora("Setting up wallet...").start();
  try {
    let wallet;
    if (walletAction === "create") {
      wallet = await createWallet(pwd);
      spinner.succeed(chalk.green(`Wallet created: ${wallet.address}`));
    } else {
      const pk = await input({ message: "Private key (0x...):" });
      wallet = await importWallet(pk, pwd);
      spinner.succeed(chalk.green(`Wallet imported: ${wallet.address}`));
    }
    console.log(chalk.yellow(`\n⚠️  Fund this address with OKB for gas: ${wallet.address}`));
    console.log(chalk.dim(`   Testnet faucet: https://www.okx.com/web3/explorer/xlayer-test\n`));
  } catch (e: unknown) {
    spinner.fail(chalk.red(`Wallet setup failed: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  }

  // 4. Capabilities
  const capabilities = await checkbox({
    message: "Select your agent's capabilities:",
    choices: [
      { name: "Coding (TypeScript, Python, Rust...)", value: "coding", checked: true },
      { name: "Data Analysis", value: "analysis" },
      { name: "Writing & Documentation", value: "writing" },
      { name: "Research", value: "research" },
      { name: "Math & Algorithms", value: "math" },
    ],
  });
  config.set("capabilities", capabilities);

  // 5. LLM backend
  const model = await select({
    message: "LLM backend:",
    choices: [
      { name: "Claude (Anthropic API)", value: "claude" },
      { name: "OpenAI (GPT-4)", value: "openai" },
      { name: "Ollama (local)", value: "ollama" },
    ],
  });
  config.set("model", model);

  if (model === "ollama") {
    const endpoint = await input({
      message: "Ollama endpoint:",
      default: "http://localhost:11434",
    });
    config.set("modelEndpoint", endpoint);
  }

  // 6. Strategy
  const minReward = await input({
    message: "Minimum task reward to accept (OKB):",
    default: "0.001",
  });
  config.set("minReward", minReward);

  console.log(chalk.green.bold("\n✅ Setup complete!"));
  console.log(chalk.dim(`   Config saved to: ${config.configPath}\n`));
  console.log(chalk.white("Next steps:"));
  console.log(`  ${chalk.cyan("arena register")}  — Register your agent on-chain`);
  console.log(`  ${chalk.cyan("arena start")}     — Start the daemon\n`);
}
