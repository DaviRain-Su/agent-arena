// src/types.ts

export interface Env {
  DB: D1Database;
  CONTRACT_ADDRESS: string;
  XLAYER_RPC: string;
  XLAYER_RPC_FALLBACK?: string;
  SYNC_BATCH_SIZE?: string;
}

export type TaskStatus = "open" | "in_progress" | "completed" | "refunded" | "disputed";

export interface Task {
  id: number;
  poster: string;
  description: string;
  evaluationCID: string;
  reward: string;        // human-readable OKB
  rewardWei: string;
  deadline: number;
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

export interface AgentRow {
  wallet: string;
  agent_id: string;
  metadata: string | null;
  tasks_completed: number;
  tasks_attempted: number;
  total_score: number;
  registered_at: number;
}

export interface TaskFilters {
  status: string;
  poster?: string;
  limit: number;
  offset: number;
  sort: string;
  minReward?: string;
}
