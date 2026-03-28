// arena join — secure one-command agent onboarding
//
// Wallet priority:
//   1. --onchainos-address <addr>   ← EVM address from OKX OnchainOS TEE wallet
//                                     (user created via: npx skills add okx/onchainos-skills)
//   2. --generate (default)         ← generate new AES-256 encrypted local keystore
//
// Owner binding:
//   --owner <address>  links agent wallet to your main wallet (MetaMask/hardware)
//   stored on-chain via registerAgent(..., ownerAddr)
//
// Usage:
//   npx @daviriansu/arena-cli join --onchainos-address 0xABC... --owner 0xYourWallet
//   npx @daviriansu/arena-cli join --agent-id my-agent --owner 0xYourWallet

import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import path from "path";
import os from "os";
import { config } from "../lib/config.js";
import { createLocalWallet } from "../lib/wallet.js";
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

const KEYSTORE_DIR  = path.join(os.homedir(), ".arena", "keys");
const JOIN_PASSWORD = "arena-join-wallet";

export async function cmdJoin(opts: {
  onchainOsAddress?: string;   // ← from OKX OnchainOS TEE wallet
  agentId?:          string;
  owner?:            string;
  contract?:         string;
  rpc?:              string;
  indexer?:          string;
  capabilities?:     string;
  minReward?:        string;
  exec?:             string;
  dry?:              boolean;
}) {
  const contractAddr = opts.contract || CONTRACT_DEFAULTS.address;
  const rpcUrl       = opts.rpc      || CONTRACT_DEFAULTS.rpc;
  const indexerUrl   = opts.indexer  || CONTRACT_DEFAULTS.indexer;
  const capabilities = (opts.capabilities || "coding,analysis").split(",").map(s => s.trim());
  const provider     = new ethers.JsonRpcProvider(rpcUrl);

  console.log(chalk.cyan.bold("\n🏟️  Agent Arena — Joining Network\n"));

  // ── Step 1: Resolve agent wallet ──────────────────────────────────────────

  let agentAddress: string;
  let walletBackend: "onchainos" | "local";
  let signerForReg: ethers.Signer | null = null;   // null when OnchainOS (CLI can't sign)
  let localPassword: string | undefined;

  if (opts.onchainOsAddress) {
    // ── Path A: OKX OnchainOS TEE wallet ─────────────────────────────────────
    if (!ethers.isAddress(opts.onchainOsAddress)) {
      console.log(chalk.red("❌ Invalid --onchainos-address"));
      process.exit(1);
    }

    agentAddress  = opts.onchainOsAddress;
    walletBackend = "onchainos";
    signerForReg  = null;   // signing happens in TEE; CLI can't sign for this address

    console.log(chalk.green(`✔ OKX OnchainOS TEE wallet: ${agentAddress}`));
    console.log(chalk.dim("  Private key sealed in secure enclave. CLI never touches it.\n"));

  } else {
    // ── Path B: generate / reuse local keystore wallet ───────────────────────
    mkdirSync(KEYSTORE_DIR, { recursive: true });

    const existingAddr = config.get("walletAddress");
    const existingBack = config.get("walletBackend");
    const keystorePath = (existingAddr && existingBack === "local")
      ? path.join(KEYSTORE_DIR, `${existingAddr.toLowerCase()}.json`)
      : null;

    if (keystorePath && existsSync(keystorePath)) {
      const genSpinner = ora("Loading existing local wallet...").start();
      try {
        const w = await ethers.Wallet.fromEncryptedJson(readFileSync(keystorePath, "utf8"), JOIN_PASSWORD);
        signerForReg  = (w as ethers.Wallet).connect(provider);
        agentAddress  = (w as ethers.Wallet).address;
        walletBackend = "local";
        localPassword = JOIN_PASSWORD;
        genSpinner.succeed(chalk.green(`Local wallet loaded: ${agentAddress}`));
      } catch {
        // password mismatch — generate fresh
        const genSpinner2 = ora("Generating new agent wallet...").start();
        const newWallet   = await createLocalWallet(JOIN_PASSWORD);
        signerForReg  = (newWallet as ethers.Wallet).connect(provider);
        agentAddress  = (newWallet as ethers.Wallet).address;
        walletBackend = "local";
        localPassword = JOIN_PASSWORD;
        genSpinner2.succeed(chalk.green(`New wallet: ${agentAddress}`));
      }
    } else {
      const genSpinner = ora("Generating new agent wallet...").start();
      const newWallet  = await createLocalWallet(JOIN_PASSWORD);
      signerForReg  = (newWallet as ethers.Wallet).connect(provider);
      agentAddress  = (newWallet as ethers.Wallet).address;
      walletBackend = "local";
      localPassword = JOIN_PASSWORD;
      genSpinner.succeed(chalk.green(`New wallet: ${agentAddress}`));
      console.log(chalk.dim(`  Keystore: ${path.join(KEYSTORE_DIR, agentAddress.toLowerCase() + ".json")}`));
    }

    // Balance check
    const balance = await provider.getBalance(agentAddress);
    if (parseFloat(ethers.formatEther(balance)) < 0.0005) {
      console.log(chalk.yellow(`\n⚠️  Fund this address with OKB for gas:`));
      console.log(chalk.dim(`   Address: ${agentAddress}`));
      console.log(chalk.dim(`   Faucet:  https://www.okx.com/web3/faucet  (X-Layer Testnet)\n`));
    }

    console.log(chalk.dim(`\n  Tip: use --onchainos-address for TEE-secured wallet (no private key on disk)`));
    console.log(chalk.dim(`       npx skills add okx/onchainos-skills  →  create wallet  →  pass address here\n`));
  }

  // ── Step 2: Validate owner address ────────────────────────────────────────
  let ownerAddress = ethers.ZeroAddress;
  if (opts.owner) {
    if (!ethers.isAddress(opts.owner)) {
      console.log(chalk.red("❌ Invalid --owner address"));
      process.exit(1);
    }
    ownerAddress = opts.owner;
    console.log(chalk.dim(`  Owner:  ${ownerAddress}  (bound on-chain as controller)`));
    console.log(chalk.dim(`  Agent:  ${agentAddress}  (signs transactions)\n`));
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

  // ── Step 4: Register on-chain ─────────────────────────────────────────────
  const readContract = new ethers.Contract(contractAddr, ABI, provider);
  const agentData    = await readContract.agents(agentAddress);

  if (agentData.registered) {
    const boundOwner = agentData.owner !== ethers.ZeroAddress ? agentData.owner : agentAddress;
    console.log(chalk.green(`✔ Already registered as "${agentData.agentId}"`) +
      chalk.dim(`  owner: ${boundOwner}\n`));

  } else if (signerForReg) {
    // Local wallet — CLI can sign directly
    const regSpinner = ora(`Registering "${agentId}" on-chain...`).start();
    try {
      const writeContract = new ethers.Contract(contractAddr, ABI, signerForReg);
      const metadata = JSON.stringify({ capabilities, version: "1.0.0" });
      const tx       = await writeContract.registerAgent(agentId, metadata, ownerAddress);
      const receipt  = await tx.wait();
      regSpinner.succeed(chalk.green("Registered on-chain!"));
      console.log(chalk.dim(`   Agent ID: ${agentId}`));
      console.log(chalk.dim(`   Wallet:   ${agentAddress}`));
      if (ownerAddress !== ethers.ZeroAddress) {
        console.log(chalk.dim(`   Owner:    ${ownerAddress}  ✓ bound`));
      }
      console.log(chalk.dim(`   Tx:       ${receipt.hash}`));
      console.log(chalk.dim(`   Explorer: https://www.okx.com/web3/explorer/xlayer-test/tx/${receipt.hash}\n`));
    } catch (e: unknown) {
      regSpinner.fail(chalk.red(`Registration failed: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }

  } else {
    // OnchainOS wallet — CLI can't sign; emit calldata for agent to broadcast
    const metadata = JSON.stringify({ capabilities, version: "1.0.0" });
    const iface    = new ethers.Interface(ABI);
    const calldata = iface.encodeFunctionData("registerAgent", [agentId, metadata, ownerAddress]);

    console.log(chalk.yellow("⚡ OnchainOS wallet detected — CLI cannot sign for TEE keys.\n"));
    console.log(chalk.white("Ask your Agent to broadcast this registration transaction:\n"));
    console.log(chalk.dim("─────────────────────────────────────────────────────────"));
    console.log(JSON.stringify({
      event:    "sign_required",
      reason:   "registerAgent",
      to:       contractAddr,
      data:     calldata,
      from:     agentAddress,
      chainId:  1952,
      note:     "Broadcast via OnchainOS: '帮我广播这笔交易'",
    }, null, 2));
    console.log(chalk.dim("─────────────────────────────────────────────────────────\n"));
    console.log(chalk.dim("Once registered, run:  arena start\n"));
    return;   // exit — agent handles the rest
  }

  // ── Step 5: Start daemon ───────────────────────────────────────────────────
  console.log(chalk.green(`✅ Joined! Starting daemon as "${agentId}"...\n`));
  await cmdStart({ password: localPassword, dry: opts.dry, exec: opts.exec });
}
