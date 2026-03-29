# Metaplex Hackathon 实施计划

## 目标

**在 Metaplex Agents Track 获奖，同时建立 Agent Arena v1.1 Solana 的基础。**

三个硬性要求：
1. ✅ Create and register an agent on Solana (Metaplex)
2. ✅ Demonstrate A2A interactions between agent wallets
3. ✅ Launch a token and create meaningful token utility

---

## 提交物清单

- [ ] GitHub repo（公开，含 Anchor program + demo 脚本）
- [ ] X 文章（解释 build，含 program ID、demo 链接）
- [ ] Demo 视频（3-5 分钟，走完完整流程）
- [ ] Deployed program on Solana Mainnet（或 Devnet 如果 mainnet 有风险）

---

## 7 天计划

### Day 1-2: Anchor Program 核心框架

**目标：** `anchor build` 通过，基础 Account 结构完成

**工作内容：**
```bash
anchor init arena-solana
# 创建以下文件：
#   programs/arena/src/lib.rs          (instructions)
#   programs/arena/src/state/mod.rs    (account structs)
#   programs/arena/src/errors.rs
#   programs/arena/src/constants.rs
```

**完成标准：**
- [ ] `ProgramState`, `AgentAccount`, `TaskAccount`, `EscrowAccount`, `ApplicantAccount` 结构定义完成
- [ ] `initialize` instruction 可执行
- [ ] `register_agent` instruction 可执行（不含 Metaplex CPI，先跳过）
- [ ] `anchor test` 基础测试通过

---

### Day 3: 任务完整生命周期

**目标：** postTask → apply → assign → submit → judgeAndPay E2E 通过

**完成标准：**
- [ ] `post_task`（含 SOL escrow 转移）可执行
- [ ] `apply_for_task`（ApplicantAccount 防重复）可执行
- [ ] `assign_task`（状态机转换）可执行
- [ ] `submit_result`可执行
- [ ] `judge_and_pay`（escrow → winner，含 `invoke_signed`）可执行
- [ ] `force_refund` 可执行
- [ ] `anchor test` E2E 测试全部通过
- [ ] 部署到 Devnet，记录 program ID

---

### Day 4: Metaplex Core 集成

**目标：** Agent 注册绑定 MPL Core Asset，judge_and_pay 更新 attribute

**工作内容：**
```rust
// 在 register_agent 中增加 Metaplex CPI
// 在 judge_and_pay 中增加 updateAttribute CPI
```

**关键依赖：**
```toml
# Cargo.toml
mpl-core = { version = "0.7", features = ["cpi"] }
mpl-agent-kit = { git = "https://github.com/metaplex-foundation/mpl-agent-kit" }
```

**完成标准：**
- [ ] 注册 agent 时，Metaplex Core Asset 被创建
- [ ] judge_and_pay 后，MPL Core attribute "arena_score" 更新成功
- [ ] 通过 Metaplex API 查询 agent，`arena_score` attribute 可读
- [ ] Devnet E2E 测试通过（含 Metaplex 调用）

---

### Day 5: Genesis Launch Pool + A2A Demo 脚本

**上午：Token Launch**

```typescript
// scripts/launch-arena-token.ts
// 1. 创建一个高 Score agent
// 2. 用 Metaplex Genesis Launch Pool 发行 AGENT_TOKEN
// 3. 演示 token utility gating
```

**完成标准：**
- [ ] Genesis Launch Pool 初始化成功
- [ ] 可以存入 SOL 预留代币
- [ ] 代币可以 claim

**下午：A2A Demo 脚本**

```typescript
// scripts/a2a-demo.ts
// 展示：
// 1. Agent A（Orchestrator）注册
// 2. Agent B（Specialist）注册
// 3. Agent A 用 Asset Signer PDA 发布子任务
// 4. Agent B 自主申请并完成任务
// 5. Judge 评分，双 Agent 声誉更新
// 6. 链上可查 A2A 交互记录
```

**完成标准：**
- [ ] A2A 完整流程链上有交易记录
- [ ] 两个 Agent 的 Metaplex attribute 都更新了
- [ ] 脚本有清晰的 console 输出（方便录视频）

---

### Day 6: 前端适配 + 文档

**前端（最小改动）：**
- [ ] 增加 Solana 钱包连接（@solana/wallet-adapter-react）
- [ ] 增加简单的 Chain Switcher（EVM / Solana）
- [ ] Solana 任务列表（从 Indexer 读，加 chain=solana 过滤）
- [ ] Agent 注册页支持 Solana（调用 ArenaProgram + Metaplex）

**Indexer 扩展（最小改动）：**
- [ ] 增加 Solana 事件监听（轮询 Solana RPC transaction logs）
- [ ] D1 tasks/agents 加 chain 字段
- [ ] `/tasks?chain=solana` 端点

**文档：**
- [ ] README 更新（加 Solana program ID，加 Metaplex 集成说明）
- [ ] `docs/v1.1-solana/` 文档完善（本文档）

---

### Day 7: 测试 + X 文章 + 视频录制

**上午：最终测试**
- [ ] Mainnet 部署（或确认用 Devnet）
- [ ] A2A demo 脚本在目标网络跑通
- [ ] Token launch 在目标网络跑通

**下午：提交物**
- [ ] X 文章（中英文，含截图/视频）
- [ ] 视频录制（3-5 分钟）

---

## X 文章大纲

```
标题：Building the Capability Layer for AI Agents on Solana

1. 问题 (1段)
   AI agents 需要 verifiable on-chain identity 才能参与经济活动

2. 解法 (2段)
   Agent Arena = capability verification protocol
   Metaplex Core = identity primitive for agents

3. Demo (3段，含截图)
   - Agent 注册到 Solana + Metaplex
   - A2A task market（Agent 互相雇佣）
   - Token launch（Arena Score → 代币化）

4. 技术亮点 (2段)
   - Asset Signer PDA（无私钥 agent 钱包）
   - Arena Score 写入 MPL Core attribute（跨协议可查）

5. 链接
   - GitHub: agent-arena repo
   - Program ID: Arena1...（Devnet/Mainnet）
   - Live Demo: agent-arena.vercel.app
```

---

## 技术栈

```
Anchor:  0.30.x
Solana:  1.18.x
Metaplex MPL Core: 0.7.x
Metaplex Agent Kit: latest
UMI: latest

Frontend:
  @solana/wallet-adapter-react
  @metaplex-foundation/umi-bundle-defaults
  @metaplex-foundation/mpl-core
  @metaplex-foundation/mpl-agent-kit

Test:
  anchor test (mocha + chai)
  @solana/web3.js
```

---

## 关键风险

| 风险 | 缓解 |
|------|------|
| Anchor PDA Escrow 设计错误 | Day 1 先写测试，从小到大验证 |
| Metaplex CPI 调用失败 | 先单独测 Metaplex，再集成 |
| Genesis Launch Pool 配置复杂 | Day 5 如果进度落后，先跳过，用简单 Token mint 代替 |
| Mainnet 部署失败（SOL 不够） | 准备 2 SOL 以上，Devnet 先全测 |
| 时间不够 | 优先级：Core Program > Metaplex > A2A Demo > Token > Frontend |

---

## 最低可接受提交（如果时间紧）

按优先级，任何阶段时间不够可以缩减：

**必须：**
- Anchor Program Devnet 部署（program ID）
- Metaplex agent 注册（满足要求 1）
- A2A 链上记录（满足要求 2，哪怕只是两笔 tx）
- Token 发行（满足要求 3，哪怕用简单 SPL token）

**可裁剪：**
- ❌ 前端 Solana 集成（X 文章截图 demo 代替）
- ❌ Indexer Solana 扩展（手动查链代替）
- ❌ Genesis Launch Pool（用 spl-token create-token 代替）
