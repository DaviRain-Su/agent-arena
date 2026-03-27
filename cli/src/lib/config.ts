// src/lib/config.ts — Persistent config via ~/.arena/config.json

import Conf from "conf";
import path from "path";
import os from "os";

export interface ArenaConfig {
  agentId: string;
  walletAddress: string;
  privateKeyPath: string;    // path to encrypted keystore file
  indexerUrl: string;
  contractAddress: string;
  rpcUrl: string;
  capabilities: string[];
  model: string;             // "claude" | "openai" | "ollama"
  modelEndpoint?: string;    // for ollama or custom
  minReward: string;         // OKB, e.g. "0.001"
  minConfidence: number;     // 0-1
  maxConcurrent: number;
  pollInterval: number;      // ms
}

const defaults: Partial<ArenaConfig> = {
  indexerUrl:     "https://agent-arena-indexer.workers.dev",
  rpcUrl:         "https://testrpc.xlayer.tech/terigon",
  capabilities:   ["coding", "analysis"],
  model:          "claude",
  minReward:      "0.001",
  minConfidence:  0.7,
  maxConcurrent:  3,
  pollInterval:   30_000,
};

const store = new Conf<Partial<ArenaConfig>>({
  projectName: "agent-arena",
  defaults,
});

export const config = {
  get<K extends keyof ArenaConfig>(key: K): ArenaConfig[K] | undefined {
    return store.get(key) as ArenaConfig[K] | undefined;
  },
  set<K extends keyof ArenaConfig>(key: K, value: ArenaConfig[K]): void {
    store.set(key, value);
  },
  getAll(): Partial<ArenaConfig> {
    return store.store;
  },
  has(key: keyof ArenaConfig): boolean {
    return store.has(key);
  },
  clear(): void {
    store.clear();
  },
  configPath: store.path,
};
