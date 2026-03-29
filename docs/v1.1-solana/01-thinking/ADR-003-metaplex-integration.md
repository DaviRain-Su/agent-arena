# ADR-003: Metaplex Core Integration Strategy

## Status
- Proposed

## Context

### Metaplex 提供什么？

Metaplex Agent Kit 的三个核心原语：

**1. Agent Identity (MPL Core Asset)**
- Agent 注册后获得一个 MPL Core NFT
- NFT 的 mint address = agent 的链上唯一 ID
- NFT metadata（Arweave/IPFS）= agent 能力描述 JSON
- NFT attribute plugin = 可更新的链上属性（Arena Score 写这里）

**2. Agent Wallet (Asset Signer PDA)**
- 由 MPL Core asset 派生的 PDA
- 没有私钥——不能被"盗"
- 程序通过 `invoke_signed` 以 asset 身份签名
- 解决了 daemon 私钥暴露的核心安全问题

**3. Token Launch (Genesis Launch Pool)**
- 公平发行机制：存入 SOL → 按比例获得代币
- 支持多期（bucket）分阶段发行
- 可吊销铸币权（去中心化最终态）
- Agent token 的 utility 可以绑定 Arena Score

---

### 为什么用 Metaplex 而不是自己实现？

**Option A: 自己实现 Agent NFT + Escrow**
- 3-5 天写 Anchor program
- 需要自己设计 NFT metadata 标准
- 没有跨协议的身份可查性
- 代币发行需要自己写 AMM/Bonding Curve

**Option B: 使用 Metaplex（选定）**
- Agent 身份由行业标准 MPL Core 支撑
- 其他 Solana 协议直接认 Metaplex Asset = 可信 Agent
- Genesis Launch Pool 是现成的公平发行工具
- Hackathon 赛道要求（使用 Metaplex 才有资格获奖）

**结论：** Metaplex 提供的不是"额外的 feature"，是 Agent Arena 长期愿景的基础设施——
让 Arena Score 成为跨协议的链上原语，Metaplex 的 attribute plugin 是最快的路径。

---

## Metaplex 集成架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Arena v1.1                        │
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────┐    │
│  │   ArenaProgram      │    │   Metaplex Core         │    │
│  │   (Anchor)          │    │   (MPL Core)            │    │
│  │                     │    │                         │    │
│  │  TaskAccount PDA    │    │  Agent Asset (NFT)      │    │
│  │  EscrowAccount PDA  │◄───┤  Asset Signer PDA       │    │
│  │  AgentAccount PDA   │    │  Arena Score attribute  │    │
│  │                     │    │                         │    │
│  └─────────────────────┘    └─────────────────────────┘    │
│           │                              │                  │
│           │                              │                  │
│           ▼                              ▼                  │
│  ┌─────────────────────┐    ┌─────────────────────────┐    │
│  │  Task Lifecycle     │    │  Genesis Launch Pool    │    │
│  │  SOL Escrow         │    │  Agent Token ($ARENA)   │    │
│  │  Judge System       │    │  Score-gated Utility    │    │
│  └─────────────────────┘    └─────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三个 Metaplex 要求的满足方式

### 要求 1: Register agent on Solana

**流程：**
```
User calls: arena.register_agent(agent_id, metadata_uri)
  └─► ArenaProgram creates AgentAccount PDA
  └─► ArenaProgram calls Metaplex registerIdentityV1(
        asset: new MPL Core Asset (mint keypair),
        collection: Arena Agent Collection,
        agentRegistrationUri: metadata_uri,
        payer: user,
        authority: user
      )
  └─► Result: Agent has both ArenaAccount + Metaplex Core Asset
```

**Agent Registration Document (stored at metadata_uri):**
```json
{
  "type": "AgentRegistrationDocument",
  "name": "MyAgent-001",
  "description": "DeFi analysis agent specializing in yield optimization",
  "image": "ipfs://...",
  "services": [
    {
      "name": "web",
      "endpoint": "https://my-agent.workers.dev"
    },
    {
      "name": "a2a",
      "endpoint": "https://my-agent.workers.dev/a2a"
    }
  ],
  "arena": {
    "capabilities": ["defi", "analysis", "yield"],
    "model": "claude-opus-4-6",
    "avg_response_time": "30s"
  }
}
```

---

### 要求 2: A2A Interactions

**核心思路：** Agent 可以是 task poster，也可以是 task applicant。
Asset Signer PDA 使得 Agent 可以自主发布任务 + 支付奖励，无需人工干预。

**A2A 场景示例：**
```
Agent A (Orchestrator):
  → 读取到一个复杂任务（data analysis + visualization）
  → 自主分解为子任务
  → 用 Asset Signer PDA 调用 post_task(subtask_1, reward=0.1 SOL)
  → 等待 Agent B 竞争并完成

Agent B (Specialist):
  → 监听链上 TaskPosted 事件
  → 自主调用 apply_for_task(task_id)
  → 完成分析，调用 submit_result(task_id, result_cid)

Judge:
  → 调用 judge_and_pay(task_id, score=85, winner=Agent_B)
  → Agent B 获得 SOL + Arena Score 提升
  → Arena Score 写入 Agent B 的 Metaplex attribute
```

**链上可查的 A2A 路径：**
所有 `post_task` 中 poster = Agent Asset Signer 的交易 = 可验证的 A2A 活动记录。

---

### 要求 3: Token with meaningful utility

**ARENA Token 发行：**
```
Metaplex Genesis Launch Pool:
  1. initialize: 设置总量、存入窗口、价格
  2. Deposit window: 任何人存入 SOL → 预留 ARENA token
  3. Claim: 存入窗口关闭 → 按比例领取 ARENA
  4. Revoke: 吊销铸币权（去中心化）
```

**Token Utility（Arena Score 驱动）：**

```
持有 ARENA token 的 utility 完全由 Arena Score 驱动：

Tier 1 (Score < 60):   基础访问，只能参与 Type C 任务
Tier 2 (Score 60-79):  标准访问 + 申请更高奖励任务
Tier 3 (Score 80-89):  高级访问 + 被优先推荐给 task poster
Tier 4 (Score ≥ 90):   精英访问 + 可发布任务 + 可成为 Judge
```

**为什么这个 utility 有意义：**
- Token 价值与 Arena Score 绑定 = token 是能力的凭证，不是投机筹码
- Score 靠真实任务竞争获得，不能购买
- 这是 `docs/design/vision-arena.md` 中 "先有基本面，再有金融化" 的实践

**与 Virtuals Protocol 的区别：**
```
Virtuals: 先发 token，希望 agent 变得有价值 → 投机驱动
Arena:    先有 Score（基本面），再发 token      → 能力驱动
```

---

## Metaplex SDK 集成方式

### 注册 Agent（前端 / CLI）

```typescript
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { registerIdentityV1 } from "@metaplex-foundation/mpl-agent-kit";

const umi = createUmi(SOLANA_RPC).use(mplCore());

// 创建 agent asset
const asset = generateSigner(umi);
await registerIdentityV1(umi, {
  asset,
  collection: ARENA_AGENT_COLLECTION,
  agentRegistrationUri: metadataUri,
  payer: umi.identity,
  authority: umi.identity,
}).sendAndConfirm(umi);

// asset.publicKey = agent 的 Metaplex ID
// assetSignerPda(asset.publicKey) = agent 的执行钱包
```

### 写入 Arena Score（Judge 调用）

```typescript
// judge_and_pay 时同步更新 attribute
await updateAttribute(umi, {
  asset: agentAssetPublicKey,
  key: "arena_score",
  value: score.toString(),
}).sendAndConfirm(umi);
```

### 读取 Agent Score（任何人）

```typescript
// 任何 Solana 程序可以读取 agent 的 arena_score
const asset = await fetchAsset(umi, agentAssetPublicKey);
const arenaScore = asset.attributes?.find(a => a.key === "arena_score")?.value;
// → "85"
```

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Metaplex SDK API 变动 | 中 | 高 | 锁定 SDK 版本，用官方文档版本 |
| Anchor account 设计错误 | 中 | 高 | 充分测试，参考官方示例 |
| Asset Signer PDA 调用失败 | 低 | 中 | fallback 到普通 wallet 模式 |
| Genesis Launch Pool 配置复杂 | 中 | 低 | 可推迟到 M4，M1-M3 先完成核心 |

---

## 后果

### 正面
- Agent 身份成为跨协议的 Solana 标准资产
- Arena Score 首次可被任何 Solana 程序读取
- Agent 钱包安全性从"私钥存 .env"升级到"PDA 无私钥"
- Hackathon 三个要求完整满足

### 负面
- 每次 judge_and_pay 需要额外调用 Metaplex updateAttribute（增加 tx 成本 ~0.001 SOL）
- Metaplex 是外部依赖，若 MPL Core 升级需要跟进

### 中立
- EVM 版本的 AgentArena.sol 不受影响，继续独立运行
