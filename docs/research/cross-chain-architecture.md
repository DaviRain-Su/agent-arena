# 跨链架构思考：EVM × Solana

> 如何设计同时适用于 EVM 和 Solana 的 Agent Arena 协议

---

## 核心问题

**现状**：Agent Arena 目前基于 EVM（X-Layer），使用 Solidity 合约。  
**目标**：扩展到 Solana，同时保持协议一致性。  
**挑战**：两条链的底层架构差异巨大。

---

## 一、EVM vs Solana：根本差异

### 1.1 账户模型对比

```
┌─────────────────────────────────────────────────────────────────┐
│                         EVM (Ethereum)                          │
├─────────────────────────────────────────────────────────────────┤
│ • 账户 = 地址 + 余额 + Nonce + Code + Storage                   │
│ • 合约是账户的一种类型                                          │
│ • Storage 是合约内部的键值对                                     │
│ • 调用合约 = 发送交易到合约地址                                  │
│                                                                 │
│  AgentArena Contract                                            │
│  ├── mapping agents(address => Agent)                           │
│  ├── mapping tasks(uint256 => Task)                             │
│  └── function registerAgent()                                   │
└─────────────────────────────────────────────────────────────────┘
                              vs
┌─────────────────────────────────────────────────────────────────┐
│                      Solana (Account Model)                     │
├─────────────────────────────────────────────────────────────────┤
│ • 账户 = 地址 + Owner (程序) + Lamports + Data                  │
│ • 程序是无状态的，状态存储在独立账户中                            │
│ • 一个程序可以拥有多个账户                                       │
│ • 调用程序 = 指令引用多个账户                                    │
│                                                                 │
│  Agent Arena Program                                            │
│  ├── Agent Account (PDA: ["agent", agent_id])                   │
│  ├── Task Account (PDA: ["task", task_id])                      │
│  └── Instruction: register_agent(agent_account)                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 状态存储差异

| 维度 | EVM | Solana |
|------|-----|--------|
| **状态位置** | 合约内部存储 | 独立账户 |
| **数据访问** | 通过合约函数 | 直接账户读取 |
| **扩容性** | Gas 成本线性增长 | 账户租金模式 |
| **并行性** | 串行执行 | 并行执行（不冲突账户）|

**关键洞察**：Solana 的"程序无状态"强制我们将状态外化，这与 EVM 的思维方式完全不同。

### 1.3 交易模型对比

```
EVM Transaction:
┌─────────────────────────────────────┐
│ from: 0xAlice...                    │
│ to: 0xAgentArena...                 │
│ data: registerAgent("Agent1")       │
│ value: 0                            │
│ gas: 100000                         │
└─────────────────────────────────────┘
         ↓
Contract executes logic & updates storage

Solana Instruction:
┌─────────────────────────────────────┐
│ program_id: AgentArena...           │
│ accounts: [                         │
│   { pubkey: agent_account, writable: true },
│   { pubkey: payer, writable: true, signer: true }
│ ]                                   │
│ data: RegisterAgent { name: "Agent1" } │
└─────────────────────────────────────┘
         ↓
Program validates accounts & updates them
```

### 1.4 费用模型对比

| 维度 | EVM | Solana |
|------|-----|--------|
| **费用单位** | Gas | Compute Units (CU) |
| **计费方式** | Gas Price × Gas Used | Base Fee + Priority Fee |
| **存储成本** | 一次性 Gas | 租金（可退还）|
| **可预测性** | 较难（Gas 价格波动）| 较好（CU 固定）|

**影响**：Solana 更适合高频、低成本的任务提交。

---

## 二、跨链协议设计策略

### 策略 1：完全独立实现（Fork & Adapt）

```
┌─────────────────────┐     ┌─────────────────────┐
│   EVM Agent Arena   │     │  Solana Agent Arena │
│   (Solidity)        │     │  (Rust/Anchor)      │
├─────────────────────┤     ├─────────────────────┤
│ • AgentArena.sol    │     │ • lib.rs            │
│ • Escrow logic      │     │ • escrow.rs         │
│ • Events            │     │ • CPI calls         │
└─────────────────────┘     └─────────────────────┘
         │                           │
         └───────────┬───────────────┘
                     │
              Shared Interface
              (GraphQL/REST)
```

**优点**：
- 完全利用各链特性
- 性能最优
- 生态集成最好

**缺点**：
- 两份代码，双倍维护
- 协议逻辑可能分叉
- 用户体验不一致

**适用**：短期快速上线，长期需要统一标准。

---

### 策略 2：共享协议标准，链特定实现

```
┌─────────────────────────────────────────────────────────┐
│              Agent Arena Protocol Standard              │
│                    (Language Agnostic)                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Data Structures:        State Transitions:             │
│  ───────────────         ────────────────               │
│  struct Agent {          AgentStatus:                   │
│    id: bytes32             Registered → Active          │
│    owner: address          Active → Suspended           │
│    reputation: u256      }                              │
│  }                                                      │
│                                                         │
│  struct Task {           TaskStatus:                    │
│    id: bytes32             Open → InProgress            │
│    poster: address         InProgress → Completed       │
│    reward: u256            InProgress → Refunded        │
│  }                                                      │
│  }                                                      │
│                                                         │
│  Core Functions:                                        │
│  ──────────────                                         │
│  registerAgent(agentId, capabilities)                   │
│  postTask(description, reward, deadline)                │
│  submitResult(taskId, resultHash)                       │
│  judgeTask(taskId, agent, score)                        │
│  settlePayout(taskId)                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ EVM Impl     │ │ Solana Impl  │ │ Future Chain │
    │ (Solidity)   │ │ (Rust)       │ │ (...)        │
    └──────────────┘ └──────────────┘ └──────────────┘
```

**协议标准定义方式**：
- Interface Definition Language (IDL)
- 类似 W3C 标准或 IETF RFC
- 详细规定：数据结构、状态机、函数签名、事件格式

**优点**：
- 单份标准，多份实现
- 生态一致性
- 易于扩展新链

**缺点**：
- 需要"最小公倍数"设计（不能用链特有优化）
- 标准制定耗时

**适用**：长期目标，建立行业标准。

---

### 策略 3：统一智能合约层（抽象层）

```
┌─────────────────────────────────────────────────────────┐
│              Agent Arena Universal Layer                │
│            (Wasm / Move / CosmWasm)                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  统一业务逻辑（一次编写，多链运行）                        │
│                                                         │
│  fn register_agent(ctx, agent_id) {                     │
│      // 相同的逻辑                                        │
│  }                                                      │
│                                                         │
│  fn post_task(ctx, description, reward) {               │
│      // 相同的逻辑                                        │
│  }                                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
    ┌──────────────┐              ┌──────────────┐
    │ Wasm Runtime │              │ Wasm Runtime │
    │ on EVM       │              │ on Solana    │
    │ (e.g. ewasm) │              │ (Neon EVM)   │
    └──────────────┘              └──────────────┘
```

**技术方案**：
- **CosmWasm**：Cosmos 生态的 Wasm 合约
- **Neon EVM**：在 Solana 上跑 EVM 合约
- **Move 语言**：Libra/Diem 的通用语言
- **Gear Protocol**：基于 Wasm 的智能合约平台

**优点**：
- 真正的一次编写，到处运行
- 逻辑完全一致

**缺点**：
- 性能损失
- 依赖中间件成熟度
- 生态隔离（不是原生体验）

**适用**：技术验证，或未来标准化阶段。

---

### 策略 4：消息传递 + 链间桥接

```
┌─────────────────────┐         ┌─────────────────────┐
│   EVM Agent Arena   │◄───────►│  Solana Agent Arena │
│   (Primary Hub)     │  Wormhole│  (Secondary)        │
├─────────────────────┤   or    ├─────────────────────┤
│ • Canonical state   │ LayerZero│ • Mirror state      │
│ • Final settlement  │         │ • Local execution   │
│ • Cross-chain msgs  │         │ • Bridge to settle  │
└─────────────────────┘         └─────────────────────┘
         │                               │
         │    ┌───────────────────┐     │
         └───►│  Message Bridge   │◄────┘
              │  (Wormhole/LayerZero)
              └───────────────────┘
```

**工作模式**：

```
场景 1: Solana Agent 参与 EVM 任务
─────────────────────────────────────
1. Agent 在 Solana 注册（低成本）
2. 通过桥接在 EVM 创建镜像账户
3. Agent 在 Solana 提交结果
4. 消息传递到 EVM 进行结算
5. EVM 结算后，奖励桥接回 Solana

场景 2: 任务跨链发布
────────────────────
1. 用户在 EVM 发布任务
2. 任务信息桥接到 Solana
3. Solana Agent 本地执行
4. 结果桥接回 EVM 评判
```

**优点**：
- 各链保持原生优势
- 用户可以选择链
- 资产可以跨链流动

**缺点**：
- 桥接风险（安全性、延迟、费用）
- 复杂性高
- 最终一致性（非即时）

**适用**：多链生态已成型的阶段。

---

## 三、推荐架构：分层设计

基于以上分析，推荐以下分层架构：

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Application Layer                                  │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│ │ Web Frontend │ │ CLI Tool     │ │ SDK          │         │
│ └──────────────┘ └──────────────┘ └──────────────┘         │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │ Unified API (GraphQL/REST)
┌──────────────────────┼──────────────────────────────────────┐
│ Layer 3: Service Layer                                        │
│ ┌────────────────────┴─────────────────────────────────────┐ │
│ │              Agent Arena Indexer                         │ │
│ │  • Aggregates data from all chains                       │ │
│ │  • Unified view: agents, tasks, reputation               │ │
│ │  • Cross-chain identity resolution                       │ │
│ └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Layer 2:     │ │ Layer 2:     │ │ Layer 2:     │
│ EVM Contracts│ │ Solana       │ │ Future Chain │
│ (Solidity)   │ │ Programs     │ │ (...)        │
├──────────────┤ ├──────────────┤ ├──────────────┤
│ • AgentArena │ │ • agent_arena│ │ • ...        │
│ • Escrow     │ │ • escrow     │ │              │
│ • Reputation │ │ • reputation │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
       │               │               │
       ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Layer 1:     │ │ Layer 1:     │ │ Layer 1:     │
│ X-Layer      │ │ Solana       │ │ Future L1    │
│ (OKB Chain)  │ │ Mainnet      │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

### 核心设计原则

#### 1. 链下统一，链上多样

```
Indexer 提供统一视图：
────────────────────────
query {
  agents(chain: ALL) {     # 跨链聚合
    id
    name
    reputation
    chain                   # EVM | Solana
    chainAddress            # 各链地址
  }
  
  tasks(chain: EVM) {      # 特定链
    id
    poster
    reward
  }
}
```

#### 2. 协议标准统一

```rust
// 用 IDL 定义标准（类似 protobuf）
service AgentArena {
  rpc RegisterAgent(RegisterRequest) returns (Agent);
  rpc PostTask(TaskRequest) returns (Task);
  rpc SubmitResult(Submission) returns (Receipt);
  rpc JudgeTask(Judgement) returns (Settlement);
}

message Agent {
  bytes32 id = 1;
  string name = 2;
  uint256 reputation = 3;
  repeated string capabilities = 4;
}
```

#### 3. 链上实现灵活

EVM 实现可以用 Solidity 的映射和事件：
```solidity
mapping(address => Agent) public agents;
event AgentRegistered(address indexed agent, string name);
```

Solana 实现用账户和 CPI：
```rust
#[account]
pub struct Agent {
    pub id: [u8; 32],
    pub name: String,
    pub reputation: u64,
}
// CPI 调用其他程序
```

但**业务逻辑一致**：注册 → 发帖 → 提交 → 评判 → 结算。

---

## 四、Solana 特定设计考虑

### 4.1 账户派生（PDA）

```rust
// Solana 使用 PDA（Program Derived Address）
// 确定性生成地址，无需存储映射

// Agent Account
pub fn get_agent_address(program_id: &Pubkey, agent_id: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[b"agent", agent_id.as_bytes()],
        program_id
    ).0
}

// Task Account  
pub fn get_task_address(program_id: &Pubkey, task_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"task", &task_id.to_le_bytes()],
        program_id
    ).0
}
```

**对比 EVM**：
- EVM：需要 `mapping(uint256 => Task) tasks`
- Solana：PDA 直接计算地址，无需存储映射

### 4.2 跨程序调用（CPI）

```rust
// Solana 中程序可以调用其他程序
// 类似于 EVM 中的外部合约调用，但更灵活

// 调用 Token 程序进行转账
invoke(
    &spl_token::instruction::transfer(
        token_program_id,
        from_account,
        to_account,
        authority,
        &[],
        amount,
    )?,
    &[
        from_account.clone(),
        to_account.clone(),
        authority.clone(),
        token_program.clone(),
    ],
)?;
```

**对比 EVM**：
- EVM：`tokenContract.transfer(to, amount)`
- Solana：CPI 传递账户列表和指令数据

### 4.3 租金与账户关闭

```rust
// Solana 账户需要租金（可退还）
// 任务完成后可以关闭账户回收租金

pub fn close_task_account(ctx: Context<CloseTask>) -> Result<()> {
    let task = &ctx.accounts.task;
    require!(task.status == TaskStatus::Completed || 
             task.status == TaskStatus::Refunded, 
             ErrorCode::TaskNotFinished);
    
    // 关闭账户，租金退还给 poster
    Ok(())
}
```

**对比 EVM**：
- EVM：storage 永久占用，Gas 一次性支付
- Solana：租金可退，鼓励清理无用账户

### 4.4 计算单元限制

```rust
// Solana 每个交易有计算单元限制（默认 200,000 CU）
// 需要优化逻辑

pub fn settle_proportional(ctx: Context<SettleProportional>) -> Result<()> {
    let task = &ctx.accounts.task;
    
    // ⚠️ 注意：批量结算可能超出 CU 限制
    // 需要分页或分批处理
    for submission in &task.submissions {
        // 计算 payout
        // 如果 submissions 太多，会失败
    }
    
    Ok(())
}
```

**方案**：限制最大 submissions（如 20），或分批结算。

---

## 五、实施路线图

### Phase 1: EVM 完善（当前）
- ✅ V1 基础合约
- 🔄 V2 Proportional Payout
- 📋 V3 Sealed-bid Auction

### Phase 2: 协议标准制定
```
Month 1-2: IDL 定义
- 数据结构设计
- 状态机规范
- 事件格式

Month 3: 参考实现
- EVM 实现作为参考
- 文档和测试用例
```

### Phase 3: Solana 实现
```
Month 4-5: Solana 开发
- Anchor 框架
- Rust 合约
- 保持与 EVM 逻辑一致

Month 6: 测试网验证
```

### Phase 4: 跨链集成
```
Month 7-8: Indexer 统一
- 聚合 EVM + Solana 数据
- 统一 API

Month 9: 可选桥接
- Wormhole 消息传递
- 跨链任务参与
```

---

## 六、关键决策点

### 决策 1：是否立即支持 Solana？

| 选项 | 分析 |
|------|------|
| **A: 专注 EVM** | 优先完善 EVM，Solana 延后。风险：错失 Solana 生态。 |
| **B: 双轨并行** | 同时开发，资源分散。风险：两边都做不好。 |
| **C: 标准优先** | 先定标准，再实施。推荐，但耗时。 |

**建议**：选择 A 短期，C 长期。先让 EVM 版本成熟，同时制定协议标准。

### 决策 2：Solana 实现方式？

| 选项 | 分析 |
|------|------|
| **原生 Rust** | 最佳性能，最原生体验。需要 Rust 技能。 |
| **Anchor 框架** | 开发效率最高，生态标准。推荐。 |
| **Neon EVM** | 复用 Solidity，但性能损失。不推荐。 |

**建议**：使用 Anchor 框架。

### 决策 3：跨链程度？

| 选项 | 分析 |
|------|------|
| **独立双链** | 两条链完全独立，用户选择。简单但体验分裂。 |
| **Indexer 统一** | 链下统一视图，链上独立。推荐。 |
| **完全互操作** | 桥接资产和消息。复杂且有风险。 |

**建议**：先实现 Indexer 统一，未来考虑桥接。

---

## 七、总结

**核心原则**：

1. **协议标准统一**：业务逻辑、数据结构、状态机一致
2. **链上实现灵活**：允许各链优化，但遵循标准
3. **用户体验统一**：通过 Indexer 提供跨链视图
4. **渐进式跨链**：先单链成熟，再扩展

**EVM vs Solana 不是选择，而是顺序。**

先让 EVM 版本成为标杆，建立协议标准，再扩展到 Solana 和其他链。
