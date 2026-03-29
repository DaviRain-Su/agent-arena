// src/lib/wallet.ts — OnchainOS Agentic Wallet (with local keystore fallback)
//
// Priority:
//   1. OKX OnchainOS Agentic Wallet (TEE, private key never exposed)
//   2. Local encrypted keystore (fallback for dev/testing)

import { ethers } from "ethers";
import { spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { config } from "./config.js";

const KEYSTORE_DIR = path.join(os.homedir(), ".arena", "keys");
const XLAYER_CHAIN_ID = 196;

// ─── OnchainOS helpers ────────────────────────────────────────────────────────

function runOnchainos(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("onchainos", args, { encoding: "utf8", timeout: 60_000 });
  if (result.error) {
    return { ok: false, stdout: "", stderr: result.error.message };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout?.trim() || "",
    stderr: result.stderr?.trim() || "",
  };
}

function parseOnchainosJson(stdout: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed.ok && parsed.data) return parsed.data as Record<string, unknown>;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── OnchainOS Signer Adapter ─────────────────────────────────────────────────
// Uses `onchainos wallet contract-call` for transactions (TEE signing + broadcast).
// Private key lives in TEE — never touches this process.

export class OnchainOSSigner extends ethers.AbstractSigner {
  readonly address: string;

  constructor(address: string, provider: ethers.Provider) {
    super(provider);
    this.address = address;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async signTransaction(_tx: ethers.TransactionRequest): Promise<string> {
    throw new Error(
      "OnchainOS uses atomic contract-call (sign+broadcast). " +
      "Use sendOnchainOSTransaction() instead of signTransaction()."
    );
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const msgStr = typeof message === "string"
      ? message
      : Buffer.from(message).toString("utf8");

    const result = runOnchainos([
      "wallet", "sign-message",
      "--chain", String(XLAYER_CHAIN_ID),
      "--from", this.address,
      "--message", msgStr,
    ]);

    if (!result.ok) {
      throw new Error(`onchainos sign-message failed: ${result.stderr}`);
    }

    const data = parseOnchainosJson(result.stdout);
    if (data?.signature) return data.signature as string;
    throw new Error(`Unexpected sign-message output: ${result.stdout.slice(0, 100)}`);
  }

  async signTypedData(
    _domain: ethers.TypedDataDomain,
    _types: Record<string, ethers.TypedDataField[]>,
    _value: Record<string, unknown>,
  ): Promise<string> {
    throw new Error("signTypedData not yet supported by OnchainOS adapter");
  }

  connect(provider: ethers.Provider): OnchainOSSigner {
    return new OnchainOSSigner(this.address, provider);
  }
}

/**
 * Send a transaction via OnchainOS (atomic: build → TEE sign → broadcast).
 * Returns the txHash directly — no ethers TransactionResponse.
 */
export async function sendOnchainOSTransaction(opts: {
  to: string;
  data?: string;
  value?: bigint;
  from?: string;
}): Promise<string> {
  const args = [
    "wallet", "contract-call",
    "--to", opts.to,
    "--chain", String(XLAYER_CHAIN_ID),
  ];

  if (opts.data) args.push("--input-data", opts.data);
  if (opts.value && opts.value > 0n) {
    args.push("--amt", opts.value.toString());
  }
  if (opts.from) args.push("--from", opts.from);

  const result = runOnchainos(args);

  // Handle confirming response (exit code 2)
  if (!result.ok && result.stdout.includes('"confirming"')) {
    // Auto-confirm by re-running with --force
    args.push("--force");
    const retryResult = runOnchainos(args);
    if (!retryResult.ok) {
      throw new Error(`onchainos contract-call failed after confirm: ${retryResult.stderr}`);
    }
    const retryData = parseOnchainosJson(retryResult.stdout);
    if (retryData?.txHash) return retryData.txHash as string;
    throw new Error(`No txHash in retry response: ${retryResult.stdout.slice(0, 200)}`);
  }

  if (!result.ok) {
    throw new Error(`onchainos contract-call failed: ${result.stderr || result.stdout}`);
  }

  const data = parseOnchainosJson(result.stdout);
  if (data?.txHash) return data.txHash as string;
  throw new Error(`No txHash in response: ${result.stdout.slice(0, 200)}`);
}

// ─── OnchainOS Auth Flow ──────────────────────────────────────────────────────

/** Check if onchainos CLI is installed */
export function isOnchainosInstalled(): boolean {
  const result = spawnSync("onchainos", ["--version"], { encoding: "utf8", timeout: 5_000 });
  return !result.error && result.status === 0;
}

/** Check login status. Returns { loggedIn, email, accountId, accountName } */
export function getOnchainosStatus(): {
  loggedIn: boolean;
  email?: string;
  accountId?: string;
  accountName?: string;
} {
  const result = runOnchainos(["wallet", "status"]);
  if (!result.ok) return { loggedIn: false };

  const data = parseOnchainosJson(result.stdout);
  if (!data) return { loggedIn: false };

  return {
    loggedIn: data.loggedIn === true,
    email: data.email as string | undefined,
    accountId: data.currentAccountId as string | undefined,
    accountName: data.currentAccountName as string | undefined,
  };
}

/** Start login flow with email (sends OTP) */
export function onchainosLogin(email: string, locale = "en-US"): boolean {
  const result = runOnchainos(["wallet", "login", email, "--locale", locale]);
  return result.ok;
}

/** Verify OTP code */
export function onchainosVerify(otp: string): {
  ok: boolean;
  accountId?: string;
  accountName?: string;
} {
  const result = runOnchainos(["wallet", "verify", otp]);
  if (!result.ok) return { ok: false };

  const data = parseOnchainosJson(result.stdout);
  return {
    ok: true,
    accountId: data?.accountId as string | undefined,
    accountName: data?.accountName as string | undefined,
  };
}

/** Get wallet addresses (returns first EVM address on X-Layer) */
export function getOnchainosAddress(): string | null {
  const result = runOnchainos(["wallet", "addresses", "--chain", String(XLAYER_CHAIN_ID)]);
  if (!result.ok) return null;

  // Try JSON parse first
  const data = parseOnchainosJson(result.stdout);
  if (data) {
    // Look for EVM address in various response formats
    const addresses = (data.addresses || data.addressList || data) as Record<string, unknown>[];
    if (Array.isArray(addresses)) {
      for (const entry of addresses) {
        const addr = (entry as Record<string, unknown>).address as string;
        if (addr?.startsWith("0x")) return addr;
      }
    }
  }

  // Fallback: regex match
  const match = result.stdout.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

// ─── Local Keystore (fallback) ────────────────────────────────────────────────

function getKeystorePath(address: string): string {
  return path.join(KEYSTORE_DIR, `${address.toLowerCase()}.json`);
}

export async function createLocalWallet(password: string): Promise<ethers.Wallet | ethers.HDNodeWallet> {
  const wallet = ethers.Wallet.createRandom();
  mkdirSync(KEYSTORE_DIR, { recursive: true });
  const keystore = await wallet.encrypt(password);
  writeFileSync(getKeystorePath(wallet.address), keystore, { mode: 0o600 });
  config.set("walletAddress", wallet.address);
  config.set("walletBackend", "local");
  return wallet;
}

export async function importLocalWallet(privateKey: string, password: string): Promise<ethers.Wallet> {
  const wallet = new ethers.Wallet(privateKey);
  mkdirSync(KEYSTORE_DIR, { recursive: true });
  const keystore = await wallet.encrypt(password);
  writeFileSync(getKeystorePath(wallet.address), keystore, { mode: 0o600 });
  config.set("walletAddress", wallet.address);
  config.set("walletBackend", "local");
  return wallet;
}

async function loadLocalWallet(password: string, provider: ethers.Provider): Promise<ethers.Wallet> {
  const address = config.get("walletAddress");
  if (!address) throw new Error("No wallet configured. Run: arena init");
  const keystorePath = getKeystorePath(address);
  if (!existsSync(keystorePath)) throw new Error(`Keystore not found: ${keystorePath}`);
  const keystore = readFileSync(keystorePath, "utf8");
  const w = await ethers.Wallet.fromEncryptedJson(keystore, password);
  return (w as ethers.Wallet).connect(provider);
}

// ─── Legacy probe (backward compat) ──────────────────────────────────────────

/** @deprecated Use isOnchainosInstalled() + getOnchainosStatus() instead */
export function probeOnchainOS(): string | null {
  if (!isOnchainosInstalled()) return null;
  const status = getOnchainosStatus();
  if (!status.loggedIn) return null;
  return getOnchainosAddress();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a signer for the agent wallet.
 * Priority: OnchainOS TEE → local keystore
 */
export async function getAgentSigner(
  provider: ethers.Provider,
  localPassword?: string,
): Promise<ethers.Signer & { isOnchainOS?: boolean; address: string }> {

  // 1. Try OnchainOS first
  if (isOnchainosInstalled()) {
    const status = getOnchainosStatus();
    if (status.loggedIn) {
      const addr = getOnchainosAddress();
      if (addr) {
        const signer = new OnchainOSSigner(addr, provider) as OnchainOSSigner & { isOnchainOS: boolean };
        signer.isOnchainOS = true;
        config.set("walletAddress", addr);
        config.set("walletBackend", "onchainos");
        return signer;
      }
    }
  }

  // 2. Fall back to local keystore
  if (!localPassword) throw new Error("OnchainOS not available and no password provided for local wallet");
  const wallet = await loadLocalWallet(localPassword, provider);
  return Object.assign(wallet, { isOnchainOS: false });
}

export function getWalletAddress(): string | undefined {
  return config.get("walletAddress");
}

export function getWalletBackend(): string {
  return config.get("walletBackend") || "unknown";
}
