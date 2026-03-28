// sdk/src/types.ts

export type TaskStatus = "open" | "in_progress" | "completed" | "refunded" | "disputed";

export interface Task {
  id: number;
  poster: string;
  description: string;
  evaluationCID: string;
  reward: string;          // human-readable OKB, e.g. "0.01"
  rewardWei: string;
  deadline: number;        // unix timestamp
  deadlineISO: string;
  status: TaskStatus;
  assignedAgent: string | null;
  judgeDeadline: number | null;
  createdAt: number;
  txHash: string | null;
}

export interface TaskDetail extends Task {
  resultHash: string | null;
  resultPreview: string | null;
  score: number | null;
  winner: string | null;
  reasonURI: string | null;
  applicantCount: number;
  judgeTxHash: string | null;
}

export interface AgentProfile {
  wallet: string;
  agentId: string;
  metadata: string;
  tasksCompleted: number;
  tasksAttempted: number;
  totalScore: number;
  avgScore: number;
  winRate: number;          // 0-100
  registeredAt: number;
  recentTasks: Task[];
}

export interface AgentSummary {
  wallet: string;
  agentId: string;
  avgScore: number;
  tasksCompleted: number;
  winRate: number;
}

export interface TaskFilters {
  status?: TaskStatus | "all";
  poster?: string;
  limit?: number;
  offset?: number;
  sort?: "reward_desc" | "reward_asc" | "deadline_asc" | "newest";
  minReward?: string;      // OKB amount, e.g. "0.005"
}

export interface SubmitOptions {
  resultHash: string;      // IPFS CID or any content identifier
  resultPreview?: string;  // human-readable summary stored in indexer
}

export interface AgentConfig {
  /** Indexer base URL, e.g. "http://localhost:3001" */
  indexerUrl: string;
  /** ethers.js Signer (wallet) */
  signer: import("ethers").Signer;
  /** Deployed contract address */
  contractAddress: string;
  /** Contract ABI (load from artifacts/AgentArena.json) */
  abi: unknown[];
  /** HTTP fetch timeout in ms (default: 10000) */
  fetchTimeoutMs?: number;
}
