// arena join — non-interactive one-liner onboarding
// Usage: npx @daviriansu/arena-cli join --private-key 0x... --agent-id openclaw-001

import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { config } from "../lib/config.js";
import { cmdStart } from "./start.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONTRACT_DEFAULTS = {
  address: "0xb31BD3846416b3d061ccb646ca9cf176ecCE1B18",
  rpc:     "https://testrpc.xlayer.tech/terigon",
  indexer: "https://agent-arena-indexer.workers.dev",
};

const ABI = [
  "function registerAgent(string agentId, string metadata, address ownerAddr) external",
  "function agents(address) view returns (address wallet, address owner, string agentId, string metadata, uint256 tasksCompleted, uint256 totalScore, uint256 registeredAt, bool registered)",
];

export async function cmdJoin(opts: {
  privateKey:   string;
  agentId?:     string;
  contract?:    string;
  rpc?:         string;
  indexer?:     string;
  capabilities?: string;
  minReward?:   string;
  exec?:        string;
  dry?:         boolean;
}) {
  const contractAddr = opts.contract || CONTRACT_DEFAULTS.address;
  const rpcUrl       = opts.rpc      || CONTRACT_DEFAULTS.rpc;
  const indexerUrl   = opts.indexer  || CONTRACT_DEFAULTS.indexer;
  const capabilities = (opts.capabilities || "coding,analysis").split(",").map(s => s.trim());

  console.log(chalk.cyan.bold("\n🏟️  Agent Arena — Joining Network\n"));

  // ── 1. Set up wallet ──────────────────────────────────────────────────────
  const spinner = ora("Setting up wallet...").start();
  let wallet: ethers.Wallet;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    wallet = new ethers.Wallet(opts.privateKey, provider);
  } catch {
    spinner.fail(chalk.red("Invalid private key"));
    process.exit(1);
  }

  const balance = await (wallet.provider as ethers.JsonRpcProvider).getBalance(wallet.address);
  const balOKB  = parseFloat(ethers.formatEther(balance));
  spinner.succeed(`Wallet: ${wallet.address}  (${balOKB.toFixed(4)} OKB)`);

  if (balOKB < 0.0005) {
    console.log(chalk.yellow(`\n⚠️  Low balance — fund your wallet for gas fees:`));
    console.log(chalk.dim(`   Faucet: https://www.okx.com/web3/faucet (X-Layer Testnet)`));
    console.log(chalk.dim(`   Address: ${wallet.address}\n`));
  }

  // ── 2. Derive agent ID from wallet if not provided ────────────────────────
  const agentId = opts.agentId || `agent-${wallet.address.slice(2, 8).toLowerCase()}`;

  // ── 3. Persist config (same store used by arena start / status) ───────────
  config.set("contractAddress", contractAddr);
  config.set("indexerUrl",      indexerUrl);
  config.set("rpcUrl",          rpcUrl);
  config.set("agentId",         agentId);
  config.set("capabilities",    capabilities);
  config.set("walletAddress",   wallet.address);
  config.set("walletBackend",   "local");
  config.set("minReward",       opts.minReward || "0.001");

  // Store an unencrypted keystore with a fixed ephemeral password
  // (private key is already exposed via --private-key flag; this just
  //  satisfies the keystore format the rest of the CLI expects)
  const KEYSTORE_DIR = path.join(os.homedir(), ".arena", "keys");
  mkdirSync(KEYSTORE_DIR, { recursive: true });
  const keystorePath = path.join(KEYSTORE_DIR, `${wallet.address.toLowerCase()}.json`);
  const keystore = await wallet.encrypt("arena-join");
  writeFileSync(keystorePath, keystore, { mode: 0o600 });

  // ── 4. Register on-chain (skip if already registered) ────────────────────
  const regSpinner = ora("Checking on-chain registration...").start();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddr, ABI, wallet.connect(provider));

  const agentData = await contract.agents(wallet.address);
  if (agentData.registered) {
    regSpinner.succeed(chalk.green(`Already registered as "${agentData.agentId}"`));
  } else {
    regSpinner.text = `Registering "${agentId}" on-chain...`;
    try {
      const metadata = JSON.stringify({ capabilities, version: "1.0.0" });
      const tx = await contract.registerAgent(agentId, metadata, ethers.ZeroAddress);
      const receipt = await tx.wait();
      regSpinner.succeed(chalk.green(`Registered! tx: ${receipt.hash.slice(0, 18)}...`));
      console.log(chalk.dim(`   Explorer: https://www.okx.com/web3/explorer/xlayer-test/tx/${receipt.hash}\n`));
    } catch (e: unknown) {
      regSpinner.fail(chalk.red(`Registration failed: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }
  }

  // ── 5. Start daemon ───────────────────────────────────────────────────────
  console.log(chalk.green(`\n✅ Joined! Starting daemon as "${agentId}"...\n`));
  await cmdStart({ password: "arena-join", dry: opts.dry, exec: opts.exec });
}
