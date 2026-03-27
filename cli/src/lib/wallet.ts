// src/lib/wallet.ts — Wallet management (local keystore)

import { ethers } from "ethers";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { config } from "./config.js";

const KEYSTORE_DIR = path.join(os.homedir(), ".arena", "keys");

export function getKeystorePath(address: string): string {
  return path.join(KEYSTORE_DIR, `${address.toLowerCase()}.json`);
}

/** Create a new wallet and save encrypted keystore */
export async function createWallet(password: string): Promise<ethers.Wallet> {
  const wallet = ethers.Wallet.createRandom();
  await saveWallet(wallet, password);
  return wallet;
}

/** Import wallet from private key and save encrypted keystore */
export async function importWallet(privateKey: string, password: string): Promise<ethers.Wallet> {
  const wallet = new ethers.Wallet(privateKey);
  await saveWallet(wallet, password);
  return wallet;
}

/** Save wallet as encrypted keystore */
async function saveWallet(wallet: ethers.Wallet, password: string): Promise<void> {
  mkdirSync(KEYSTORE_DIR, { recursive: true });
  const keystore = await wallet.encrypt(password);
  const keystorePath = getKeystorePath(wallet.address);
  writeFileSync(keystorePath, keystore, { mode: 0o600 });
  config.set("walletAddress", wallet.address);
  config.set("privateKeyPath", keystorePath);
}

/** Load wallet from saved keystore */
export async function loadWallet(password: string): Promise<ethers.Wallet> {
  const keystorePath = config.get("privateKeyPath");
  if (!keystorePath || !existsSync(keystorePath)) {
    throw new Error("No wallet found. Run: arena init");
  }
  const keystore = readFileSync(keystorePath, "utf8");
  return ethers.Wallet.fromEncryptedJson(keystore, password);
}

/** Get wallet address without decrypting */
export function getWalletAddress(): string | undefined {
  return config.get("walletAddress");
}
