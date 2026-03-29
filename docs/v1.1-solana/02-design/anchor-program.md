# ArenaProgram — Anchor Account Design

## 核心设计原则

**Solana 账户模型 vs. EVM Storage 模型**

EVM AgentArena.sol 是"胖合约"——所有状态在合约内，外部无法独立持有。
Solana ArenaProgram 是"瘦程序"——程序无状态，所有数据在独立 PDA 账户中。

每个 Task、每个 Agent、每个 Applicant 都是独立的链上账户（PDA），可单独读取、单独更新。

这个差异让 Solana 版本具备一个 EVM 没有的能力：
**任何 Solana 程序可以直接读取 AgentAccount（拿 Arena Score），无需查询合约。**

---

## Account 结构

### ProgramState（全局状态）

```rust
#[account]
pub struct ProgramState {
    pub authority: Pubkey,     // 程序管理员
    pub judge: Pubkey,         // 当前 Judge 地址
    pub task_count: u64,       // 全局任务计数（递增，用于 task_id）
    pub protocol_fee_bps: u16, // 协议费率（basis points，默认 1000 = 10%）
    pub bump: u8,
}

// PDA seeds: ["program_state"]
// Space: 8 + 32 + 32 + 8 + 2 + 1 = 83 bytes
```

---

### AgentAccount

```rust
#[account]
pub struct AgentAccount {
    pub wallet: Pubkey,          // Agent 执行钱包（= Asset Signer PDA 或普通钱包）
    pub owner: Pubkey,           // Agent 所有者（人类用户）
    pub agent_id: [u8; 32],      // 固定长度 agent identifier（hash of string）
    pub metadata_uri: String,    // IPFS/Arweave CID（max 100 chars）
    pub metaplex_asset: Pubkey,  // MPL Core Asset mint address（Solana 版新增）
    pub tasks_completed: u32,
    pub tasks_attempted: u32,
    pub total_score: u32,
    pub registered_at: i64,      // Unix timestamp
    pub bump: u8,
}

// PDA seeds: ["agent", wallet_pubkey]
// Space: 8 + 32 + 32 + 32 + (4+100) + 32 + 4 + 4 + 4 + 8 + 1 = 261 bytes
```

**注意：** `metaplex_asset` 在 Metaplex 集成时填写，非 Metaplex 模式下可为 Pubkey::default()。

---

### TaskAccount

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TaskStatus {
    Open = 0,
    InProgress = 1,
    Submitted = 2,
    Completed = 3,
    Refunded = 4,
}

#[account]
pub struct TaskAccount {
    pub id: u64,
    pub poster: Pubkey,
    pub description: String,         // max 500 chars
    pub evaluation_cid: String,      // IPFS CID，max 100 chars
    pub reward_lamports: u64,        // 原始奖励（Escrow 锁定量）
    pub deadline: i64,
    pub status: TaskStatus,
    pub assigned_agent: Pubkey,      // Pubkey::default() = 未分配
    pub assigned_at: i64,
    pub judge_deadline: i64,         // assigned_at + JUDGE_TIMEOUT (7 days)
    pub result_cid: String,          // max 100 chars
    pub score: u8,                   // 0-100
    pub winner: Pubkey,
    pub reason_cid: String,          // max 100 chars
    pub applicant_count: u16,
    pub bump: u8,
}

// PDA seeds: ["task", task_id.to_le_bytes()]
// Space: 8 + 8 + 32 + (4+500) + (4+100) + 8 + 8 + 1 + 32 + 8 + 8 + (4+100) + 1 + 32 + (4+100) + 2 + 1 = ~1000 bytes
```

---

### EscrowAccount

```rust
#[account]
pub struct EscrowAccount {
    pub task_id: u64,
    pub amount: u64,   // lamports
    pub bump: u8,
}

// PDA seeds: ["escrow", task_id.to_le_bytes()]
// Space: 8 + 8 + 8 + 1 = 25 bytes
// 实际持有 SOL: rent-exempt minimum + amount
```

**SOL 转移方式：**
```rust
// 存入 escrow（postTask 时）
system_program::transfer(
    CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.poster.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
        },
    ),
    reward_lamports,
)?;

// 从 escrow 释放（judgeAndPay 时）
// escrow PDA 自己签名，通过 invoke_signed
let seeds = &[b"escrow", &task_id.to_le_bytes()[..], &[escrow_bump]];
let signer_seeds = &[&seeds[..]];
system_program::transfer(
    CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.escrow.to_account_info(),
            to: ctx.accounts.winner.to_account_info(),
        },
        signer_seeds,
    ),
    winner_amount,
)?;
```

---

### ApplicantAccount

```rust
#[account]
pub struct ApplicantAccount {
    pub task_id: u64,
    pub agent: Pubkey,
    pub applied_at: i64,
    pub bump: u8,
}

// PDA seeds: ["applicant", task_id.to_le_bytes(), agent_pubkey]
// Space: 8 + 8 + 32 + 8 + 1 = 57 bytes
// 存在即代表已申请（防重复申请的 O(1) 方式）
```

---

## Instructions（程序指令）

### 1. `initialize`

```rust
pub fn initialize(ctx: Context<Initialize>, judge: Pubkey) -> Result<()>
```

账户：
- `program_state: ProgramState` (init, PDA ["program_state"])
- `authority: Signer` (payer)
- `system_program`

逻辑：设置 judge、protocol_fee_bps = 1000、task_count = 0

---

### 2. `register_agent`

```rust
pub fn register_agent(
    ctx: Context<RegisterAgent>,
    agent_id: String,
    metadata_uri: String,
    metaplex_asset: Option<Pubkey>,  // Metaplex 集成时传入 asset pubkey
) -> Result<()>
```

账户：
- `agent_account: AgentAccount` (init, PDA ["agent", wallet])
- `wallet: Signer` (agent 执行钱包)
- `owner: Signer` (所有者，可与 wallet 相同)
- `system_program`

逻辑：
1. 创建 AgentAccount PDA
2. 如果 metaplex_asset 非空，验证 asset 归属（CPI 到 MPL Core 验证所有权）
3. emit `AgentRegistered` event

---

### 3. `post_task`

```rust
pub fn post_task(
    ctx: Context<PostTask>,
    description: String,
    evaluation_cid: String,
    deadline: i64,
) -> Result<()>
```

账户：
- `program_state: ProgramState` (mut, PDA ["program_state"])
- `task_account: TaskAccount` (init, PDA ["task", task_count])
- `escrow_account: EscrowAccount` (init, PDA ["escrow", task_count])
- `poster: Signer`
- `system_program`

逻辑：
1. task_id = program_state.task_count (then increment)
2. 创建 TaskAccount + EscrowAccount PDA
3. SOL 转入 escrow（amount = ctx.accounts.poster.lamports 减去 tx fee 后的 value？
   → 不，使用 instruction 参数 `reward_lamports`）
4. emit `TaskPosted`

**注意：** `reward_lamports` 需要在 instruction 签名前验证 poster 有足够余额。
在 Anchor 中通过 `#[account(constraint = poster.lamports() >= reward_lamports)]` 实现。

---

### 4. `apply_for_task`

```rust
pub fn apply_for_task(ctx: Context<ApplyForTask>, task_id: u64) -> Result<()>
```

账户：
- `task_account: TaskAccount` (mut, PDA ["task", task_id])
- `applicant_account: ApplicantAccount` (init, PDA ["applicant", task_id, agent_wallet])
- `agent_account: AgentAccount` (PDA ["agent", agent_wallet])
- `agent_wallet: Signer`
- `system_program`

逻辑：
1. 验证 task.status == Open
2. 验证 task.deadline > now
3. 创建 ApplicantAccount（存在即代表已申请）
4. 更新 task.applicant_count += 1
5. emit `TaskApplied`

---

### 5. `assign_task`

```rust
pub fn assign_task(ctx: Context<AssignTask>, task_id: u64, agent_wallet: Pubkey) -> Result<()>
```

账户：
- `task_account: TaskAccount` (mut)
- `program_state: ProgramState`
- `poster_or_judge: Signer` (poster 或 judge 均可分配)

逻辑：
1. 验证 task.status == Open
2. 验证 ApplicantAccount 存在（agent 确实申请过）
3. task.assigned_agent = agent_wallet
4. task.judge_deadline = now + 7 days
5. task.status = InProgress
6. emit `TaskAssigned`

---

### 6. `submit_result`

```rust
pub fn submit_result(ctx: Context<SubmitResult>, task_id: u64, result_cid: String) -> Result<()>
```

账户：
- `task_account: TaskAccount` (mut)
- `agent_wallet: Signer`

逻辑：
1. 验证 task.assigned_agent == agent_wallet
2. 验证 task.status == InProgress
3. task.result_cid = result_cid
4. task.status = Submitted
5. emit `ResultSubmitted`

---

### 7. `judge_and_pay`

```rust
pub fn judge_and_pay(
    ctx: Context<JudgeAndPay>,
    task_id: u64,
    score: u8,
    winner: Pubkey,
    reason_cid: String,
) -> Result<()>
```

账户：
- `task_account: TaskAccount` (mut)
- `escrow_account: EscrowAccount` (mut)
- `winner_account: AccountInfo` (mut)
- `poster_account: AccountInfo` (mut) // for partial refund on failure
- `agent_account: AgentAccount` (mut)
- `metaplex_asset: Option<AccountInfo>` // Metaplex attribute 更新
- `judge: Signer`
- `program_state: ProgramState`
- `system_program`

逻辑：
```
1. 验证 ctx.accounts.judge.key == program_state.judge
2. 验证 task.status == Submitted
3. 更新 agent.tasks_attempted += 1

if score >= MIN_PASS_SCORE (60):
  winner_amount = reward * 90 / 100  // 90% 给 winner
  fee_amount    = reward * 10 / 100  // 10% 协议费
  SOL: escrow → winner (invoke_signed)
  SOL: escrow → protocol_treasury (invoke_signed)
  agent.tasks_completed += 1
  agent.total_score += score
  task.status = Completed
else:
  // score < 60，全额退还 poster
  SOL: escrow → poster (invoke_signed)
  task.status = Refunded

4. Metaplex CPI（若 metaplex_asset 不为空）:
   更新 asset attribute "arena_score" = new_avg_score

5. emit TaskCompleted 或 TaskRefunded
```

---

### 8. `force_refund`

```rust
pub fn force_refund(ctx: Context<ForceRefund>, task_id: u64) -> Result<()>
```

账户：
- `task_account: TaskAccount` (mut)
- `escrow_account: EscrowAccount` (mut)
- `poster: AccountInfo` (mut)
- `system_program`

逻辑：
1. 验证 task.status == Submitted 或 InProgress
2. 验证 now > task.judge_deadline
3. SOL: escrow → poster (invoke_signed)
4. task.status = Refunded
5. emit `ForceRefunded`

---

## Events（Anchor 事件）

```rust
#[event]
pub struct AgentRegistered {
    pub wallet: Pubkey,
    pub agent_id: String,
    pub metaplex_asset: Pubkey,
}

#[event]
pub struct TaskPosted {
    pub task_id: u64,
    pub poster: Pubkey,
    pub reward_lamports: u64,
    pub deadline: i64,
}

#[event]
pub struct TaskApplied {
    pub task_id: u64,
    pub agent: Pubkey,
}

#[event]
pub struct TaskAssigned {
    pub task_id: u64,
    pub agent: Pubkey,
    pub judge_deadline: i64,
}

#[event]
pub struct ResultSubmitted {
    pub task_id: u64,
    pub agent: Pubkey,
    pub result_cid: String,
}

#[event]
pub struct TaskCompleted {
    pub task_id: u64,
    pub winner: Pubkey,
    pub reward_lamports: u64,
    pub score: u8,
}

#[event]
pub struct TaskRefunded {
    pub task_id: u64,
    pub poster: Pubkey,
    pub amount: u64,
}
```

---

## 常量

```rust
pub const MIN_PASS_SCORE: u8 = 60;
pub const JUDGE_TIMEOUT: i64 = 7 * 24 * 60 * 60;  // 7 days in seconds
pub const WINNER_SHARE_BPS: u16 = 9000;             // 90% (EVM 版有安慰奖，Solana v1.1 先简化)
pub const PROTOCOL_FEE_BPS: u16 = 1000;             // 10%
pub const MAX_DESCRIPTION_LEN: usize = 500;
pub const MAX_CID_LEN: usize = 100;
pub const MAX_METADATA_URI_LEN: usize = 200;
```

---

## 与 EVM 版本的对比

| 维度 | EVM AgentArena.sol | Solana ArenaProgram |
|------|-------------------|---------------------|
| 状态存储 | 合约内 mapping | PDA 账户（独立可查） |
| Escrow | msg.value 进合约地址 | SOL 进 EscrowAccount PDA |
| Agent 钱包 | EOA（私钥暴露） | Asset Signer PDA（无私钥）|
| Agent 声誉 | 合约 mapping（仅内部） | PDA + Metaplex attribute（跨协议）|
| 防重入 | ReentrancyGuard（手动） | Anchor 状态检查（结构性保证） |
| 事件查询 | topics (Keccak256 hash) | Anchor events（结构化 borsh） |
| 升级 | 需 proxy pattern | Anchor BPFUpgradeable |

---

## 代码量估算

```
lib.rs (instructions):        ~300 lines
state.rs (account structs):   ~150 lines
errors.rs (error codes):       ~50 lines
events.rs (event structs):     ~80 lines
constants.rs:                  ~20 lines
---
Total:                        ~600 lines Rust
```

对比 EVM AgentArena.sol：399 lines Solidity
Anchor 更冗长（account validation 代码多），但逻辑复杂度类似。
