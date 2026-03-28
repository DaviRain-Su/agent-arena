// src/lib/wallet.ts — OnchainOS TEE wallet (with local keystore fallback)
//
// Priority:
//   1. OKX OnchainOS (TEE, private key never exposed)
//   2. Local encrypted keystore (fallback for dev/testing)

import { ethers } from "ethers";
import { spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { config } from "./config.js";

const KEYSTORE_DIR = path.join(os.homedir(), ".arena", "keys");
const XLAYER_CHAIN_ID = "1952";

// ─── OnchainOS Signer Adapter ─────────────────────────────────────────────────
// Wraps onchainos CLI as an ethers.js Signer.
// Private key lives in TEE — never touches this process.

class OnchainOSSigner extends ethers.AbstractSigner {
  readonly address: string;

  constructor(address: string, provider: ethers.Provider) {
    super(provider);
    this.address = address;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
    // Serialize unsigned tx to hex, pass to onchainos for signing
    const unsignedHex = ethers.Transaction.from({
      to:       tx.to as string,
      data:     tx.data as string || "0x",
      value:    tx.value ? BigInt(tx.value.toString()) : 0n,
      gasLimit: tx.gasLimit ? BigInt(tx.gasLimit.toString()) : 0n,
      gasPrice: tx.gasPrice ? BigInt(tx.gasPrice.toString()) : 0n,
      nonce:    typeof tx.nonce === "number" ? tx.nonce : 0,
      chainId:  BigInt(XLAYER_CHAIN_ID),
    }).unsignedSerialized;

    const result = spawnSync("onchainos", [
      "wallet", "sign-tx",
      "--chain", XLAYER_CHAIN_ID,
      "--tx", unsignedHex,
    ], { encoding: "utf8" });

    if (result.error || result.status !== 0) {
      throw new Error(`onchainos sign-tx failed: ${result.stderr || result.error?.message}`);
    }

    const signedHex = result.stdout.trim();
    if (!signedHex.startsWith("0x")) {
      throw new Error(`onchainos returned unexpected output: ${signedHex.slice(0, 80)}`);
    }
    return signedHex;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const msgHex = typeof message === "string"
      ? Buffer.from(message).toString("hex")
      : Buffer.from(message).toString("hex");

    const result = spawnSync("onchainos", [
      "wallet", "sign-message",
      "--chain", XLAYER_CHAIN_ID,
      "--message", `0x${msgHex}`,
    ], { encoding: "utf8" });

    if (result.error || result.status !== 0) {
      throw new Error(`onchainos sign-message failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<string> {
    throw new Error("signTypedData not yet supported by OnchainOS adapter");
  }

  connect(provider: ethers.Provider): OnchainOSSigner {
    return new OnchainOSSigner(this.address, provider);
  }
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

// ─── Public API ───────────────────────────────────────────────────────────────

/** Probe onchainos CLI availability and return wallet address if available */
export function probeOnchainOS(): string | null {
  try {
    const status = spawnSync("onchainos", ["wallet", "status"], { encoding: "utf8" });
    if (status.error || status.status !== 0) return null;

    const addrResult = spawnSync("onchainos", [
      "wallet", "addresses", "--chain", XLAYER_CHAIN_ID,
    ], { encoding: "utf8" });

    if (addrResult.error || addrResult.status !== 0) return null;
    const match = addrResult.stdout.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

/**
 * Get a signer for the agent wallet.
 * Priority: OnchainOS TEE → local keystore
 */
export async function getAgentSigner(
  provider: ethers.Provider,
  localPassword?: string,
): Promise<ethers.Signer & { isOnchainOS?: boolean; address: string }> {

  // 1. Try OnchainOS first
  const onchainAddr = probeOnchainOS();
  if (onchainAddr) {
    const signer = new OnchainOSSigner(onchainAddr, provider) as OnchainOSSigner & { isOnchainOS: boolean };
    signer.isOnchainOS = true;
    config.set("walletAddress", onchainAddr);
    config.set("walletBackend", "onchainos");
    return signer;
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
