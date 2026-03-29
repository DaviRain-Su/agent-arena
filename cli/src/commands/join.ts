// arena join — secure one-command agent onboarding
//
// Wallet priority:
//   1. OKX OnchainOS Agentic Wallet (TEE, default)
//      — auto-detects onchainos CLI → login → OTP → get address
//   2. Local encrypted keystore (fallback when onchainos unavailable)
//
// Usage:
//   arena join                                           # auto-detect OnchainOS
//   arena join --agent-id my-agent --owner 0xYourWallet  # with options
//   arena join --local                                   # force local keystore

import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import path from "path";
import os from "os";
import { config } from "../lib/config.js";
import {
  isOnchainosInstalled,
  getOnchainosStatus,
  onchainosLogin,
  onchainosVerify,
  getOnchainosAddress,
  createLocalWallet,
  sendOnchainOSTransaction,
} from "../lib/wallet.js";
import { cmdStart } from "./start.js";

const MAINNET_DEFAULTS = {
  address: "0x964441A7f7B7E74291C05e66cb98C462c4599381",
  rpc:     "https://rpc.xlayer.tech",
  indexer: "https://agent-arena-indexer.davirain-yin.workers.dev",
  chainId: 196,
};

const ABI = [
  "function registerAgent(string agentId, string metadata, address ownerAddr) external",
  "function agents(address) view returns (address wallet, address owner, string agentId, string metadata, uint256 tasksCompleted, uint256 totalScore, uint256 tasksAttempted, bool registered)",
];

import { randomBytes } from "node:crypto";

const KEYSTORE_DIR = path.join(os.homedir(), ".arena", "keys");

export async function cmdJoin(opts: {
  onchainOsAddress?: string;
  agentId?:          string;
  owner?:            string;
  contract?:         string;
  rpc?:              string;
  indexer?:          string;
  capabilities?:     string;
  minReward?:        string;
  exec?:             string;
  dry?:              boolean;
  local?:            boolean;
}) {
  const contractAddr = opts.contract || MAINNET_DEFAULTS.address;
  const rpcUrl       = opts.rpc      || MAINNET_DEFAULTS.rpc;
  const indexerUrl   = opts.indexer  || MAINNET_DEFAULTS.indexer;
  const capabilities = (opts.capabilities || "coding,analysis").split(",").map(s => s.trim());
  const chainId      = rpcUrl.includes("testrpc") ? 195 : MAINNET_DEFAULTS.chainId;
  const provider     = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });

  console.log(chalk.cyan.bold("\n🏟️  Agent Arena — Joining Network\n"));

  // ── Step 1: Resolve agent wallet ──────────────────────────────────────────

  let agentAddress: string;
  let walletBackend: "onchainos" | "local";
  let signerForReg: ethers.Signer | null = null;
  let localPassword: string | undefined;
  let useOnchainOS = false;

  if (!opts.local && !opts.onchainOsAddress) {
    // ── Path A: Auto-detect and setup OnchainOS ────────────────────────────
    if (isOnchainosInstalled()) {
      console.log(chalk.green("✔ onchainos CLI detected"));

      let status = getOnchainosStatus();

      if (!status.loggedIn) {
        // Interactive login flow
        console.log(chalk.dim("\n  OnchainOS Agentic Wallet requires login.\n"));

        const { input } = await import("@inquirer/prompts");
        const email = await input({
          message: "Email address (for OnchainOS wallet login):",
          validate: (v) => v.includes("@") ? true : "Enter a valid email",
        });

        const loginSpinner = ora("Sending verification code...").start();
        const loginOk = onchainosLogin(email);
        if (!loginOk) {
          loginSpinner.fail(chalk.red("Failed to send verification code"));
          console.log(chalk.yellow("\n  Falling back to local keystore wallet.\n"));
        } else {
          loginSpinner.succeed(chalk.green(`Verification code sent to ${email}`));

          const otp = await input({
            message: "Enter verification code from email:",
            validate: (v) => /^\d{6}$/.test(v) ? true : "Enter 6-digit code",
          });

          const verifySpinner = ora("Verifying...").start();
          const verifyResult = onchainosVerify(otp);
          if (!verifyResult.ok) {
            verifySpinner.fail(chalk.red("Verification failed"));
            console.log(chalk.yellow("\n  Falling back to local keystore wallet.\n"));
          } else {
            verifySpinner.succeed(chalk.green(`Logged in as ${verifyResult.accountName || "wallet"}`));
            status = getOnchainosStatus();
          }
        }
      }

      if (status.loggedIn) {
        const addr = getOnchainosAddress();
        if (addr) {
          agentAddress  = addr;
          walletBackend = "onchainos";
          useOnchainOS  = true;
          console.log(chalk.green(`\n✔ OnchainOS Agentic Wallet: ${agentAddress}`));
          console.log(chalk.dim("  Private key sealed in TEE secure enclave. Never exposed.\n"));
        } else {
          console.log(chalk.yellow("  Could not get wallet address from OnchainOS"));
          console.log(chalk.yellow("  Falling back to local keystore wallet.\n"));
        }
      }
    } else {
      console.log(chalk.dim("  onchainos CLI not found. Install for TEE wallet security:"));
      console.log(chalk.dim("  curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh\n"));
      console.log(chalk.dim("  Falling back to local keystore wallet.\n"));
    }
  }

  if (opts.onchainOsAddress) {
    // ── Path B: Explicit OnchainOS address ──────────────────────────────────
    if (!ethers.isAddress(opts.onchainOsAddress)) {
      console.log(chalk.red("❌ Invalid --onchainos-address"));
      process.exit(1);
    }
    agentAddress  = opts.onchainOsAddress;
    walletBackend = "onchainos";
    useOnchainOS  = true;
    console.log(chalk.green(`✔ OnchainOS TEE wallet: ${agentAddress}`));
  }

  if (!useOnchainOS) {
    // ── Path C: Local keystore (fallback) ───────────────────────────────────
    mkdirSync(KEYSTORE_DIR, { recursive: true });

    const pwdFile = path.join(KEYSTORE_DIR, ".password");
    const resolvePassword = (): string => {
      if (process.env.ARENA_PASSWORD) return process.env.ARENA_PASSWORD;
      if (existsSync(pwdFile)) return readFileSync(pwdFile, "utf8").trim();
      const pwd = randomBytes(24).toString("base64");
      writeFileSync(pwdFile, pwd, { mode: 0o600 });
      return pwd;
    };
    const walletPassword = resolvePassword();

    const existingAddr = config.get("walletAddress");
    const existingBack = config.get("walletBackend");
    const keystorePath = (existingAddr && existingBack === "local")
      ? path.join(KEYSTORE_DIR, `${existingAddr.toLowerCase()}.json`)
      : null;

    if (keystorePath && existsSync(keystorePath)) {
      const genSpinner = ora("Loading existing local wallet...").start();
      try {
        const w = await ethers.Wallet.fromEncryptedJson(readFileSync(keystorePath, "utf8"), walletPassword);
        signerForReg  = (w as ethers.Wallet).connect(provider);
        agentAddress  = (w as ethers.Wallet).address;
        walletBackend = "local";
        localPassword = walletPassword;
        genSpinner.succeed(chalk.green(`Local wallet loaded: ${agentAddress}`));
      } catch {
        const genSpinner2 = ora("Generating new agent wallet...").start();
        const newWallet   = await createLocalWallet(walletPassword);
        signerForReg  = (newWallet as ethers.Wallet).connect(provider);
        agentAddress  = (newWallet as ethers.Wallet).address;
        walletBackend = "local";
        localPassword = walletPassword;
        genSpinner2.succeed(chalk.green(`New wallet: ${agentAddress}`));
      }
    } else {
      const genSpinner = ora("Generating new agent wallet...").start();
      const newWallet  = await createLocalWallet(walletPassword);
      signerForReg  = (newWallet as ethers.Wallet).connect(provider);
      agentAddress  = (newWallet as ethers.Wallet).address;
      walletBackend = "local";
      localPassword = walletPassword;
      genSpinner.succeed(chalk.green(`New wallet: ${agentAddress}`));
      console.log(chalk.dim(`  Keystore: ${path.join(KEYSTORE_DIR, agentAddress.toLowerCase() + ".json")}`));
    }

    // Balance check for local wallet (needs gas funding)
    const balance = await provider.getBalance(agentAddress);
    if (parseFloat(ethers.formatEther(balance)) < 0.0005) {
      console.log(chalk.yellow(`\n⚠️  Fund this address with OKB for gas:`));
      console.log(chalk.dim(`   Address: ${agentAddress}`));
      console.log(chalk.dim(`   X-Layer is gas-free but registration txns still need a small balance.\n`));
    }
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
    console.log(chalk.dim(`  Agent:  ${agentAddress!}  (signs transactions)\n`));
  }

  // ── Step 3: Persist config ─────────────────────────────────────────────────
  const agentId = opts.agentId || `agent-${agentAddress!.slice(2, 8).toLowerCase()}`;
  config.set("contractAddress", contractAddr);
  config.set("indexerUrl",      indexerUrl);
  config.set("rpcUrl",          rpcUrl);
  config.set("agentId",         agentId);
  config.set("capabilities",    capabilities);
  config.set("walletAddress",   agentAddress!);
  config.set("walletBackend",   walletBackend!);
  config.set("minReward",       opts.minReward || "0.001");

  // ── Step 4: Register on-chain ─────────────────────────────────────────────
  const readContract = new ethers.Contract(contractAddr, ABI, provider);
  const agentData    = await readContract.agents(agentAddress!);

  if (agentData.registered) {
    const boundOwner = agentData.owner !== ethers.ZeroAddress ? agentData.owner : agentAddress!;
    console.log(chalk.green(`✔ Already registered as "${agentData.agentId}"`) +
      chalk.dim(`  owner: ${boundOwner}\n`));

  } else if (useOnchainOS) {
    // OnchainOS — use contract-call (atomic TEE sign + broadcast)
    const regSpinner = ora(`Registering "${agentId}" on-chain via OnchainOS...`).start();
    try {
      const iface    = new ethers.Interface(ABI);
      const metadata = JSON.stringify({ capabilities, version: "1.0.0" });
      const calldata = iface.encodeFunctionData("registerAgent", [agentId, metadata, ownerAddress]);

      const txHash = await sendOnchainOSTransaction({
        to: contractAddr,
        data: calldata,
        from: agentAddress!,
      });

      regSpinner.succeed(chalk.green("Registered on-chain via OnchainOS TEE!"));
      console.log(chalk.dim(`   Agent ID: ${agentId}`));
      console.log(chalk.dim(`   Wallet:   ${agentAddress!}  [TEE secured]`));
      if (ownerAddress !== ethers.ZeroAddress) {
        console.log(chalk.dim(`   Owner:    ${ownerAddress}  ✓ bound`));
      }
      console.log(chalk.dim(`   Tx:       ${txHash}`));
      console.log(chalk.dim(`   Explorer: https://www.okx.com/web3/explorer/xlayer/tx/${txHash}\n`));
    } catch (e: unknown) {
      regSpinner.fail(chalk.red(`Registration failed: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }

  } else if (signerForReg) {
    // Local wallet — ethers.js sign directly
    const regSpinner = ora(`Registering "${agentId}" on-chain...`).start();
    try {
      const writeContract = new ethers.Contract(contractAddr, ABI, signerForReg);
      const metadata = JSON.stringify({ capabilities, version: "1.0.0" });
      const tx       = await writeContract.registerAgent(agentId, metadata, ownerAddress);
      const receipt  = await tx.wait();
      regSpinner.succeed(chalk.green("Registered on-chain!"));
      console.log(chalk.dim(`   Agent ID: ${agentId}`));
      console.log(chalk.dim(`   Wallet:   ${agentAddress!}`));
      if (ownerAddress !== ethers.ZeroAddress) {
        console.log(chalk.dim(`   Owner:    ${ownerAddress}  ✓ bound`));
      }
      console.log(chalk.dim(`   Tx:       ${receipt.hash}`));
      console.log(chalk.dim(`   Explorer: https://www.okx.com/web3/explorer/xlayer/tx/${receipt.hash}\n`));
    } catch (e: unknown) {
      regSpinner.fail(chalk.red(`Registration failed: ${e instanceof Error ? e.message : String(e)}`));
      process.exit(1);
    }
  }

  // ── Step 5: Start daemon ───────────────────────────────────────────────────
  if (!opts.exec) {
    console.log(chalk.green(`✅ Joined! Agent "${agentId}" is ready to compete.`));
    console.log(chalk.yellow("\n⚠️  No --exec provided — daemon will apply for tasks but cannot execute them."));
    console.log(chalk.dim("   To execute tasks and earn OKB, restart with:"));
    console.log(chalk.white("   arena start --exec \"node my-solver.js\"\n"));
  } else {
    console.log(chalk.green(`✅ Joined! Starting daemon as "${agentId}" with executor...\n`));
  }
  await cmdStart({ password: localPassword, dry: opts.dry, exec: opts.exec });
}
