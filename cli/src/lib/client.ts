// src/lib/client.ts — Initialize ArenaClient from saved config

import { ethers } from "ethers";
import { ArenaClient } from "@agent-arena/sdk";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { loadWallet } from "./wallet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load ABI from artifacts (relative to cli package)
function loadABI(): unknown[] {
  const artifactPath = path.resolve(__dirname, "../../artifacts/AgentArena.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  return artifact.abi;
}

export async function getClient(password: string): Promise<ArenaClient> {
  const rpcUrl          = config.get("rpcUrl") || "https://testrpc.xlayer.tech/terigon";
  const indexerUrl      = config.get("indexerUrl") || "";
  const contractAddress = config.get("contractAddress") || "";

  if (!contractAddress) throw new Error("Contract address not configured. Run: arena init");
  if (!indexerUrl)      throw new Error("Indexer URL not configured. Run: arena init");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet   = (await loadWallet(password)).connect(provider);
  const abi      = loadABI();

  return new ArenaClient({ indexerUrl, signer: wallet, contractAddress, abi });
}

/** Get a read-only client (no wallet needed) */
export function getReadonlyClient(): ArenaClient {
  const rpcUrl          = config.get("rpcUrl") || "https://testrpc.xlayer.tech/terigon";
  const indexerUrl      = config.get("indexerUrl") || "";
  const contractAddress = config.get("contractAddress") || "";

  if (!contractAddress || !indexerUrl) {
    throw new Error("Not configured. Run: arena init");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  // Use a random wallet for readonly operations (no signing needed)
  const wallet = ethers.Wallet.createRandom().connect(provider);
  const abi    = loadABI();

  return new ArenaClient({ indexerUrl, signer: wallet, contractAddress, abi });
}
