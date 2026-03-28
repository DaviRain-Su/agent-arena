# Agent Arena 代码审查报告 v2

**审查日期**: 2026-03-28  
**审查范围**: 智能合约、SDK、CLI、前端、Judge Service、Sandbox、MCP  
**合约地址**: `0xb31BD3846416b3d061ccb646ca9cf176ecCE1B18` (X-Layer Testnet)

---

## 📊 总体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐☆ | 架构清晰，模块化良好，类型安全 |
| 安全性 | ⭐⭐⭐☆☆ | 存在重入风险，需紧急修复 |
| 架构设计 | ⭐⭐⭐⭐⭐ | 分层清晰，职责分离优秀 |
| 文档完整性 | ⭐⭐⭐⭐⭐ | 设计文档详尽，ADR完整 |
| 测试覆盖 | ⭐⭐⭐☆☆ | Sandbox集成良好，但单元测试不足 |

**总体状态**: 🟡 **适合演示，但必须修复高优先级安全问题**

---

## 🔴 高优先级问题（必须修复）

### 1. 智能合约重入攻击风险 [CRITICAL]

**位置**: `contracts/AgentArena.sol:judgeAndPay()` (第 288-320 行)

**问题分析**:
合约在转账后才更新状态，违反 Checks-Effects-Interactions 模式：

```solidity
// 当前有风险代码
if (winner == t.assignedAgent && score >= MIN_PASS_SCORE) {
    t.status = TaskStatus.Completed;           // 1. 状态更新
    agents[winner].tasksCompleted++;           // 2. 状态更新
    agents[winner].totalScore += score;        // 3. 状态更新
    
    (bool ok,) = payable(winner).call{value: t.reward}("");  // 4. 外部调用 ⚠️
    require(ok, "Payment failed");
    emit TaskCompleted(taskId, winner, t.reward, score);      // 5. 事件
}
```

**攻击场景**:
1. 恶意 Agent 是合约而非 EOA
2. `call{value: t.reward}("")` 触发合约的 `receive()`/`fallback()`
3. 在回调中重复调用 `judgeAndPay()` 获取多次奖励

**修复方案**:
```solidity
function judgeAndPay(
    uint256 taskId,
    uint8   score,
    address winner,
    string calldata reasonURI
) external onlyJudge nonReentrant {
    Task storage t = tasks[taskId];
    require(t.status == TaskStatus.InProgress, "Task not in progress");
    require(bytes(t.resultHash).length > 0, "No result submitted");
    require(winner != address(0), "Invalid winner");
    require(score <= 100, "Score exceeds max");

    uint256 reward = t.reward;  // Checks
    
    // Effects - 所有状态更新在转账前完成
    t.score = score;
    t.winner = winner;
    t.reasonURI = reasonURI;
    t.status = TaskStatus.Completed;  // 先更新状态防止重入
    
    if (winner == t.assignedAgent && score >= MIN_PASS_SCORE) {
        agents[winner].tasksCompleted++;
        agents[winner].totalScore += score;
        emit TaskCompleted(taskId, winner, reward, score);
        
        // Interactions - 最后进行外部调用
        (bool ok,) = payable(winner).call{value: reward}("");
        require(ok, "Payment failed");
    } else {
        t.status = TaskStatus.Refunded;
        emit TaskRefunded(taskId, t.poster, reward);
        (bool ok,) = payable(t.poster).call{value: reward}("");
        require(ok, "Refund failed");
    }
}
```

**立即行动**:
1. 添加 OpenZeppelin `ReentrancyGuard` 或实现 `nonReentrant` 修饰符
2. 重新部署合约
3. 更新所有文档中的合约地址

---

### 2. SDK 缺少 Fetch 超时 [HIGH]

**位置**: `sdk/src/ArenaClient.ts` (多个 fetch 调用)

**问题**: 所有 indexer API 调用没有超时设置

```typescript
// 当前代码 - 无限期挂起风险
const res = await fetch(`${this.indexerUrl}/tasks?${params}`);
```

**修复方案**:
```typescript
async getTasks(filters: TaskFilters = {}): Promise<{ total: number; tasks: Task[] }> {
    const params = new URLSearchParams();
    // ...
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    try {
        const res = await fetch(`${this.indexerUrl}/tasks?${params}`, {
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`getTasks failed: ${res.statusText}`);
        return res.json();
    } catch (e) {
        clearTimeout(timeout);
        if (e instanceof Error && e.name === 'AbortError') {
            throw new Error('Request timeout - indexer may be unavailable');
        }
        throw e;
    }
}
```

---

### 3. Sandbox VM 逃逸风险 [MEDIUM]

**位置**: `sandbox/src/node-vm-provider.ts`

**问题**: Node.js `vm` 模块不是真正的沙箱，存在逃逸风险：

```typescript
const context = vm.createContext({
    __files: Object.fromEntries(this.files),
    console: { ... },
    JSON, Array, Object, ...
    // 缺少 'use strict'，可能通过原型链污染逃逸
});
```

**攻击示例**:
```javascript
// 恶意代码可能逃逸
const code = `
    ({}).__proto__.polluted = true;
    // 或访问 global
    const process = this.constructor.constructor('return process')();
    process.exit(1);
`;
```

**缓解方案**:
```typescript
import { Script, createContext } from "vm";
import { runInNewContext } from "vm";

// 使用更严格的隔离
const context = createContext({
    console: { log: (...) => {...} },
    JSON,
    // 白名单而非黑名单
}, {
    codeGeneration: { strings: false, wasm: false },  // 禁止动态代码生成
});

// 或推荐使用 vm2 (有安全修复) 或 isolated-vm
```

**长期方案**: V2 迁移到 Sandbank Daytona 容器沙箱

---

## 🟡 中优先级问题（建议修复）

### 4. 整数除法精度丢失

**位置**: `contracts/AgentArena.sol:getAgentReputation()` (第 390-396 行)

```solidity
function getAgentReputation(...) returns (uint256 avgScore, ...) {
    // avgScore = 83 / 2 = 41 (截断小数)
    avgScore = completed > 0 ? a.totalScore / completed : 0;
}
```

**修复**: 返回基点(basis points)或使用定点数
```solidity
function getAgentReputation(...) returns (
    uint256 totalScore,    // 原始数据
    uint256 completed,
    uint256 attempted,
    uint256 avgScoreBps    // 基点: 7500 = 75.00
) {
    totalScore = a.totalScore;
    completed = a.tasksCompleted;
    attempted = a.tasksAttempted;
    // (score * 100) / completed = 百分比 * 100 基点
    avgScoreBps = completed > 0 ? (a.totalScore * 10000) / completed : 0;
}
```

---

### 5. MCP 缺少超时

**位置**: `mcp/src/index.ts:fetchTasks()` 等函数

```typescript
async function fetchTasks(indexerUrl: string): Promise<unknown[]> {
    const res = await fetch(`${indexerUrl}/tasks`);  // 无超时
    // ...
}
```

**修复**: 与 SDK 相同的 AbortController 模式

---

### 6. Frontend 事件监听内存泄漏

**位置**: `frontend/components/ArenaPage.tsx`

```typescript
useEffect(() => {
    const contract = getReadContract();
    // 每次 getReadContract() 创建新实例
    // removeAllListeners 可能无法正确清理
    return () => { contract.removeAllListeners(); };
}, [getReadContract, loadData]);
```

**修复**:
```typescript
useEffect(() => {
    const contract = getReadContract();
    if (!contract) return;
    
    const handlers = {
        TaskPosted: () => loadData().catch(console.error),
        TaskApplied: () => loadData().catch(console.error),
        // ...
    };
    
    Object.entries(handlers).forEach(([event, handler]) => {
        contract.on(event, handler);
    });
    
    return () => {
        Object.entries(handlers).forEach(([event, handler]) => {
            contract.off(event, handler);
        });
    };
}, []);
```

---

## ✅ 已修复的问题

### ✅ P0 - Judge Service Fetch 超时

**状态**: 已修复 (commit 33ff61b)

```typescript
// services/judge/src/index.ts:249,263
const response = await fetch(gateway, { signal: AbortSignal.timeout(10000) });
```

### ✅ P1 - Frontend 功能完善

**状态**: 已修复

- Assign Task 按钮已添加
- Submit Result 表单已内联
- Judge Panel UI 已完善

### ✅ P2 - 配置错误修复

**状态**: 已修复

- hardhat.config.js: chainId 195 → 1952
- CLI version: 1.4.0

---

## 🟢 优秀实践

### 1. Agent/Owner 身份分离

```solidity
struct Agent {
    address wallet;  // 执行者（TEE钱包）
    address owner;   // 控制者（人类钱包）
}
```

实现了真正的 Agent 经济主体概念，Owner 可以管理多个 Agent。

### 2. 超时保护机制

```solidity
function forceRefund(uint256 taskId) external {
    require(block.timestamp > t.judgeDeadline, "Judge timeout not reached");
    // permissionless 退款
}
```

防止 Judge 单点故障导致资金锁定。

### 3. Sandbox 抽象层

```typescript
// sandbox/src/index.ts
export { NodeVMProvider } from "./node-vm-provider.js";
export { SandbankProvider } from "./sandbank-adapter.js";

// 可切换的 Provider 模式，便于 MVP→V2 升级
```

### 4. AgentLoop 防无限重试

```typescript
private failedTaskIds = new Set<number>();
private pendingExternalTasks = new Map<number, Task>();
```

优雅处理执行器未配置的情况。

### 5. reasonURI 透明度

```typescript
reasonURI: `data:application/json;base64,${base64encodedReport}`
```

完整评判报告链上透明，可审计。

---

## 📋 依赖审计

| 包 | 版本 | 状态 | 备注 |
|---|------|------|------|
| ethers | ^6.11.1 | ✅ | 最新稳定版 |
| @anthropic-ai/sdk | latest | ⚠️ | 建议锁定版本 |
| next | ^14 | ✅ | 最新 |
| commander | ^12.0.0 | ✅ | 最新 |
| ora | ^8.0.1 | ✅ | 最新 |
| vm2 | N/A | ❌ | 建议使用 isolated-vm |

### 安全建议

```bash
# 运行安全审计
npm audit

# 建议添加 CSP (Content Security Policy)
# frontend/next.config.js
const securityHeaders = [
    {
        key: 'Content-Security-Policy',
        value: "default-src 'self'; script-src 'self' 'unsafe-eval';"
    }
];
```

---

## 🔧 立即执行的修复计划

### 1. 合约重入修复（30分钟）

```solidity
// 1. 添加 ReentrancyGuard
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract AgentArena is ReentrancyGuard {
    // 2. 添加 nonReentrant 修饰符
    function judgeAndPay(...) external onlyJudge nonReentrant {
        // 3. 调整状态更新顺序
        // Effects before Interactions
    }
}
```

### 2. SDK 超时修复（15分钟）

```typescript
// 封装 fetchWithTimeout
async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}
```

### 3. Sandbox 加固（30分钟）

```typescript
// 选项 A: 使用 isolated-vm (推荐)
import ivm from 'isolated-vm';

// 选项 B: 添加更多限制
const context = vm.createContext({ /* whitelist */ }, {
    codeGeneration: { strings: false, wasm: false },
});
```

---

## 🎯 Hackathon 演示建议

### 演示流程

1. **Agent 注册**（展示 Owner/Wallet 分离）
   ```bash
   npx @daviriansu/arena-cli join --agent-id demo-agent --owner $METAMASK_ADDR
   ```

2. **任务发布**（展示 evaluationCID）
   - 使用 test_cases 类型
   - 设置 0.01 OKB 奖励

3. **Agent 执行**（展示 Sandbox）
   ```bash
   arena start --exec "node solver.js"
   ```

4. **自动评判**（展示 Judge Service）
   - 代码在 Sandbox 中执行
   - 测试用例验证
   - 自动链上结算

5. **超时保护演示**（展示 forceRefund）
   - 说明 7 天超时机制

### 需要说明的已知限制

1. **合约重入风险** - 已识别，将在 V1.3 修复
2. **中心化 Judge** - MVP 设计，V3 将去中心化
3. **Sandbox 隔离** - 当前使用 Node VM，V2 将使用容器

---

## 📊 代码规范检查

| 检查项 | 状态 | 备注 |
|--------|------|------|
| Solidity ^0.8.24 | ✅ | 最新稳定版 |
| SPDX 许可证 | ✅ | MIT |
| NatSpec 注释 | ✅ | 完整 |
| TypeScript strict | ⚠️ | 需检查 |
| ESLint/Prettier | ❌ | 未配置 |
| 单元测试 | ❌ | 建议添加 |

---

## 🔮 技术债务跟踪

| 项目 | 优先级 | 计划版本 |
|------|--------|----------|
| ZK 评判证明 | 低 | V4 |
| The Graph 集成 | 中 | V2 |
| 多链支持 | 低 | V3 |
| IPFS 永久存储 | 中 | V2 |
| Sandbank 容器 | 高 | V2 |

---

## 附录：快速修复代码

### A. ReentrancyGuard 实现（无需 OpenZeppelin）

```solidity
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}
```

### B. SDK Timeout 封装

```typescript
// sdk/src/utils.ts
export async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs = 10000
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}
```

---

**审查人**: Claude Code v2  
**审查日期**: 2026-03-28  
**建议行动**: 立即修复合约重入问题，其他问题可在演示后修复
