# V2 任务拆解 (Task Breakdown)

## 里程碑规划

```
Week 1: Contract Foundation
Week 2: Core Logic & Testing  
Week 3: Integration & Frontend
Week 4: Testnet & Audit Prep
```

---

## Week 1: Contract Foundation

### Day 1-2: Proxy 重构 (Owner: Davirian)

**任务**: 将 V1 重构为可升级架构

```solidity
// 目标文件
contracts/
├── proxy/
│   ├── AgentArenaProxy.sol          # ERC1967 Proxy
│   └── ProxyAdmin.sol               # 升级控制
├── implementations/
│   ├── AgentArenaV1.sol             # 提取当前逻辑
│   └── AgentArenaV2.sol             # V2 实现 (stub)
└── interfaces/
    ├── IAgentArena.sol              # 接口定义
    └── IAgentArenaV2.sol            # V2 扩展接口
```

**检查点**:
- [ ] 部署 V1 Proxy 到本地测试网
- [ ] 验证存储槽位对齐
- [ ] 测试升级流程

**预估**: 16 工时

---

### Day 3-4: V2 Core Data (Owner: Davirian)

**任务**: 实现 V2 数据结构和基础函数

```solidity
// AgentArenaV2.sol

// 1. 枚举和结构
enum TaskType { FIXED_BOUNTY, PROPORTIONAL }
struct Submission { ... }
struct Payout { ... }

// 2. 存储变量
mapping(uint256 => Submission[]) public taskSubmissions;
mapping(uint256 => Payout[]) public taskPayouts;

// 3. 核心函数
function postTaskProportional(...) external payable
function submitResultV2(...) external
function judgeMultiple(...) external onlyJudge
```

**检查点**:
- [ ] 编译通过
- [ ] 单元测试覆盖新增结构

**预估**: 12 工时

---

### Day 5-7: Settlement Logic (Owner: Davirian)

**任务**: 实现按比例结算算法

```solidity
function settleProportional(uint256 taskId) external {
    // 1. 验证状态
    // 2. 计算分配
    // 3. 执行转账 (或记录 claim)
    // 4. 更新状态
}

// 辅助函数
function calculatePayouts(...) internal view returns (...)
function distributeFunds(...) internal
```

**算法验证**:
```javascript
// Test cases
case1: 3 submissions, scores [90, 80, 70], threshold 60
  -> Winner (90): 60% = 0.006 OKB
  -> Runners (80,70): 25%/2 = 0.00125 OKB each
  -> Protocol: 10% = 0.001 OKB

case2: 1 submission, score 85, threshold 60
  -> Winner: 90% = 0.009 OKB (no runner share)
  -> Protocol: 10% = 0.001 OKB

case3: 2 submissions, scores [55, 50], threshold 60
  -> No qualified -> Refund poster
```

**检查点**:
- [ ] 所有测试用例通过
- [ ] Gas 估算 < 300k

**预估**: 16 工时

---

## Week 2: Core Logic & Testing

### Day 8-10: Security & Edge Cases (Owner: Security Reviewer)

**任务**: 处理边界情况和安全措施

| 场景 | 处理方案 | 测试 |
|------|---------|------|
| 重入攻击 | ReentrancyGuard + Checks-Effects-Interactions | ✅ 测试 |
| 整数溢出 | Solidity 0.8+ 内置检查 | ✅ 测试 |
| Gas 限制 | 限制 max submissions (50) | ✅ 测试 |
| 零地址转账 | require 检查 | ✅ 测试 |
| 重复结算 | settled 标记 | ✅ 测试 |

**检查点**:
- [ ] Slither 静态分析通过
- [ ] 100% 分支覆盖

**预估**: 20 工时

---

### Day 11-12: Judge Service Update (Owner: Backend)

**任务**: 更新 Judge 服务支持批量评估

```typescript
// judge/src/evaluator.ts

interface SubmissionEvaluation {
  agent: string;
  resultHash: string;
  score: number;
  qualified: boolean;
}

async function evaluateMultiple(
  taskId: number,
  submissions: Submission[]
): Promise<SubmissionEvaluation[]> {
  // 1. Fetch all results from IPFS
  // 2. Run evaluation in parallel
  // 3. Return scores array
}

async function submitJudgement(
  taskId: number,
  evaluations: SubmissionEvaluation[]
) {
  // 1. Call judgeMultiple on contract
  // 2. Wait for confirmation
  // 3. Trigger settlement if auto-settle enabled
}
```

**检查点**:
- [ ] 支持 10+ 提交并行评估
- [ ] 评估时间 < 30s per submission

**预估**: 12 工时

---

### Day 13-14: Indexer Update (Owner: Backend)

**任务**: 更新 Indexer 同步 V2 数据

```typescript
// indexer/src/handlers/v2.ts

// 1. 新事件处理器
async function handleTaskPostedProportional(event) {
  await db.insert('tasks', {
    ...event,
    task_type: 'PROPORTIONAL',
    settled: false
  });
}

async function handleResultSubmittedV2(event) {
  await db.insert('submissions', {
    task_id: event.taskId,
    agent: event.agent,
    result_hash: event.resultHash,
    score: null,  // 待 Judge 评分
    qualified: null
  });
}

async function handleJudgedMultiple(event) {
  // 批量更新评分
  for (let i = 0; i < event.agents.length; i++) {
    await db.update('submissions', {
      task_id: event.taskId,
      agent: event.agents[i]
    }, {
      score: event.scores[i],
      qualified: event.scores[i] >= event.qualityThreshold
    });
  }
}
```

**检查点**:
- [ ] 事件同步延迟 < 5s
- [ ] 数据库迁移脚本

**预估**: 12 工时

---

## Week 3: Integration & Frontend

### Day 15-17: CLI Update (Owner: CLI Developer)

**任务**: 更新 arena CLI 支持 V2

```typescript
// cli/src/commands/

// 1. post.ts - 新增 Type B 选项
program
  .command('post')
  .option('--type <type>', 'Task type: fixed | proportional', 'fixed')
  .option('--threshold <n>', 'Quality threshold for proportional', '60')
  .action(async (opts) => {
    if (opts.type === 'proportional') {
      await postTaskProportional({
        description: opts.description,
        reward: opts.reward,
        qualityThreshold: parseInt(opts.threshold)
      });
    }
  });

// 2. status.ts - 显示多提交状态
async function showTaskStatus(taskId: number) {
  const task = await client.getTask(taskId);
  if (task.taskType === 'PROPORTIONAL') {
    const submissions = await client.getSubmissions(taskId);
    console.table(submissions);
  }
}

// 3. start.ts - Agent loop 适配
// 检测任务类型，Proportional 任务立即提交，不等待分配
```

**检查点**:
- [ ] `arena post --type proportional` 可用
- [ ] `arena status` 显示 submissions

**预估**: 18 工时

---

### Day 18-21: Frontend Update (Owner: Frontend)

**任务**: Web 界面支持 V2

```typescript
// 1. 发布任务表单
<TaskPostForm>
  <TaskTypeSelector onChange={setTaskType} />
  {taskType === 'PROPORTIONAL' && (
    <QualityThresholdInput 
      value={threshold}
      onChange={setThreshold}
    />
  )}
</TaskPostForm>

// 2. 任务详情页
<TaskDetail>
  <TaskHeader type={task.taskType} />
  {task.taskType === 'PROPORTIONAL' && (
    <SubmissionsList submissions={submissions} />
    <Leaderboard scores={scores} />
  )}
</TaskDetail>

// 3. 结算展示
<SettlementView>
  <PayoutBreakdown 
    winner={winner}
    winnerAmount={amounts.winner}
    runners={runners}
    runnerAmount={amounts.runner}
    protocolFee={amounts.protocol}
  />
</SettlementView>
```

**检查点**:
- [ ] 设计稿确认
- [ ] 交互原型可用

**预估**: 24 工时

---

## Week 4: Testnet & Audit Prep

### Day 22-24: Testnet Deployment (Owner: DevOps)

**任务**: X-Layer Testnet 部署

```bash
# 1. 部署流程
npx hardhat run scripts/deploy-v2.ts --network xlayer-test

# 2. 验证合约
npx hardhat verify --network xlayer-test PROXY_ADDRESS

# 3. E2E 测试
npx hardhat test test/e2e/v2-flow.test.ts
```

**测试场景**:
- [ ] 完整 Type B 任务流 (Happy path)
- [ ] 争议流程
- [ ] 合约升级流程
- [ ] 边界情况 (1 submission, 0 qualified, max submissions)

**预估**: 18 工时

---

### Day 25-28: Documentation & Handover (Owner: All)

**任务**: 完成文档和审计准备

```
docs/
├── v2-proportional-payout/
│   ├── 01-thinking/ ✅ 已完成
│   ├── 02-design/   ✅ 本周完成
│   ├── 03-implementation/ ✅ 本周完成
│   └── 04-audit/
│       ├── audit-scope.md
│       ├── known-issues.md
│       └── test-report.md
```

**交付物**:
- [ ] 完整技术文档
- [ ] 测试覆盖率报告 (>90%)
- [ ] 审计委员会 (4 家报价)
- [ ] 主网部署计划

**预估**: 20 工时

---

## 总工时估算

| 角色 | 工时 | 说明 |
|------|------|------|
| 合约开发 | 60h | Davirian |
| 后端/Judge | 24h | Indexer + Judge |
| CLI | 18h | 命令行工具 |
| 前端 | 24h | Web 界面 |
| 测试/QA | 20h | E2E + 安全 |
| 文档 | 12h | 技术文档 |
| **总计** | **158h** | ~4 周 1 人，或 2 周 2 人 |

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 合约升级失败 | 低 | 高 | 多测试网验证，Timelock |
| Gas 超支 | 中 | 中 | 优化算法，限制 submissions |
| Judge 评估慢 | 中 | 低 | 并行评估，超时机制 |
| 前端延期 | 高 | 低 | CLI 优先，Web 可延后 |
