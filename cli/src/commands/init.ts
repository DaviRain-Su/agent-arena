// src/commands/init.ts — First-time setup
// No LLM config — the caller (OpenClaw/Claude Code/etc.) provides LLM execution.
// CLI only handles: protocol connection + wallet identity.

import { input, select, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { config } from "../lib/config.js";
import { probeOnchainOS, createLocalWallet, importLocalWallet } from "../lib/wallet.js";

export async function cmdInit() {
  console.log(chalk.cyan.bold("\n🏟️  Agent Arena — Setup\n"));
  console.log(chalk.dim("  This CLI handles protocol access (tasks + settlement).\n"));
  console.log(chalk.dim("  Your Agent runtime (OpenClaw, Claude Code, etc.) handles execution.\n"));

  // 1. Contract & Indexer
  const contractAddress = await input({
    message: "Contract address:",
    validate: (v) => (v.startsWith("0x") && v.length === 42) ? true : "Enter a valid 0x address",
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
    message: "Agent ID (unique name for on-chain identity):",
    default: `agent-${Date.now().toString(36)}`,
  });
  config.set("agentId", agentId);

  // 3. Capabilities (for Indexer matching, not LLM config)
  const capabilities = await checkbox({
    message: "What can your agent do? (used for task matching in Indexer)",
    choices: [
      { name: "Coding (TypeScript, Python, Rust...)", value: "coding", checked: true },
      { name: "Data Analysis",                        value: "analysis" },
      { name: "Writing & Documentation",              value: "writing" },
      { name: "Research",                             value: "research" },
      { name: "Math & Algorithms",                    value: "math" },
      { name: "On-chain Operations",                  value: "onchain" },
    ],
  });
  config.set("capabilities", capabilities);

  // 4. Wallet — OnchainOS first
  const spinner = ora("Probing OKX OnchainOS...").start();
  const onchainAddr = probeOnchainOS();

  if (onchainAddr) {
    spinner.succeed(chalk.green(`OKX OnchainOS detected — wallet: ${onchainAddr}`));
    console.log(chalk.dim("  Private key stays in TEE. This CLI never touches it.\n"));
    config.set("walletAddress", onchainAddr);
    config.set("walletBackend", "onchainos");
  } else {
    spinner.warn(chalk.yellow("OnchainOS not found — using local keystore (fallback)"));
    console.log(chalk.dim("  Install onchainos for TEE wallet: https://github.com/okx/onchainos-skills\n"));

    const walletAction = await select({
      message: "Local wallet:",
      choices: [
        { name: "Create new wallet", value: "create" },
        { name: "Import private key", value: "import" },
      ],
    });

    const { password } = await import("@inquirer/prompts");
    const pwd  = await password({ message: "Set wallet password:" });
    const pwd2 = await password({ message: "Confirm password:" });
    if (pwd !== pwd2) { console.log(chalk.red("❌ Passwords don't match.")); process.exit(1); }

    const spin2 = ora("Creating keystore...").start();
    let wallet;
    if (walletAction === "create") {
      wallet = await createLocalWallet(pwd);
    } else {
      const pk = await input({ message: "Private key (0x...):" });
      wallet = await importLocalWallet(pk, pwd);
    }
    spin2.succeed(chalk.green(`Wallet ready: ${wallet.address}`));
    console.log(chalk.yellow(`\n⚠️  Fund this address with OKB for gas: ${wallet.address}`));
    console.log(chalk.dim("   Testnet faucet: https://www.okx.com/web3/explorer/xlayer-test\n"));
  }

  // 5. Task strategy
  const minReward = await input({
    message: "Minimum task reward to accept (OKB):",
    default: "0.001",
  });
  config.set("minReward", minReward);

  console.log(chalk.green.bold("\n✅ Setup complete!"));
  console.log(chalk.dim(`   Config: ${config.configPath}\n`));
  console.log(chalk.white("Next steps:"));
  const backend = config.get("walletBackend");
  if (backend === "local") {
    console.log(chalk.dim("  (tip: install onchainos for TEE wallet security)"));
  }
  console.log(`  ${chalk.cyan("arena register")}  — register your agent on-chain`);
  console.log(`  ${chalk.cyan("arena start")}     — start accepting tasks\n`);
}
