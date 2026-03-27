const DEFAULT_WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL || "https://agentx-worker.davirain-yin.workers.dev";

function normalizeWorkerBase(workerBase?: string): string {
  const base = (workerBase || DEFAULT_WORKER_URL).trim();
  return base.replace(/\/+$/, "");
}

async function requestJson<T>(path: string, init?: RequestInit, workerBase?: string): Promise<T> {
  const response = await fetch(`${normalizeWorkerBase(workerBase)}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: string })?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export interface WorkerAgentEntry {
  address: string;
  fee?: string;
  capabilities?: string[];
}

export interface WorkerHealth {
  status: string;
  version: string;
  gateway: string;
}

export interface A2AStatusResponse {
  status?: string;
  result?: {
    status?: string;
    currentPrice?: number;
    priceSource?: string;
    action?: "BUY" | "SELL" | "HOLD";
    payments?: Array<{
      step: string;
      from?: string;
      to?: string;
      amount: string;
      txHash?: string;
      blockNumber?: number;
      explorerUrl?: string;
    }>;
    totalSpent?: string;
    refunded?: string;
  };
}

export interface A2ASimulateResponse {
  status: "simulated";
  symbol: string;
  currentPrice: number;
  action: "BUY" | "HOLD";
  simulatedPayments: Array<{ step: string; amount: string }>;
}

export interface DeploySessionResponse {
  sessionId: string;
}

export interface NodeKeyResponse {
  apiKey: string;
  nodeId: string;
  name: string;
}

export interface ActiveNode {
  nodeId: string;
  endpoint: string;
  name: string;
  model: string;
  capabilities: string[];
  address?: string;
  fee?: string;
  feeToken?: string;
  builtin?: boolean;
  lastSeen: number;
}

export interface HirePaymentRequired {
  status: 402;
  required: true;
  agentName: string;
  payment: { amount: string; token: string; to: string; network: string; chainId: number };
  message: string;
}

export interface HireSuccess {
  status: 200;
  hired: true;
  agentName: string;
  txHash: string;
  address: string;
  hiredUntil: number;
  message: string;
}

export const workerApi = {
  getHealth(workerBase?: string) {
    return requestJson<WorkerHealth>("/health", undefined, workerBase);
  },

  getAgents(workerBase?: string) {
    return requestJson<Record<string, WorkerAgentEntry>>("/api/agents", undefined, workerBase);
  },

  getA2AStatus(jobId: string, workerBase?: string) {
    return requestJson<A2AStatusResponse>(`/api/a2a/${jobId}`, undefined, workerBase);
  },

  startA2A(
    payload: { symbol: string; budget: number; callerAddress: string; type?: string; threshold?: number },
    workerBase?: string
  ) {
    return requestJson<{ jobId?: string }>(
      "/api/a2a",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      workerBase
    );
  },

  /** Execute A2A with real axUSDC payments (user must have approved orchestrator first) */
  executeA2A(
    payload: { symbol: string; budget: string; callerAddress: string; type?: string; threshold?: number },
    workerBase?: string
  ) {
    return requestJson<{
      status: string;
      symbol?: string;
      currentPrice?: number;
      priceSource?: string;
      action?: string;
      conditionMet?: boolean;
      totalSpent?: string;
      refunded?: string;
      payments?: Array<{
        step: string;
        from: string;
        to: string;
        amount: string;
        txHash: string;
        blockNumber: number;
        explorerUrl: string;
      }>;
      error?: string;
    }>(
      "/api/a2a/execute",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      workerBase
    );
  },

  simulateA2A(
    payload: { symbol: string; budget: number; type?: string; threshold?: number },
    workerBase?: string
  ) {
    return requestJson<A2ASimulateResponse>(
      "/api/a2a/simulate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      workerBase
    );
  },

  deploySession(payload: { template: string; config?: Record<string, unknown> }, workerBase?: string) {
    return requestJson<DeploySessionResponse>(
      "/api/deploy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      workerBase
    );
  },

  chat(sessionId: string, message: string, workerBase?: string) {
    return requestJson<{ response: string }>(
      `/agent/chat/${sessionId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      },
      workerBase
    );
  },

  generateNodeKey(name: string, workerBase?: string) {
    return requestJson<NodeKeyResponse>(
      "/api/nodes/generate-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
      workerBase
    );
  },

  getActiveNodes(workerBase?: string) {
    return requestJson<ActiveNode[]>("/api/nodes/active", undefined, workerBase);
  },

  async hireAgent(
    agentName: string,
    txHash?: string,
    workerBase?: string
  ): Promise<HirePaymentRequired | HireSuccess> {
    const base = normalizeWorkerBase(workerBase);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (txHash) headers["X-Payment-Proof"] = txHash;
    const res = await fetch(`${base}/api/hire`, {
      method: "POST",
      headers,
      body: JSON.stringify({ agentName }),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status as 402 | 200, ...data } as HirePaymentRequired | HireSuccess;
  },

  confirmTask(taskId: string, approved: boolean, workerBase?: string) {
    return requestJson<{ status?: string }>(
      `/tasks/${taskId}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      },
      workerBase
    );
  },
};
