# ADR-002: Solana Chain Support (v1.1)

## Status
- Proposed

## Context

### 为什么考虑 Solana？

**外部触发：** Metaplex Hackathon Agents Track（Prize Pool: $5,000 USDC）
要求之一：用 Metaplex 在 Solana 上创建 Agent，演示 A2A 交互，发行代币。

**内部驱动：** Agent Arena 的长期愿景是成为 Agentic Economy 的基础设施层。
Solana 是 AI Agent 经济的核心战场之一（Base、Solana 占据 AI Agent 项目最多）。
不支持 Solana = 放弃最大的 Agent 生态。

**关键观察：**
Agent Arena 在 EVM 上已经证明了核心机制（竞争验证 → 声誉积累 → 自动结算）。
现在扩展到 Solana 是**链层移植**，不是协议重新设计。
协议逻辑（postTask → apply → submit → judge → pay）在 Solana 上完全成立。

---

### 为什么 Solana 比其他 EVM L2 更值得优先支持？

| 维度 | EVM L2 (Polygon/Arbitrum) | Solana |
|------|--------------------------|--------|
| Agent 生态 | 稀少 | 最活跃（Virtuals、ElizaOS 都有 Solana） |
| 身份原语 | 无标准（自己做 ENS） | Metaplex Core（现成） |
| Agent 钱包安全 | 私钥问题未解决 | Asset Signer PDA（无私钥） |
| 移植难度 | 低（同语言 Solidity） | 中（Anchor Rust，账户模型不同） |
| 黑客松机会 | 无 | Metaplex 有直接支持和 $5K 奖金 |
| 代币发行 | 需要自己做 | Metaplex Genesis Launch Pool 现成 |

**结论：** 技术难度更高，但 Metaplex 提供的现成 Agent 身份和代币原语让投入产出比最高。

---

### Solana 移植的核心挑战

**1. 账户模型 vs. 状态合约模型**

EVM：所有状态存在合约内，函数直接修改 storage。

```
AgentArena.sol
  mapping(address => Agent) agents;
  mapping(uint256 => Task)  tasks;
  function postTask() external payable { ... }
```

Solana/Anchor：每个实体是独立账户（PDA），程序本身无状态。

```
// 每个 Task 是一个独立 PDA
// seeds = ["task", task_id.to_le_bytes()]
struct TaskAccount {
    id: u64,
    poster: Pubkey,
    reward: u64,        // lamports (SOL)
    status: TaskStatus,
    ...
}

// 每个 Agent 是一个独立 PDA
// seeds = ["agent", wallet_pubkey]
struct AgentAccount {
    wallet: Pubkey,
    tasks_completed: u32,
    total_score: u32,
    ...
}
```

**2. SOL Escrow 的 PDA 设计**

EVM 中 OKB 直接 `msg.value` 进合约，合约 address 持有资金。

Solana 中 SOL 必须通过 `system_program::transfer` 转入专用 Escrow PDA，
程序通过 `invoke_signed` 释放。

```
// Escrow PDA: seeds = ["escrow", task_id]
// 发布任务时: poster → escrow PDA
// 支付时:     escrow PDA → winner (invoke_signed with bump)
```

**3. Agent 身份与 Metaplex Core 的绑定**

EVM：Agent 身份 = EOA 地址 + 合约内 mapping。
Solana v1.1：Agent 身份 = Metaplex Core Asset + Arena PDA（双层绑定）。

Metaplex Core Asset 提供：
- 链上可查的 agentId
- Asset Signer PDA（agent 的执行钱包，无私钥）
- Agent metadata（IPFS CID → 能力描述）
- 声誉 attribute（Arena Score 写入 MPL Core 的 attribute plugin）

---

## 方案对比

### 方案 A: Hybrid（Metaplex 身份 + X-Layer 结算）

```
Solana: Metaplex Core Asset = 身份
X-Layer: AgentArena.sol = 任务结算
Bridge: agent Solana pubkey ↔ EVM address 映射
```

优点：开发量最小（不写 Anchor program）
缺点：
- 用户需要同时持有 SOL 和 OKB
- 跨链体验割裂
- Solana 只是"装饰"，任务流程仍在 EVM 上
- Metaplex 评委会认为集成不够深

### 方案 B: Solana-native ArenaProgram（选定）

```
Solana:
  - Metaplex Core Asset = Agent 身份 + 声誉 attribute
  - Asset Signer PDA = Agent 执行钱包
  - ArenaProgram (Anchor) = 任务生命周期 + SOL Escrow
  - Genesis Launch Pool = Agent 代币发行

X-Layer:
  - AgentArena.sol 继续运行（V1 不动）
  - 两链并行，协议逻辑一致
```

优点：
- 完整满足 Metaplex 三个赛道要求
- Metaplex 身份原语解决了 daemon 私钥安全问题
- 声誉 attribute 写入链上，其他 Solana 协议可直接读取
- SOL 结算（比 OKB 用户基础更大）

缺点：
- 需要写 Anchor program（学习成本）
- 需要维护两套合约（EVM + Solana）

### 方案 C: 完全放弃 EVM，全切 Solana

优点：集中维护成本
缺点：失去 X-Layer OKX 生态，hackathon 前夕不稳定

---

## 决策

**采用方案 B: Solana-native ArenaProgram**

理由：
1. 方案 A 集成太浅，无法赢得 hackathon
2. 方案 C 放弃已有生态
3. 方案 B 让两个生态互补：OKX 用户用 X-Layer，Solana/Metaplex 用户用 Solana

---

## 技术决策细节

### Anchor Program 核心 Instructions

```
1. register_agent(agent_id, metadata_uri)
   → 创建 AgentAccount PDA
   → 调用 Metaplex registerIdentityV1（绑定 MPL Core Asset）

2. post_task(description, evaluation_cid, deadline, reward_lamports)
   → 创建 TaskAccount PDA
   → 创建 EscrowAccount PDA
   → system_program::transfer(poster → escrow, reward_lamports)

3. apply_for_task(task_id)
   → 验证 ApplicantAccount 不存在（防重复申请）
   → 创建 ApplicantAccount PDA

4. assign_task(task_id, agent_pubkey)
   → 更新 TaskAccount.status = InProgress
   → 设置 judge_deadline = now + 7 days

5. submit_result(task_id, result_cid)
   → 更新 TaskAccount.result_cid
   → 更新 TaskAccount.status = Submitted

6. judge_and_pay(task_id, score, winner, reason_cid)
   → 验证 caller = judge
   → if score >= 60: invoke_signed(escrow → winner, 90% reward)
   → 更新 AgentAccount.total_score += score
   → 更新 AgentAccount.tasks_completed += 1
   → 调用 Metaplex update_attribute(asset, "arena_score", new_score)

7. force_refund(task_id)
   → 验证 now > task.judge_deadline
   → invoke_signed(escrow → poster, reward)
```

### Account 命名空间（PDA seeds）

```
TaskAccount:       ["task", task_counter.to_le_bytes()]
EscrowAccount:     ["escrow", task_id.to_le_bytes()]
AgentAccount:      ["agent", wallet_pubkey]
ApplicantAccount:  ["applicant", task_id, agent_pubkey]
```

### 声誉存储策略

EVM：声誉在合约 mapping 内，只能查链上状态。
Solana v1.1：**双重存储**
1. `AgentAccount` PDA 内（Arena 自用，高效查询）
2. Metaplex Core Asset attribute（跨协议可查，其他 Solana 应用可读）

```
// Metaplex attribute 更新（每次 judge_and_pay 后）
// attribute key:   "arena_score"
// attribute value: "85"  (字符串，MPL Core 约定)
```

---

## 后果

### 正面
- 完整满足 Metaplex hackathon 三个要求
- Agent 钱包安全性提升（Asset Signer PDA）
- 声誉首次成为跨协议的链上原语
- Solana 生态覆盖（更大的 Agent 开发者社区）

### 负面
- 两套合约维护成本
- Anchor 学习曲线
- Metaplex SDK 版本变动风险

### 中立
- V2 Proportional Payout 推迟（等 v1.1 Solana 稳定后再做）
- EVM 版本继续运行，不受影响

---

## 实施里程碑

| 阶段 | 内容 | 预估 |
|------|------|------|
| M1 | Anchor program 框架 + register_agent | Day 1-2 |
| M2 | post/apply/assign/submit/judge 完整链路 | Day 2-3 |
| M3 | Metaplex Core 绑定 + attribute 写入 | Day 3-4 |
| M4 | Genesis Launch Pool 集成（Agent Token） | Day 4-5 |
| M5 | A2A Demo 脚本 + 前端适配 | Day 5-6 |
| M6 | 测试 + 文章发布 | Day 7 |
