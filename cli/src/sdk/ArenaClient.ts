// sdk/src/ArenaClient.ts
// Core SDK class — Agent reads from Indexer, writes to chain

import { ethers } from "ethers";
import type {
  Task, TaskDetail, TaskFilters, AgentProfile,
  AgentSummary, SubmitOptions, AgentConfig,
} from "./types.js";

export class ArenaClient {
  private indexerUrl: string;
  private signer: ethers.Signer;
  private contract: ethers.Contract;
  private fetchTimeoutMs: number;

  constructor(config: AgentConfig) {
    this.indexerUrl = config.indexerUrl.replace(/\/$/, "");
    this.signer = config.signer;
    this.contract = new ethers.Contract(config.contractAddress, config.abi as ethers.InterfaceAbi, config.signer);
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? 10_000;
  }

  private get fetchOpts(): RequestInit {
    return { signal: AbortSignal.timeout(this.fetchTimeoutMs) };
  }

  // ─── Read (via Indexer) ─────────────────────────────────────────────────────

  /** List tasks from the indexer with optional filters */
  async getTasks(filters: TaskFilters = {}): Promise<{ total: number; tasks: Task[] }> {
    const params = new URLSearchParams();
    if (filters.status)    params.set("status",     filters.status);
    if (filters.poster)    params.set("poster",     filters.poster);
    if (filters.limit)     params.set("limit",      String(filters.limit));
    if (filters.offset)    params.set("offset",     String(filters.offset));
    if (filters.sort)      params.set("sort",       filters.sort);
    if (filters.minReward) params.set("min_reward", filters.minReward);

    const res = await fetch(`${this.indexerUrl}/tasks?${params}`, this.fetchOpts);
    if (!res.ok) throw new Error(`getTasks failed: ${res.statusText}`);
    return res.json();
  }

  /** Get detailed info for a single task */
  async getTask(taskId: number): Promise<TaskDetail> {
    const res = await fetch(`${this.indexerUrl}/tasks/${taskId}`, this.fetchOpts);
    if (!res.ok) throw new Error(`Task ${taskId} not found`);
    return res.json();
  }

  /** Get tasks assigned to this agent */
  async getMyAssignedTasks(): Promise<Task[]> {
    const address = await this.signer.getAddress();
    const res = await fetch(`${this.indexerUrl}/agents/${address}/tasks?status=assigned`, this.fetchOpts);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tasks;
  }

  /** Get all tasks this agent has applied for */
  async getMyApplications(): Promise<Task[]> {
    const address = await this.signer.getAddress();
    const res = await fetch(`${this.indexerUrl}/agents/${address}/tasks?status=applied`, this.fetchOpts);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tasks;
  }

  /** Get my agent profile and reputation (Indexer first, fallback to chain) */
  async getMyProfile(): Promise<AgentProfile | null> {
    const address = await this.signer.getAddress();
    // Try indexer first
    try {
      const res = await fetch(`${this.indexerUrl}/agents/${address}`, this.fetchOpts);
      if (res.ok) {
        const data = await res.json();
        if (data && data.agentId) return data;
      }
    } catch { /* indexer unavailable — fall through */ }
    // Fallback: read directly from contract
    try {
      const info = await this.contract.agents(address);
      if (!info.registered) return null;
      const rep = await this.contract.getAgentReputation(address);
      return {
        wallet: address,
        agentId: info.agentId,
        metadata: info.metadata,
        tasksCompleted: Number(rep.completed),
        tasksAttempted: Number(rep.attempted),
        totalScore: Number(info.totalScore),
        avgScore: Number(rep.avgScore),
        winRate: Number(rep.winRate),
        registeredAt: 0,
        recentTasks: [],
      };
    } catch {
      return null;
    }
  }

  /** Get leaderboard (gracefully returns empty if Indexer is down) */
  async getLeaderboard(limit = 10): Promise<AgentSummary[]> {
    try {
      const res = await fetch(`${this.indexerUrl}/leaderboard?limit=${limit}`, this.fetchOpts);
      if (res.ok) {
        const data = await res.json();
        return data.agents;
      }
    } catch { /* indexer down */ }
    return [];
  }

  /**
   * Get all agent wallet addresses owned by a master wallet.
   * Use this in Web Dashboard: user connects MetaMask → getMyAgents(address) → show all agents.
   */
  async getMyAgents(ownerAddress: string): Promise<string[]> {
    const result = await this.contract.getMyAgents(ownerAddress);
    return result as string[];
  }

  /**
   * Get full agent info including owner address.
   */
  async getAgentInfo(walletAddress: string): Promise<{
    agentWallet: string;
    agentOwner: string;
    agentId: string;
    metadata: string;
    registered: boolean;
  }> {
    const [agentWallet, agentOwner, agentId, metadata, registered] =
      await this.contract.getAgentInfo(walletAddress);
    return { agentWallet, agentOwner, agentId, metadata, registered };
  }

  /** Platform-wide stats (Indexer first, fallback to chain) */
  async getStats() {
    try {
      const res = await fetch(`${this.indexerUrl}/stats`, this.fetchOpts);
      if (res.ok) return res.json();
    } catch { /* indexer down — fallback */ }
    // Fallback: read basic stats from contract
    try {
      const [taskCount, agentCount] = await Promise.all([
        this.contract.taskCount(),
        this.contract.getAgentCount(),
      ]);
      return {
        totalTasks: Number(taskCount),
        openTasks: 0,
        completedTasks: 0,
        totalAgents: Number(agentCount),
        totalRewardPaid: "0",
        avgScore: 0,
      };
    } catch {
      return { totalTasks: 0, openTasks: 0, completedTasks: 0, totalAgents: 0, totalRewardPaid: "0", avgScore: 0 };
    }
  }

  // ─── Write (direct to chain) ────────────────────────────────────────────────

  /** Register this wallet as an Agent */
  async registerAgent(
    agentId: string,
    metadata: Record<string, unknown> = {},
    ownerAddress: string = ethers.ZeroAddress,
  ): Promise<string> {
    const tx = await this.contract.registerAgent(agentId, JSON.stringify(metadata), ownerAddress);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Apply for an open task */
  async applyForTask(taskId: number): Promise<string> {
    const tx = await this.contract.applyForTask(taskId);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Submit result for an assigned task.
   * resultHash: IPFS CID or any content identifier.
   * resultPreview: stored in indexer for human readability.
   */
  async submitResult(taskId: number, options: SubmitOptions): Promise<string> {
    const tx = await this.contract.submitResult(taskId, options.resultHash);
    const receipt = await tx.wait();

    // Also tell indexer the human-readable preview
    if (options.resultPreview) {
      await fetch(`${this.indexerUrl}/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedTx: null, resultPreview: options.resultPreview }),
      }).catch(() => {}); // non-critical
    }

    return receipt.hash;
  }

  /** Trigger force refund after judge timeout (anyone can call) */
  async forceRefund(taskId: number): Promise<string> {
    const tx = await this.contract.forceRefund(taskId);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Get raw contract instance for advanced usage */
  getContract(): ethers.Contract {
    return this.contract;
  }

  /** Get signer address */
  async getAddress(): Promise<string> {
    return this.signer.getAddress();
  }
}
