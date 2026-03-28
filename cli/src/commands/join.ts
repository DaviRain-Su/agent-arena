// arena join — secure one-command agent onboarding
//
// Wallet priority:
//   1. OKX OnchainOS TEE  ← private key never leaves secure enclave
//   2. Generate new local keystore wallet (fallback, password-encrypted)
//
// Owner binding:
//   --owner <address>  links agent wallet to your existing wallet (MetaMask etc.)
//   The owner address is stored on-chain via registerAgent(..., ownerAddr).
//   This lets the owner manage the agent without holding the agent's private key.
//
// Usage:
//   npx @daviriansu/arena-cli join --agent-id openclaw-001 --owner 0xYourWallet
//   npx @daviriansu/arena-cli join --agent-id openclaw-001   # owner = agent wallet

import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { config } from "../lib/config.js";
import { probeOnchainOS, OnchainOSSigner, createLocalWallet } from "../lib/wallet.js";
import { cmdStart } from "./start.js";

const CONTRACT_DEFAULTS = {
  address: "0xb31BD3846416b3d061ccb646ca9cf176ecCE1B18",
  rpc:     "https://testrpc.xlayer.tech/terigon",
  indexer: "https://agent-arena-indexer.workers.dev",
};

const ABI = [
  "function registerAgent(string agentId, string metadata, address ownerAddr) external",
  "function agents(address) view returns (address wallet, address owner, string agentId, string metadata, uint256 tasksCompleted, uint256 totalScore, uint256 registeredAt, bool registered)",
];

const KEYSTORE_DIR = path.join(os.homedir(), ".arena", "keys");
const JOIN_PASSWORD = "arena-join-wallet";   // local-only, guards the generated keystore

export async function cmdJoin(opts: {
  agentId?:      string;
  owner?:        string;
  contract?:     string;
  rpc?:          string;
  indexer?:      string;
  capabilities?: string;
  minReward?:    string;
  exec?:         string;
  dry?:          boolean;
}) {
  const contractAddr = opts.contract  || CONTRACT_DEFAULTS.address;
  const rpcUrl       = opts.rpc       || CONTRACT_DEFAULTS.rpc;
  const indexerUrl   = opts.indexer   || CONTRACT_DEFAULTS.indexer;
  const capabilities = (opts.capabilities || "coding,analysis").split(",").map(s => s.trim());
  const provider     = new ethers.JsonRpcProvider(rpcUrl);

  console.log(chalk.cyan.bold("\n🏟️  Agent Arena — Joining Network\n"));

  // ── Step 1: Get or create the Agent wallet ─────────────────────────────────
  // Priority: OnchainOS TEE → generate new local keystore

  let signer: ethers.Signer;
  let agentAddress: string;
  let walletBackend: "onchainos" | "local";
  let localPassword: string | undefined;

  const teeSpinner = ora("Probing OKX OnchainOS TEE wallet...").start();
  const onchainAddr = probeOnchainOS();

  if (onchainAddr) {
    teeSpinner.succeed(
      chalk.green(`OKX OnchainOS TEE wallet found: ${onchainAddr}`) +
      chalk.dim("  (private key sealed in secure enclave)")
    );
    signer        = new OnchainOSSigner(onchainAddr, provider);
    agentAddress  = onchainAddr;
    walletBackend = "onchainos";
  } else {
    teeSpinner.warn(chalk.yellow("OnchainOS not found — generating local keystore wallet"));
    console.log(chalk.dim("  Install OKX OnchainOS for TEE security:"));
    console.log(chalk.dim("  https://github.com/okx/onchainos-skills\n"));

    // Check if a local agent wallet already exists for this machine
    mkdirSync(KEYSTORE_DIR, { recursive: true });
    const existingAddr = config.get("walletAddress");
    const keystorePath = existingAddr
      ? path.join(KEYSTORE_DIR, `${existingAddr.toLowerCase()}.json`)
      : null;

    if (keystorePath && existsSync(keystorePath)) {
      // Reuse existing local wallet
      const genSpinner = ora(`Reusing existing local wallet: ${existingAddr}`).start();
      const { readFileSync } = await import("fs");
      const w = await ethers.Wallet.fromEncryptedJson(readFileSync(keystorePath, "utf8"), JOIN_PASSWORD);
      signer        = (w as ethers.Wallet).connect(provider);
      agentAddress  = (w as ethers.Wallet).address;
      walletBackend = "local";
      localPassword = JOIN_PASSWORD;
      genSpinner.succeed(chalk.green(`Local wallet loaded: ${agentAddress}`));
    } else {
      // Generate brand-new wallet, encrypt into keystore
      const genSpinner = ora("Generating new agent wallet...").start();
      const newWallet  = await createLocalWallet(JOIN_PASSWORD);
      signer        = (newWallet as ethers.Wallet).connect(provider);
      agentAddress  = (newWallet as ethers.Wallet).address;
      walletBackend = "local";
      localPassword = JOIN_PASSWORD;
      genSpinner.succeed(chalk.green(`New agent wallet created: ${agentAddress}`));
      console.log(chalk.dim(`  Keystore: ${path.join(KEYSTORE_DIR, agentAddress.toLowerCase() + ".json")}`));
    }

    // Fund reminder
    const balance = await provider.getBalance(agentAddress);
    if (parseFloat(ethers.formatEther(balance)) < 0.0005) {
      console.log(chalk.yellow(`\n⚠️  Fund this wallet with OKB for gas:`));
      console.log(chalk.dim(`   Address: ${agentAddress}`));
      console.log(chalk.dim(`   Faucet:  https://www.okx.com/web3/faucet  (X-Layer Testnet)\n`));
    }
  }

  // ── Step 2: Determine owner address ────────────────────────────────────────
  // Owner = the human's existing wallet (MetaMask / hardware wallet).
  // If not provided, owner defaults to the agent wallet itself.

  let ownerAddress: string = ethers.ZeroAddress;   // ZeroAddress → contract uses msg.sender
  if (opts.owner) {
    if (!ethers.isAddress(opts.owner)) {
      console.log(chalk.red("❌ Invalid --owner address"));
      process.exit(1);
    }
    ownerAddress = opts.owner;
    console.log(chalk.dim(`  Owner:  ${ownerAddress} (your wallet, bound on-chain)`));
    console.log(chalk.dim(`  Agent:  ${agentAddress} (signs transactions)\n`));
  } else {
    console.log(chalk.dim(`  Owner = Agent wallet (no --owner flag; add one to bind to your MetaMask)\n`));
  }

  // ── Step 3: Persist config ─────────────────────────────────────────────────
  const agentId = opts.agentId || `agent-${agentAddress.slice(2, 8).toLowerCase()}`;

  config.set("contractAddress", contractAddr);
  config.set("indexerUrl",      indexerUrl);
  config.set("rpcUrl",          rpcUrl);
  config.set("agentId",         agentId);
  config.set("capabilities",    capabilities);
  config.set("walletAddress",   agentAddress);
  config.set("walletBackend",   walletBackend);
  config.set("minReward",       opts.minReward || "0.001");

  // ── Step 4: Register on-chain (idempotent) ─────────────────────────────────
  const regSpinner = ora("Checking on-chain registration...").start();
  const contract   = new ethers.Contract(contractAddr, ABI, signer);

  const agentData = await (new ethers.Contract(contractAddr, ABI, provider)).agents(agentAddress);
  if (agentData.registered) {
    const boundOwner = agentData.owner !== ethers.ZeroAddress ? agentData.owner : agentAddress;
    regSpinner.succeed(
      chalk.green(`Already registered as "${agentData.agentId}"`) +
      chalk.dim(`  owner: ${boundOwner}`)
    );
  } else {
    regSpinner.text = `Registering "${agentId}" on-chain...`;
    try {
      const metadata = JSON.stringify({ capabilities, version: "1.0.0" });
      const tx       = await contract.registerAgent(agentId, metadata, ownerAddress);
      const receipt  = await tx.wait();
      regSpinner.succeed(chalk.green(`Registered on-chain!`));
      console.log(chalk.dim(`   Agent ID: ${agentId}`));
      console.log(chalk.dim(`   Agent:    ${agentAddress}`));
      if (ownerAddress !== ethers.ZeroAddress) {
        console.log(chalk.dim(`   Owner:    ${ownerAddress}  ✓ bound`));
      }
      console.log(chalk.dim(`   Tx:       ${receipt.hash}`));
      console.log(chalk.dim(`   Explorer: https://www.okx.com/web3/explorer/xlayer-test/tx/${receipt.hash}\n`));
    } catch (e: unknown) {
      regSpinner.fail(chalk.red(`Registration failed: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }
  }

  // ── Step 5: Start daemon ───────────────────────────────────────────────────
  console.log(chalk.green(`✅ Joined! Starting daemon as "${agentId}"...\n`));
  await cmdStart({ password: localPassword, dry: opts.dry, exec: opts.exec });
}
