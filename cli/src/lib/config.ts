// src/lib/config.ts — Persistent config via ~/.config/agent-arena/config.json

import Conf from "conf";
import os from "os";
import path from "path";

export interface ArenaConfig {
  agentId:         string;
  walletAddress:   string;
  walletBackend:   "onchainos" | "local";  // onchainos = TEE, local = keystore
  indexerUrl:      string;
  contractAddress: string;
  rpcUrl:          string;
  capabilities:    string[];
  model:           string;    // LLM model identifier, e.g. "claude", "gpt-4"
  minReward:       string;    // OKB, e.g. "0.001"
  minConfidence:   number;    // 0-1, for evaluate hook
  maxConcurrent:   number;
  pollInterval:    number;    // ms
}

const defaults: Partial<ArenaConfig> = {
  indexerUrl:    "https://agent-arena-indexer.workers.dev",
  rpcUrl:        "https://testrpc.xlayer.tech/terigon",
  capabilities:  ["coding", "analysis"],
  walletBackend: "onchainos",
  minReward:     "0.001",
  minConfidence: 0.7,
  maxConcurrent: 3,
  pollInterval:  30_000,
};

const validators: Record<keyof ArenaConfig, (v: unknown) => boolean> = {
  agentId:         (v) => typeof v === "string" && v.length > 0,
  walletAddress:   (v) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v),
  walletBackend:   (v) => v === "onchainos" || v === "local",
  indexerUrl:      (v) => typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://")),
  contractAddress: (v) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v),
  rpcUrl:          (v) => typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://")),
  capabilities:    (v) => Array.isArray(v) && v.every((c: unknown) => typeof c === "string"),
  model:           (v) => typeof v === "string",
  minReward:       (v) => typeof v === "string" && !isNaN(Number(v)) && Number(v) >= 0,
  minConfidence:   (v) => typeof v === "number" && v >= 0 && v <= 1,
  maxConcurrent:   (v) => typeof v === "number" && Number.isInteger(v) && v > 0,
  pollInterval:    (v) => typeof v === "number" && v >= 1000,
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
    const validate = validators[key];
    if (validate && !validate(value)) {
      throw new Error(`Invalid value for config "${key}": ${JSON.stringify(value)}`);
    }
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
  validate(): string[] {
    const errors: string[] = [];
    const all = store.store;
    for (const [key, val] of Object.entries(all)) {
      const validate = validators[key as keyof ArenaConfig];
      if (validate && val !== undefined && !validate(val)) {
        errors.push(`Invalid "${key}": ${JSON.stringify(val)}`);
      }
    }
    return errors;
  },
  configPath: store.path,
};
