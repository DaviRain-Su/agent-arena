// sdk/src/AgentLoop.ts
// High-level autonomous agent loop — evaluates tasks, applies, executes, submits

import type { ArenaClient } from "./ArenaClient.js";
import type { Task } from "./types.js";

export interface AgentLoopConfig {
  /** Called to decide if the agent can/should do this task. Return confidence 0-1. */
  evaluate: (task: Task) => Promise<number>;
  /** Called to actually execute the task. Return result hash + preview. */
  execute: (task: Task) => Promise<{ resultHash: string; resultPreview: string }>;
  /** Minimum confidence to apply for a task (default: 0.7) */
  minConfidence?: number;
  /** Poll interval in ms (default: 30_000) */
  pollInterval?: number;
  /** Max concurrent tasks to hold (default: 3) */
  maxConcurrent?: number;
  /** Logger (default: console) */
  log?: (msg: string) => void;
}

export class AgentLoop {
  private client: ArenaClient;
  private cfg: Required<AgentLoopConfig>;
  private running = false;
  /** Tasks that failed execution — don't retry them */
  private failedTaskIds = new Set<number>();
  /** Tasks waiting for external execution result */
  private pendingExternalTasks = new Map<number, Task>();

  constructor(client: ArenaClient, config: AgentLoopConfig) {
    this.client = client;
    this.cfg = {
      minConfidence: 0.7,
      pollInterval: 30_000,
      maxConcurrent: 3,
      log: (msg) => console.log(`[agent] ${msg}`),
      ...config,
    };
  }

  /** Mark a task as completed externally (for --exec=false mode) */
  completeTaskExternally(taskId: number, result: { resultHash: string; resultPreview: string }) {
    this.pendingExternalTasks.delete(taskId);
    return this.client.submitResult(taskId, result);
  }

  /** Start the autonomous loop */
  async start(): Promise<void> {
    this.running = true;
    const address = await this.client.getAddress();
    this.cfg.log(`Starting agent loop for ${address}`);

    while (this.running) {
      try {
        await this.tick();
      } catch (e: unknown) {
        this.cfg.log(`Tick error: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(this.cfg.pollInterval);
    }
  }

  stop() { this.running = false; }

  private async tick() {
    // 1. Execute any assigned tasks first (highest priority)
    await this.processAssigned();

    // 2. Look for new open tasks to apply for
    await this.discoverAndApply();
  }

  private async processAssigned() {
    const assigned = await this.client.getMyAssignedTasks();
    this.cfg.log(`Assigned tasks: ${assigned.length}`);

    for (const task of assigned) {
      // Skip tasks that already failed execution
      if (this.failedTaskIds.has(task.id)) {
        this.cfg.log(`Skipping task #${task.id}: execution previously failed`);
        continue;
      }

      // Skip tasks waiting for external execution
      if (this.pendingExternalTasks.has(task.id)) {
        this.cfg.log(`Task #${task.id}: waiting for external execution`);
        continue;
      }

      this.cfg.log(`Executing task #${task.id}: ${task.description.slice(0, 60)}...`);
      try {
        const result = await this.cfg.execute(task);
        const txHash = await this.client.submitResult(task.id, result);
        this.cfg.log(`Submitted task #${task.id} → tx ${txHash.slice(0, 18)}...`);
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        this.cfg.log(`Execution failed for #${task.id}: ${errorMsg}`);

        // Check if this is an "executor not configured" error
        // In that case, mark as pending external execution instead of failed
        if (errorMsg.includes("[EXECUTOR_NOT_CONFIGURED]") || errorMsg.includes("--exec")) {
          this.pendingExternalTasks.set(task.id, task);
          this.cfg.log(`Task #${task.id} marked for external execution — provide result manually or use --exec`);
        } else {
          // Real execution failure — don't retry
          this.failedTaskIds.add(task.id);
        }
      }
    }
  }

  private async discoverAndApply() {
    // Don't apply if already at concurrent limit
    const assigned = await this.client.getMyAssignedTasks();
    if (assigned.length >= this.cfg.maxConcurrent) {
      this.cfg.log(`At max concurrent tasks (${this.cfg.maxConcurrent}), skipping discovery`);
      return;
    }

    const applied = await this.client.getMyApplications();
    const appliedIds = new Set(applied.map(t => t.id));

    const { tasks } = await this.client.getTasks({
      status: "open",
      sort: "reward_desc",
      limit: 10,
    });

    for (const task of tasks) {
      if (appliedIds.has(task.id)) continue; // already applied

      const confidence = await this.cfg.evaluate(task);
      if (confidence >= this.cfg.minConfidence) {
        try {
          const txHash = await this.client.applyForTask(task.id);
          this.cfg.log(`Applied for task #${task.id} (confidence=${confidence.toFixed(2)}) → ${txHash.slice(0, 18)}...`);
        } catch (e: unknown) {
          this.cfg.log(`Apply failed for #${task.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        this.cfg.log(`Skipped task #${task.id} (confidence=${confidence.toFixed(2)} < ${this.cfg.minConfidence})`);
      }
    }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
