// 本地类型定义（不从 shared-orchestrator 导入）

export type AgentId = string;
export type StepId = string;
export type TaskId = string;

export interface Agent {
  id: AgentId;
  name: string;
  level: AgentLevel;
  description: string;
  inputs: string[];
  outputs: string[];
}

export type AgentLevel = "atomic" | "composite" | "specialized";

export interface WorkflowStep {
  id: StepId;
  agentId: AgentId;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  dependsOn: StepId[];
  humanApproval?: boolean;
  timeout?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  executionMode: ExecutionMode;
}

export type ExecutionMode = "sequential" | "parallel" | "conditional";

export type TaskStatus = 
  | "created"
  | "pending_confirmation"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface StepResult {
  stepId: StepId;
  status: "success" | "failed" | "pending" | "skipped";
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface Task {
  id: TaskId;
  workflowId: string;
  status: TaskStatus;
  currentStepIndex: number;
  stepResults: StepResult[];
  totalSteps: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface ConfirmationRequest {
  id: string;
  taskId: TaskId;
  stepId: StepId;
  title: string;
  description: string;
  details: Record<string, unknown>;
  timeoutAt: Date;
  status: "pending" | "confirmed" | "rejected" | "timeout";
}

export interface Payment {
  id: string;
  taskId: TaskId;
  amount: string;
  token: string;
  status: PaymentStatus;
  breakdown: PaymentBreakdown;
}

export type PaymentStatus = "pending" | "held" | "released" | "refunded" | "failed";

export interface PaymentBreakdown {
  baseFee: string;
  executionFee: string;
  agentFees: Record<AgentId, string>;
}

export interface WorkflowResult {
  success: boolean;
  taskId: TaskId;
  stepResults: StepResult[];
  error?: string;
}

export interface ExecutionContext {
  taskId: TaskId;
  workflowId: string;
  stepIndex: number;
  inputs: Record<string, unknown>;
  results: Record<StepId, StepResult>;
}

export class OrchestratorError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

// Extend Window for Web3
interface Window {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  };
}
