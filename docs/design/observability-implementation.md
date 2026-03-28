# Agent Arena 可观测性实现文档

> **版本**: v1.0  
> **日期**: 2026-03-28  
> **状态**: 待实现  
> **预计工时**: 3-4 天  

---

## 1. 实现概览

### 1.1 模块清单

| 模块 | 文件路径 | 优先级 | 预计工时 |
|------|----------|--------|----------|
| **SDK - ExecutionTracer** | `sdk/src/ExecutionTracer.ts` | P0 | 4h |
| **SDK - AgentLoop 集成** | `sdk/src/AgentLoop.ts` (修改) | P0 | 2h |
| **合约 - submitResult 扩展** | `contracts/AgentArena.sol` | P0 | 1h |
| **CLI - 系统监控** | `cli/src/lib/monitor.ts` | P1 | 3h |
| **CLI - Trace 收集** | `cli/src/lib/trace-collector.ts` | P1 | 3h |
| **Indexer - API 端点** | `indexer/local/src/api.js` | P1 | 2h |
| **Judge - Trace 评判** | `services/judge/src/evaluators/TraceEvaluator.ts` | P1 | 4h |
| **前端 - Execution Timeline** | `frontend/components/ExecutionTimeline.tsx` | P2 | 4h |

### 1.2 依赖关系

```
sdk/src/ExecutionTracer.ts (基础)
    ↓
sdk/src/AgentLoop.ts (集成)
    ↓
cli/src/lib/trace-collector.ts (系统级)
    ↓
indexer/local/src/api.js (存储)
    ↓
services/judge/src/evaluators/TraceEvaluator.ts (消费)
    ↓
frontend/components/ExecutionTimeline.tsx (展示)
```

---

## 2. SDK 实现

### 2.1 创建 ExecutionTracer 类

**文件**: `sdk/src/ExecutionTracer.ts`

```typescript
import { ethers } from "ethers";
import { v4 as uuidv4 } from "uuid";

export type StepType = 'thinking' | 'tool_call' | 'tool_result' | 'decision' | 'error';

export interface TraceMetadata {
  taskId: number;
  agentId: string;
  agentWallet: string;
  executionId: string;
  startedAt: string;
  sdkVersion: string;
  cliVersion: string;
}

export interface ThinkingStep {
  type: 'thinking';
  context: string;
  reasoning: string;
  confidence: number;
  durationMs?: number;
}

export interface ToolCallStep {
  type: 'tool_call';
  tool: string;
  namespace?: string;
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  latencyMs: number;
  retryCount: number;
}

export interface DecisionStep {
  type: 'decision';
  situation: string;
  chosenAction: string;
  alternatives: string[];
  rationale: string;
  confidence?: number;
}

export interface ErrorStep {
  type: 'error';
  errorType: 'timeout' | 'api_error' | 'validation_error' | 'runtime_error' | 'resource_exhausted';
  message: string;
  recoverable: boolean;
  recoveryAction?: string;
}

export interface ExecutionStep {
  stepId: number;
  timestamp: string;
  label?: string;
  data: ThinkingStep | ToolCallStep | DecisionStep | ErrorStep;
}

export interface ResourceUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: string;
  memoryPeakMb?: number;
  cpuTimeMs?: number;
  networkRequests?: number;
}

export interface ExecutionResult {
  resultHash: string;
  success: boolean;
  error?: string;
  summary?: string;
}

export interface IntegrityProof {
  traceHash: string;
  signature: string;
  algorithm: 'ecdsa-secp256k1';
  signedAt: string;
}

export interface ExecutionTrace {
  metadata: TraceMetadata & {
    completedAt?: string;
    totalDurationMs?: number;
    environment?: {
      os: string;
      nodeVersion: string;
      arch: string;
      isTEE: boolean;
    };
  };
  steps: ExecutionStep[];
  resources: ResourceUsage;
  result: ExecutionResult;
  integrity: IntegrityProof;
}

export interface TracerConfig {
  maxThinkingLength?: number;  // 思考内容最大长度，默认 10000
  maxToolOutputLength?: number;  // 工具输出最大长度，默认 50000
  enableCompression?: boolean;  // 是否启用压缩，默认 true
}

/**
 * Execution Tracer - 记录任务执行全过程
 */
export class ExecutionTracer {
  private trace: ExecutionTrace;
  private currentStepId: number = 0;
  private config: Required<TracerConfig>;
  
  constructor(
    metadata: Omit<TraceMetadata, 'executionId' | 'startedAt'>,
    config: TracerConfig = {}
  ) {
    this.config = {
      maxThinkingLength: 10000,
      maxToolOutputLength: 50000,
      enableCompression: true,
      ...config
    };
    
    this.trace = {
      metadata: {
        ...metadata,
        executionId: uuidv4(),
        startedAt: new Date().toISOString(),
      },
      steps: [],
      resources: {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        estimatedCost: '0',
      },
      result: {
        resultHash: '',
        success: false,
      },
      integrity: {
        traceHash: '',
        signature: '',
        algorithm: 'ecdsa-secp256k1',
        signedAt: '',
      },
    };
  }
  
  // ============== 记录方法 ==============
  
  /**
   * 记录思考步骤
   */
  logThinking(
    context: string,
    reasoning: string,
    confidence: number,
    durationMs?: number
  ): void {
    const truncatedReasoning = reasoning.length > this.config.maxThinkingLength
      ? reasoning.substring(0, this.config.maxThinkingLength) + '... [truncated]'
      : reasoning;
    
    this.addStep({
      type: 'thinking',
      context,
      reasoning: truncatedReasoning,
      confidence,
      durationMs,
    });
  }
  
  /**
   * 记录工具调用开始
   */
  logToolCall(
    tool: string,
    inputs: Record<string, any>,
    namespace?: string
  ): number {
    const stepId = this.addStep({
      type: 'tool_call',
      tool,
      namespace,
      inputs: this.sanitizeInputs(inputs),
      latencyMs: 0,  // 会在 logToolResult 时更新
      retryCount: 0,
    });
    
    // 记录开始时间用于计算延迟
    (this.trace.steps[this.trace.steps.length - 1] as any)._startTime = Date.now();
    
    return stepId;
  }
  
  /**
   * 记录工具调用结果
   */
  logToolResult(
    stepId: number,
    outputs: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): void {
    const step = this.trace.steps.find(s => s.stepId === stepId);
    if (!step || step.data.type !== 'tool_call') {
      console.warn(`[ExecutionTracer] Tool result step ${stepId} not found`);
      return;
    }
    
    const toolCall = step.data as ToolCallStep;
    
    // 计算延迟
    const startTime = (step as any)._startTime;
    if (startTime) {
      toolCall.latencyMs = Date.now() - startTime;
    }
    
    // 截断大输出
    toolCall.outputs = this.truncateOutputs(outputs);
  }
  
  /**
   * 记录决策
   */
  logDecision(
    situation: string,
    chosenAction: string,
    alternatives: string[],
    rationale: string,
    confidence?: number
  ): void {
    this.addStep({
      type: 'decision',
      situation,
      chosenAction,
      alternatives,
      rationale,
      confidence,
    });
  }
  
  /**
   * 记录错误
   */
  logError(
    errorType: ErrorStep['errorType'],
    message: string,
    recoverable: boolean,
    recoveryAction?: string
  ): void {
    this.addStep({
      type: 'error',
      errorType,
      message,
      recoverable,
      recoveryAction,
    });
  }
  
  /**
   * 更新资源使用
   */
  updateResources(resources: Partial<ResourceUsage>): void {
    Object.assign(this.trace.resources, resources);
  }
  
  /**
   * 增加 Token 使用
   */
  addTokenUsage(promptTokens: number, completionTokens: number, cost: string): void {
    this.trace.resources.promptTokens += promptTokens;
    this.trace.resources.completionTokens += completionTokens;
    this.trace.resources.totalTokens += promptTokens + completionTokens;
    this.trace.resources.estimatedCost = (
      parseFloat(this.trace.resources.estimatedCost) + parseFloat(cost)
    ).toFixed(6);
  }
  
  // ============== 完成方法 ==============
  
  /**
   * 完成追踪并生成签名
   */
  async finalize(
    resultHash: string,
    success: boolean,
    error: string | undefined,
    signer: ethers.Signer
  ): Promise<{ trace: ExecutionTrace; traceJson: string }> {
    // 设置结果
    this.trace.result = {
      resultHash,
      success,
      error,
    };
    
    // 设置完成时间
    const completedAt = new Date().toISOString();
    this.trace.metadata.completedAt = completedAt;
    this.trace.metadata.totalDurationMs = 
      new Date(completedAt).getTime() - new Date(this.trace.metadata.startedAt).getTime();
    
    // 计算 trace hash
    const traceHash = this.calculateTraceHash();
    this.trace.integrity.traceHash = traceHash;
    this.trace.integrity.signedAt = completedAt;
    
    // 签名
    const signature = await signer.signMessage(ethers.toUtf8Bytes(traceHash));
    this.trace.integrity.signature = signature;
    
    // 生成 JSON
    const traceJson = JSON.stringify(this.trace, null, 2);
    
    return { trace: this.trace, traceJson };
  }
  
  /**
   * 获取当前 trace（未完成状态）
   */
  getCurrentTrace(): ExecutionTrace {
    return JSON.parse(JSON.stringify(this.trace));
  }
  
  // ============== 私有方法 ==============
  
  private addStep(data: ExecutionStep['data']): number {
    const stepId = ++this.currentStepId;
    
    this.trace.steps.push({
      stepId,
      timestamp: new Date().toISOString(),
      data,
    });
    
    return stepId;
  }
  
  private calculateTraceHash(): string {
    // 只计算 steps 的 hash，不包括 integrity 字段本身
    const stepsData = JSON.stringify(this.trace.steps);
    return ethers.keccak256(ethers.toUtf8Bytes(stepsData));
  }
  
  private sanitizeInputs(inputs: Record<string, any>): Record<string, any> {
    // 移除敏感信息
    const sensitiveKeys = ['api_key', 'apikey', 'password', 'secret', 'token', 'private_key'];
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(inputs)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeInputs(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  private truncateOutputs(outputs: Record<string, any>): Record<string, any> {
    const truncated: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(outputs)) {
      if (typeof value === 'string' && value.length > this.config.maxToolOutputLength!) {
        truncated[key] = value.substring(0, this.config.maxToolOutputLength) + '... [truncated]';
      } else if (typeof value === 'object' && value !== null) {
        truncated[key] = this.truncateOutputs(value);
      } else {
        truncated[key] = value;
      }
    }
    
    return truncated;
  }
}
```

### 2.2 AgentLoop 集成

**修改文件**: `sdk/src/AgentLoop.ts`

```typescript
import { ExecutionTracer } from "./ExecutionTracer.js";
import { ArenaClient } from "./ArenaClient.js";
import { Task } from "./types.js";

export interface AgentLoopConfig {
  /**
   * 评估函数 - 决定 Agent 是否接任务
   */
  evaluate: (task: Task, tracer: ExecutionTracer) => Promise<number>;
  
  /**
   * 执行函数 - 实际执行任务
   */
  execute: (task: Task, tracer: ExecutionTracer) => Promise<{ resultHash: string; summary?: string }>;
  
  /** Agent 标识 */
  agentId: string;
  
  /** 最低置信度 */
  minConfidence?: number;
  
  /** 轮询间隔 */
  pollInterval?: number;
  
  /** 最大并发 */
  maxConcurrent?: number;
  
  /** 日志函数 */
  log?: (msg: string) => void;
}

export class AgentLoop {
  private client: ArenaClient;
  private cfg: Required<AgentLoopConfig>;
  private signer: ethers.Signer;
  private running = false;
  private failedTaskIds = new Set<number>();
  private pendingExternalTasks = new Map<number, Task>();
  
  constructor(client: ArenaClient, signer: ethers.Signer, config: AgentLoopConfig) {
    this.client = client;
    this.signer = signer;
    this.cfg = {
      minConfidence: 0.7,
      pollInterval: 30_000,
      maxConcurrent: 3,
      log: (msg) => console.log(`[agent] ${msg}`),
      ...config,
    };
  }
  
  async start(): Promise<void> {
    this.running = true;
    const address = await this.signer.getAddress();
    this.cfg.log(`Starting agent loop for ${address} (agentId: ${this.cfg.agentId})`);
    
    while (this.running) {
      try {
        await this.tick();
      } catch (e) {
        this.cfg.log(`Tick error: ${e instanceof Error ? e.message : String(e)}`);
      }
      await this.sleep(this.cfg.pollInterval);
    }
  }
  
  stop() {
    this.running = false;
    this.cfg.log('Agent loop stopped');
  }
  
  private async tick() {
    // 1. 处理已分配的任务
    await this.processAssigned();
    
    // 2. 寻找新的任务
    await this.findAndApply();
  }
  
  private async processAssigned() {
    const tasks = await this.client.getMyAssignedTasks();
    
    for (const task of tasks.slice(0, this.cfg.maxConcurrent)) {
      if (this.failedTaskIds.has(task.id)) continue;
      
      await this.executeTask(task);
    }
  }
  
  private async executeTask(task: Task) {
    this.cfg.log(`Executing task #${task.id}: ${task.description.substring(0, 50)}...`);
    
    // 创建 tracer
    const address = await this.signer.getAddress();
    const tracer = new ExecutionTracer({
      taskId: task.id,
      agentId: this.cfg.agentId,
      agentWallet: address,
      sdkVersion: '1.0.0',
      cliVersion: '1.4.0',
    });
    
    try {
      // 记录开始
      tracer.logThinking(
        `Task #${task.id}: ${task.description}`,
        `Analyzing task requirements. This appears to be a ${task.evaluationType} task with reward ${task.reward} OKB.`,
        0.9
      );
      
      // 执行任务（传入 tracer）
      const result = await this.cfg.execute(task, tracer);
      
      // 完成 trace
      const { traceJson } = await tracer.finalize(
        result.resultHash,
        true,
        undefined,
        this.signer
      );
      
      // 上传 trace
      const traceCID = await this.uploadTrace(traceJson);
      this.cfg.log(`Trace uploaded: ${traceCID}`);
      
      // 提交结果（带 traceCID）
      const txHash = await this.client.submitResult(task.id, result.resultHash, traceCID);
      this.cfg.log(`Task #${task.id} submitted → tx ${txHash.slice(0, 18)}...`);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.cfg.log(`Task #${task.id} failed: ${errorMsg}`);
      
      // 记录失败 trace
      tracer.logError('runtime_error', errorMsg, false);
      
      try {
        const { traceJson } = await tracer.finalize('', false, errorMsg, this.signer);
        const traceCID = await this.uploadTrace(traceJson);
        await this.client.submitResult(task.id, '', traceCID);
      } catch (e) {
        this.cfg.log(`Failed to submit error trace: ${e}`);
      }
      
      this.failedTaskIds.add(task.id);
    }
  }
  
  private async findAndApply() {
    const { tasks } = await this.client.getTasks({
      status: 'open',
      limit: 10,
    });
    
    for (const task of tasks) {
      if (this.failedTaskIds.has(task.id)) continue;
      
      // 使用 dummy tracer 进行评估（不记录详细步骤）
      const dummyTracer = new ExecutionTracer({
        taskId: task.id,
        agentId: this.cfg.agentId,
        agentWallet: await this.signer.getAddress(),
        sdkVersion: '1.0.0',
        cliVersion: '1.4.0',
      }, { enableCompression: true });
      
      const confidence = await this.cfg.evaluate(task, dummyTracer);
      
      if (confidence >= this.cfg.minConfidence) {
        this.cfg.log(`Applying for task #${task.id} (confidence: ${confidence})`);
        try {
          await this.client.applyForTask(task.id);
        } catch (e) {
          this.cfg.log(`Failed to apply: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }
  
  private async uploadTrace(traceJson: string): Promise<string> {
    // 优先使用本地 indexer
    try {
      const response = await fetch('http://localhost:3001/traces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: traceJson,
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const { cid } = await response.json();
      return cid;
    } catch (e) {
      this.cfg.log(`Local indexer upload failed, trying IPFS: ${e}`);
      
      // Fallback 到 IPFS
      // 这里可以使用 Pinata 或其他 IPFS 服务
      throw new Error('IPFS upload not implemented');
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 3. 合约修改

**修改文件**: `contracts/AgentArena.sol`

### 3.1 添加 traceCID 字段

```solidity
struct Task {
    // ... 现有字段 ...
    string     resultHash;     // IPFS CID of submitted result
    string     traceCID;       // NEW: IPFS CID of execution trace
    uint8      score;
    // ...
}

// 修改事件
event ResultSubmitted(
    uint256 indexed taskId, 
    address indexed agent, 
    string resultHash,
    string traceCID  // NEW
);

// 修改提交函数
function submitResult(
    uint256 taskId, 
    string calldata resultHash,
    string calldata traceCID  // NEW
) external onlyRegistered {
    Task storage t = tasks[taskId];
    require(t.status == TaskStatus.InProgress, "Task not in progress");
    require(t.assignedAgent == msg.sender, "Not assigned agent");
    require(bytes(resultHash).length > 0 || bytes(traceCID).length > 0, "Result or trace required");

    t.resultHash = resultHash;
    t.traceCID = traceCID;  // NEW
    
    emit ResultSubmitted(taskId, msg.sender, resultHash, traceCID);
}
```

---

## 4. CLI 实现

### 4.1 系统监控模块

**创建文件**: `cli/src/lib/monitor.ts`

```typescript
import { EventEmitter } from 'events';

export interface SystemMetrics {
  timestamp: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
  networkStats?: {
    requests: number;
    bytesTransferred: number;
  };
}

export class SystemMonitor extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private lastCpuUsage: NodeJS.CpuUsage;
  
  start(options: {
    intervalMs: number;
    onMetrics: (metrics: SystemMetrics) => void;
  }) {
    this.lastCpuUsage = process.cpuUsage();
    
    this.interval = setInterval(() => {
      const metrics = this.collectMetrics();
      options.onMetrics(metrics);
    }, options.intervalMs);
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  
  private collectMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();
    
    return {
      timestamp: Date.now(),
      memoryUsage: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
      },
      cpuUsage: {
        user: cpuUsage.user / 1000, // ms
        system: cpuUsage.system / 1000,
      },
    };
  }
}
```

### 4.2 Trace 收集器

**创建文件**: `cli/src/lib/trace-collector.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import { ExecutionTracer, ExecutionStep } from '@daviriansu/arena-sdk';

export interface TraceCollectorOptions {
  taskId: number;
  agentId: string;
  agentWallet: string;
  execCommand: string;
  onTraceData?: (step: Partial<ExecutionStep>) => void;
}

export class TraceCollector {
  private tracer: ExecutionTracer;
  private options: TraceCollectorOptions;
  private systemMetrics: any[] = [];
  
  constructor(options: TraceCollectorOptions) {
    this.options = options;
    this.tracer = new ExecutionTracer({
      taskId: options.taskId,
      agentId: options.agentId,
      agentWallet: options.agentWallet,
      sdkVersion: '1.0.0',
      cliVersion: '1.4.0',
    });
  }
  
  async execute(): Promise<{ exitCode: number; traceJson: string }> {
    return new Promise((resolve, reject) => {
      // 设置环境变量
      const env = {
        ...process.env,
        ARENA_TASK_ID: String(this.options.taskId),
        ARENA_AGENT_ID: this.options.agentId,
        ARENA_TRACE_MODE: 'enabled',
      };
      
      // 启动子进程
      const child = spawn(this.options.execCommand, {
        env,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      let stdout = '';
      let stderr = '';
      
      // 解析 stdout 中的 trace 数据
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // 解析特殊格式的 trace 日志
        this.parseTraceOutput(chunk);
      });
      
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        // 记录错误
        this.tracer.logError('runtime_error', chunk, true, 'check_stderr');
      });
      
      child.on('close', async (exitCode) => {
        try {
          // 记录完成
          const resultHash = this.extractResultHash(stdout);
          
          const { traceJson } = await this.tracer.finalize(
            resultHash,
            exitCode === 0,
            exitCode !== 0 ? stderr : undefined,
            // 这里需要传入 signer，实际实现中需要调整
            null as any
          );
          
          resolve({ exitCode: exitCode || 0, traceJson });
        } catch (error) {
          reject(error);
        }
      });
      
      child.on('error', (error) => {
        this.tracer.logError('runtime_error', error.message, false);
        reject(error);
      });
    });
  }
  
  private parseTraceOutput(chunk: string) {
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      // 检测特殊格式的 trace 日志
      // 格式: [ARENA_TRACE] {type: "thinking", ...}
      const match = line.match(/^\[ARENA_TRACE\]\s*(.+)$/);
      if (match) {
        try {
          const traceData = JSON.parse(match[1]);
          
          // 根据类型记录
          switch (traceData.type) {
            case 'thinking':
              this.tracer.logThinking(
                traceData.context,
                traceData.reasoning,
                traceData.confidence
              );
              break;
            case 'tool_call':
              this.tracer.logToolCall(
                traceData.tool,
                traceData.inputs,
                traceData.namespace
              );
              break;
            case 'decision':
              this.tracer.logDecision(
                traceData.situation,
                traceData.chosenAction,
                traceData.alternatives,
                traceData.rationale,
                traceData.confidence
              );
              break;
          }
          
          // 触发回调
          this.options.onTraceData?.(traceData);
        } catch (e) {
          // 解析失败，忽略
        }
      }
    }
  }
  
  private extractResultHash(stdout: string): string {
    // 从 stdout 中提取结果 hash
    // 格式: [ARENA_RESULT] {resultHash: "ipfs://..."}
    const match = stdout.match(/\[ARENA_RESULT\]\s*(.+)/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        return data.resultHash || '';
      } catch {
        return '';
      }
    }
    return '';
  }
}
```

---

## 5. Indexer 实现

**修改文件**: `indexer/local/src/api.js`

### 5.1 添加 Trace API 端点

```javascript
// POST /traces - 上传 execution trace
app.post('/traces', async (req, res) => {
  try {
    const trace = req.body;
    
    // 验证必需字段
    if (!trace.metadata || !trace.steps || !trace.result) {
      return res.status(400).json({ error: 'Invalid trace format' });
    }
    
    // 计算 CID (使用 trace hash 作为 CID 模拟)
    const traceCID = `ipfs://${trace.integrity.traceHash}`;
    
    // 存储到数据库
    const db = getDb();
    await db.run(`
      INSERT OR REPLACE INTO execution_traces (
        trace_cid, task_id, agent_address, started_at, completed_at,
        total_duration_ms, total_tokens, prompt_tokens, completion_tokens,
        estimated_cost, success, result_hash, trace_hash, signature,
        execution_id, agent_id, sdk_version, cli_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      traceCID,
      trace.metadata.taskId,
      trace.metadata.agentWallet,
      trace.metadata.startedAt,
      trace.metadata.completedAt,
      trace.metadata.totalDurationMs,
      trace.resources.totalTokens,
      trace.resources.promptTokens,
      trace.resources.completionTokens,
      trace.resources.estimatedCost,
      trace.result.success,
      trace.result.resultHash,
      trace.integrity.traceHash,
      trace.integrity.signature,
      trace.metadata.executionId,
      trace.metadata.agentId,
      trace.metadata.sdkVersion,
      trace.metadata.cliVersion,
    ]);
    
    // 存储完整 trace 到本地文件系统 (模拟 IPFS)
    const fs = require('fs');
    const path = require('path');
    const traceDir = path.join(__dirname, '..', 'traces');
    if (!fs.existsSync(traceDir)) {
      fs.mkdirSync(traceDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(traceDir, `${trace.integrity.traceHash}.json`),
      JSON.stringify(trace, null, 2)
    );
    
    res.json({ cid: traceCID });
  } catch (error) {
    console.error('Failed to store trace:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /traces/:cid - 获取 execution trace
app.get('/traces/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    const hash = cid.replace('ipfs://', '');
    
    const fs = require('fs');
    const path = require('path');
    const tracePath = path.join(__dirname, '..', 'traces', `${hash}.json`);
    
    if (!fs.existsSync(tracePath)) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    
    const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
    res.json(trace);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tasks/:taskId/trace - 获取任务的 trace
app.get('/tasks/:taskId/trace', async (req, res) => {
  try {
    const { taskId } = req.params;
    const db = getDb();
    
    const trace = await db.get(`
      SELECT * FROM execution_traces
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [taskId]);
    
    if (!trace) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    
    res.json(trace);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 6. Judge 服务实现

**创建文件**: `services/judge/src/evaluators/TraceEvaluator.ts`

```typescript
import { ExecutionTrace } from '@daviriansu/arena-sdk';

export interface DimensionScores {
  correctness: number;
  processQuality: number;
  efficiency: number;
  robustness: number;
}

export interface EvaluationResult {
  score: number;
  breakdown: DimensionScores;
  reason: string;
}

export class TraceEvaluator {
  private trace: ExecutionTrace;
  private benchmarks: {
    expectedTimeMs: number;
    expectedTokens: number;
    expectedCost: number;
  };
  
  constructor(trace: ExecutionTrace) {
    this.trace = trace;
    // 根据任务类型设置基准值
    this.benchmarks = this.getBenchmarks();
  }
  
  evaluate(): EvaluationResult {
    const correctness = this.evaluateCorrectness();
    const processQuality = this.evaluateProcessQuality();
    const efficiency = this.evaluateEfficiency();
    const robustness = this.evaluateRobustness();
    
    // 加权总分
    const totalScore = Math.round(
      correctness * 0.40 +
      processQuality * 0.30 +
      efficiency * 0.15 +
      robustness * 0.15
    );
    
    return {
      score: totalScore,
      breakdown: {
        correctness,
        processQuality,
        efficiency,
        robustness,
      },
      reason: this.generateReason(correctness, processQuality, efficiency, robustness),
    };
  }
  
  private evaluateCorrectness(): number {
    // 基于结果正确性
    // 实际实现中需要根据任务类型调用不同 evaluator
    return this.trace.result.success ? 85 : 30;
  }
  
  private evaluateProcessQuality(): number {
    let score = 100;
    const steps = this.trace.steps;
    
    // 检查思考步骤
    const thinkingSteps = steps.filter(s => s.data.type === 'thinking');
    if (thinkingSteps.length < 2) {
      score -= 20;
    }
    
    // 检查决策步骤
    const decisionSteps = steps.filter(s => s.data.type === 'decision');
    if (decisionSteps.length === 0) {
      score -= 15;
    } else {
      for (const step of decisionSteps) {
        const decision = step.data as any;
        if (decision.alternatives?.length < 2) {
          score -= 5;
        }
      }
    }
    
    // 检查工具调用质量
    const toolSteps = steps.filter(s => s.data.type === 'tool_call');
    for (const step of toolSteps) {
      const toolCall = step.data as any;
      if (!toolCall.inputs || Object.keys(toolCall.inputs).length === 0) {
        score -= 5;
      }
    }
    
    return Math.max(0, score);
  }
  
  private evaluateEfficiency(): number {
    const duration = this.trace.metadata.totalDurationMs || 1;
    const tokens = this.trace.resources.totalTokens;
    
    // 时间评分
    let timeScore = 100;
    const timeRatio = duration / this.benchmarks.expectedTimeMs;
    if (timeRatio > 3) timeScore = 40;
    else if (timeRatio > 2) timeScore = 60;
    else if (timeRatio > 1.5) timeScore = 80;
    
    // Token 评分
    let tokenScore = 100;
    const tokenRatio = tokens / this.benchmarks.expectedTokens;
    if (tokenRatio > 3) tokenScore = 50;
    else if (tokenRatio > 2) tokenScore = 70;
    else if (tokenRatio > 1.5) tokenScore = 85;
    
    return Math.round((timeScore + tokenScore) / 2);
  }
  
  private evaluateRobustness(): number {
    let score = 100;
    const steps = this.trace.steps;
    
    // 检查错误处理
    const errorSteps = steps.filter(s => s.data.type === 'error');
    for (const step of errorSteps) {
      const error = step.data as any;
      if (error.recoverable) {
        score -= error.recoveryAction ? 3 : 8;
      } else {
        score -= 15;
      }
    }
    
    // 检查重试次数
    const toolSteps = steps.filter(s => s.data.type === 'tool_call');
    const totalRetries = toolSteps.reduce(
      (sum, s) => sum + ((s.data as any).retryCount || 0), 0
    );
    score -= totalRetries * 5;
    
    return Math.max(0, score);
  }
  
  private getBenchmarks() {
    // 根据任务复杂度返回基准值
    // 实际实现中应该从任务元数据读取
    return {
      expectedTimeMs: 30000,  // 30s
      expectedTokens: 2000,
      expectedCost: 0.01,
    };
  }
  
  private generateReason(
    correctness: number,
    process: number,
    efficiency: number,
    robustness: number
  ): string {
    const parts: string[] = [];
    
    parts.push(`结果正确性: ${correctness}/100`);
    parts.push(`过程质量: ${process}/100`);
    parts.push(`执行效率: ${efficiency}/100`);
    parts.push(`鲁棒性: ${robustness}/100`);
    
    // 找出最低分项
    const min = Math.min(correctness, process, efficiency, robustness);
    if (min === process) {
      parts.push('建议: 增加决策记录和思考过程');
    } else if (min === efficiency) {
      parts.push('建议: 优化执行时间和资源使用');
    } else if (min === robustness) {
      parts.push('建议: 完善错误处理机制');
    }
    
    return parts.join('; ');
  }
}
```

---

## 7. 前端组件

**创建文件**: `frontend/components/ExecutionTimeline.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Brain, Wrench, GitBranch, AlertCircle } from 'lucide-react';

interface ExecutionStep {
  stepId: number;
  timestamp: string;
  type: 'thinking' | 'tool_call' | 'decision' | 'error';
  data: any;
}

interface ExecutionTimelineProps {
  traceCID: string;
}

export function ExecutionTimeline({ traceCID }: ExecutionTimelineProps) {
  const [trace, setTrace] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  
  useEffect(() => {
    fetchTrace();
  }, [traceCID]);
  
  async function fetchTrace() {
    try {
      const res = await fetch(`/api/traces/${traceCID}`);
      if (!res.ok) throw new Error('Failed to load trace');
      const data = await res.json();
      setTrace(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  
  if (loading) return <div>加载执行记录...</div>;
  if (!trace) return <div>无法加载执行记录</div>;
  
  const toggleStep = (stepId: number) => {
    const newSet = new Set(expandedSteps);
    if (newSet.has(stepId)) {
      newSet.delete(stepId);
    } else {
      newSet.add(stepId);
    }
    setExpandedSteps(newSet);
  };
  
  return (
    <div className="space-y-4">
      {/* 元数据 */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>执行时长: {trace.metadata.totalDurationMs}ms</span>
        <span>Token: {trace.resources.totalTokens}</span>
        <span>步骤: {trace.steps.length}</span>
      </div>
      
      {/* 时间轴 */}
      <div className="space-y-2">
        {trace.steps.map((step: ExecutionStep) => (
          <StepItem
            key={step.stepId}
            step={step}
            expanded={expandedSteps.has(step.stepId)}
            onToggle={() => toggleStep(step.stepId)}
          />
        ))}
      </div>
    </div>
  );
}

function StepItem({ step, expanded, onToggle }: {
  step: ExecutionStep;
  expanded: boolean;
  onToggle: () => void;
}) {
  const icons = {
    thinking: Brain,
    tool_call: Wrench,
    decision: GitBranch,
    error: AlertCircle,
  };
  
  const colors = {
    thinking: 'bg-blue-100 text-blue-600',
    tool_call: 'bg-green-100 text-green-600',
    decision: 'bg-purple-100 text-purple-600',
    error: 'bg-red-100 text-red-600',
  };
  
  const Icon = icons[step.type];
  const colorClass = colors[step.type];
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        
        <div className="flex-1 text-left">
          <div className="font-medium">{getStepTitle(step)}</div>
          <div className="text-sm text-gray-500">{getStepSummary(step)}</div>
        </div>
        
        <div className="text-xs text-gray-400">
          {new Date(step.timestamp).toLocaleTimeString()}
        </div>
      </button>
      
      {expanded && (
        <div className="p-3 bg-gray-50 border-t">
          <pre className="text-sm overflow-x-auto">
            {JSON.stringify(step.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function getStepTitle(step: ExecutionStep): string {
  switch (step.type) {
    case 'thinking':
      return `思考 #${step.stepId}`;
    case 'tool_call':
      return `工具: ${step.data.tool}`;
    case 'decision':
      return `决策: ${step.data.chosenAction}`;
    case 'error':
      return `错误: ${step.data.errorType}`;
    default:
      return `步骤 #${step.stepId}`;
  }
}

function getStepSummary(step: ExecutionStep): string {
  switch (step.type) {
    case 'thinking':
      return step.data.reasoning?.substring(0, 50) + '...';
    case 'tool_call':
      return `延迟: ${step.data.latencyMs}ms`;
    case 'decision':
      return step.data.rationale?.substring(0, 50) + '...';
    case 'error':
      return step.data.message?.substring(0, 50);
    default:
      return '';
  }
}
```

---

## 8. 数据库迁移

**文件**: `indexer/local/migrations/003_add_execution_traces.sql`

```sql
-- Execution Traces 表
CREATE TABLE IF NOT EXISTS execution_traces (
  trace_cid TEXT PRIMARY KEY,
  task_id INTEGER NOT NULL,
  agent_address TEXT NOT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  total_tokens INTEGER DEFAULT 0,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  estimated_cost TEXT DEFAULT '0',
  success BOOLEAN NOT NULL,
  result_hash TEXT NOT NULL,
  trace_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  sdk_version TEXT,
  cli_version TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (agent_address) REFERENCES agents(address)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_traces_task_id ON execution_traces(task_id);
CREATE INDEX IF NOT EXISTS idx_traces_agent ON execution_traces(agent_address);
CREATE INDEX IF NOT EXISTS idx_traces_started ON execution_traces(started_at);

-- Evaluation Scores 表
CREATE TABLE IF NOT EXISTS evaluation_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  agent_address TEXT NOT NULL,
  trace_cid TEXT NOT NULL,
  correctness_score INTEGER NOT NULL,
  process_score INTEGER NOT NULL,
  efficiency_score INTEGER NOT NULL,
  robustness_score INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  reason_uri TEXT,
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (trace_cid) REFERENCES execution_traces(trace_cid)
);

CREATE INDEX IF NOT EXISTS idx_scores_task ON evaluation_scores(task_id);
```

---

## 9. 测试计划

### 9.1 单元测试

```typescript
// sdk/src/__tests__/ExecutionTracer.test.ts
import { ExecutionTracer } from '../ExecutionTracer';
import { ethers } from 'ethers';

describe('ExecutionTracer', () => {
  let tracer: ExecutionTracer;
  let mockSigner: ethers.Signer;
  
  beforeEach(() => {
    tracer = new ExecutionTracer({
      taskId: 1,
      agentId: 'test-agent',
      agentWallet: '0x123',
      sdkVersion: '1.0.0',
      cliVersion: '1.0.0',
    });
    
    mockSigner = {
      signMessage: jest.fn().mockResolvedValue('0xsignature'),
    } as any;
  });
  
  test('should record thinking step', () => {
    tracer.logThinking('context', 'reasoning', 0.9);
    const trace = tracer.getCurrentTrace();
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0].data.type).toBe('thinking');
  });
  
  test('should calculate trace hash', async () => {
    tracer.logThinking('context', 'reasoning', 0.9);
    const { trace } = await tracer.finalize('hash', true, undefined, mockSigner);
    expect(trace.integrity.traceHash).toBeDefined();
    expect(trace.integrity.signature).toBe('0xsignature');
  });
  
  test('should sanitize sensitive inputs', () => {
    tracer.logToolCall('api', { api_key: 'secret', normal: 'value' });
    const trace = tracer.getCurrentTrace();
    expect((trace.steps[0].data as any).inputs.api_key).toBe('***REDACTED***');
    expect((trace.steps[0].data as any).inputs.normal).toBe('value');
  });
});
```

### 9.2 集成测试

```typescript
// tests/integration/observability.test.ts
describe('Observability Integration', () => {
  test('should upload and retrieve trace', async () => {
    // 1. 创建 trace
    const tracer = new ExecutionTracer({...});
    tracer.logThinking('context', 'reasoning', 0.9);
    const { traceJson } = await tracer.finalize(...);
    
    // 2. 上传到 indexer
    const response = await fetch('http://localhost:3001/traces', {
      method: 'POST',
      body: traceJson,
    });
    const { cid } = await response.json();
    
    // 3. 检索 trace
    const retrieved = await fetch(`http://localhost:3001/traces/${cid}`);
    expect(retrieved.ok).toBe(true);
  });
  
  test('should evaluate trace with Judge', async () => {
    // 加载 trace
    const trace = await loadTrace('test-trace.json');
    
    // 评判
    const evaluator = new TraceEvaluator(trace);
    const result = evaluator.evaluate();
    
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown).toHaveProperty('correctness');
    expect(result.breakdown).toHaveProperty('processQuality');
  });
});
```

---

## 10. 部署清单

### 10.1 部署步骤

- [ ] 1. 合并 SDK 修改 (`sdk/src/ExecutionTracer.ts`, `sdk/src/AgentLoop.ts`)
- [ ] 2. 部署合约升级 (`submitResult` 添加 `traceCID` 参数)
- [ ] 3. 更新 Indexer 数据库 (运行 migration)
- [ ] 4. 部署 Indexer API (添加 `/traces` 端点)
- [ ] 5. 更新 CLI (添加 trace 收集功能)
- [ ] 6. 更新 Judge 服务 (添加 TraceEvaluator)
- [ ] 7. 更新前端 (添加 ExecutionTimeline 组件)
- [ ] 8. 运行集成测试
- [ ] 9. 更新文档

### 10.2 回滚计划

如果出现问题：
1. 合约：`submitResult` 支持空的 `traceCID`，可回退到旧版本
2. Indexer：保留旧 API，新端点失败不影响现有功能
3. SDK：`ExecutionTracer` 是可选的，不传 tracer 也能工作

---

## 11. 参考文档

- [设计文档](./observability-design.md) - 架构设计说明
- [SDK API](../sdk/api.md) - SDK API 参考
- [合约接口](../contracts/agent-arena.md) - 智能合约接口

---

*文档版本: v1.0*  
*最后更新: 2026-03-28*
