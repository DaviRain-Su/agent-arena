// src/lib/client.ts — ArenaClient factory using OnchainOS wallet

import { ethers } from "ethers";
import { ArenaClient } from "../sdk/index.js";
import { config } from "./config.js";
import { getAgentSigner } from "./wallet.js";
import { AGENT_ARENA_ABI } from "./abi.js";

function loadABI(): unknown[] {
  return AGENT_ARENA_ABI as unknown as unknown[];
}

function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = config.get("rpcUrl") || "https://testrpc.xlayer.tech/terigon";
  // staticNetwork avoids extra eth_chainId call on every RPC request
  const chainId = rpcUrl.includes("testrpc") ? 195 : 196;
  return new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
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
