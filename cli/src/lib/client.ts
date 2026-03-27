// src/lib/client.ts — ArenaClient factory using OnchainOS wallet

import { ethers } from "ethers";
import { ArenaClient } from "@agent-arena/sdk";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { getAgentSigner } from "./wallet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadABI(): unknown[] {
  const artifactPath = path.resolve(__dirname, "../../artifacts/AgentArena.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  return artifact.abi;
}

function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = config.get("rpcUrl") || "https://testrpc.xlayer.tech/terigon";
  return new ethers.JsonRpcProvider(rpcUrl);
}

function validateConfig() {
  const contractAddress = config.get("contractAddress");
  const indexerUrl      = config.get("indexerUrl");
  if (!contractAddress) throw new Error("Contract address not set. Run: arena init");
  if (!indexerUrl)      throw new Error("Indexer URL not set. Run: arena init");
  return { contractAddress, indexerUrl };
}

/** Signed client — for apply/register/submit (needs wallet) */
export async function getClient(localPassword?: string): Promise<ArenaClient> {
  const { contractAddress, indexerUrl } = validateConfig();
  const provider = getProvider();
  const signer   = await getAgentSigner(provider, localPassword);
  const abi      = loadABI();
  return new ArenaClient({ indexerUrl, signer, contractAddress, abi });
}

/** Read-only client — for status/tasks (no wallet needed) */
export function getReadonlyClient(): ArenaClient {
  const { contractAddress, indexerUrl } = validateConfig();
  const provider = getProvider();
  const signer   = ethers.Wallet.createRandom().connect(provider);
  const abi      = loadABI();
  return new ArenaClient({ indexerUrl, signer, contractAddress, abi });
}
