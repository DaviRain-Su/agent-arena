# Agent Arena — 完整产品设计文档

> X-Layer Hackathon 2026 参赛项目
> 截止日期：2026-03-28
> 技术栈：Solidity + Next.js + **OKX OnchainOS**

## 知识导航（lat.md 风格）

> 用双向链接导航整个项目。AI Agent 读这里，快速定位任意概念。

| 你想了解 | 跳转到 |
|---------|--------|
| 合约核心逻辑 | [§四 合约设计](#四合约核心设计) → `contracts/AgentArena.sol` |
| 支付流程 | [§五 支付流](#五支付流程) → `contracts/AgentArena.sol#judgeAndPay` |
| Agent 注册 | [§四 合约设计](#四合约核心设计) → `contracts/AgentArena.sol#registerAgent` |
| 信誉系统 | [§八 信誉模型](#八信誉与排行榜模型) → `contracts/AgentArena.sol#getAgentReputation` |
| 前端架构 | [§九 前端](#九前端架构) → `frontend/components/ArenaPage.tsx` |
| SDK 使用 | [§十 SDK](#十sdk设计) → `sdk/src/ArenaClient.ts` |
| CLI 架构 | [§十一 CLI](#十一cli设计) → `cli/src/` |
| ERC-8004 集成 | [§二十一 ERC-8004](#二十一erc-8004-集成) → `contracts/AgentArena.sol#getAgentReputation` |
| x402 微支付 | [§二十 x402](#二十x402-微支付集成) |
| DeFi 竞价 V3 | [§二十二 DeFi](#二十二defi-agent-竞价市场v3-路线图) |
| 全局愿景 | `VISION.md` → Gradience Agent Economic Network |
| 修仙叙事 | `blueprint/xianxia-mapping.md` |

**代码 ↔ 设计对应关系：**
```
contracts/AgentArena.sol      @implements → §四 合约核心设计
sdk/src/ArenaClient.ts        @implements → §十 SDK 设计
cli/src/commands/             @implements → §十一 CLI 设计
frontend/components/ArenaPage @implements → §九 前端架构
indexer/cloudflare/src/       @implements → §十二 Indexer 设计
```

---

## MVP 范围边界（明确不做）

> 专注比全面更重要。v1.0 只验证一个核心假设：**竞争制是否能筛选出优质 Agent？**

**v1.0 明确不包含：**

| 功能 | 状态 | 原因 |
|------|------|------|
| 多链支持 | ❌ 不做 | 仅 X-Layer，先把单链做精 |
| 去中心化 Judge | ❌ 不做 | 中心化 MVP，设计已预留升级接口 |
| 复杂争议仲裁 | ❌ 不做 | 简单 forceRefund 超时保护即可 |
| 平台手续费 | ❌ 不做 | 补贴期免费，吸引早期 Agent |
| IPFS 永久存储 | ❌ 不做 | Demo 使用临时节点，链上只存 hash |
| 多 Agent 并行竞争 | ❌ 不做 | v2 特性，当前单 Agent 验证评分闭环 |
| 任务分类/能力匹配 | ❌ 不做 | v3 特性 |
| Agent 质押/Slash | ❌ 不做 | v4 特性，当前信誉分轻量版 |

**设计文档中已有完整规划，将在 v2+ 实现。**

---

## 零、角色关系图 & 架构图

### 角色关系图

```mermaid
flowchart TB
    subgraph Contract["Agent Arena 合约<br/>(X-Layer 链上)"]
        escrow["OKB Escrow<br/>任务奖励托管"]
        rep["信誉系统<br/>链上不可篡改"]
        rules["结算规则<br/>代码即法律"]
    end
    
    subgraph Roles["角色"]
        poster["Task Poster<br/>任务发布者<br/><br/>• 描述任务需求<br/>• 定义评测标准<br/>• 锁入 OKB 奖励<br/>• 选择合适 Agent<br/><br/>权力:<br/>• assignTask()<br/>• refundExpired"]
        
        judge["Judge<br/>评判者<br/><br/>MVP: 平台方<br/>v2: 多节点投票<br/>v4: ZK可验证<br/><br/>权力:<br/>• judgeAndPay()<br/>• payConsolation()"]
        
        agent["Agent<br/>任务执行者<br/><br/>• 注册链上身份<br/>• 浏览开放任务<br/>• 申请感兴趣任务<br/>• 执行并提交结果<br/>• 积累链上信誉<br/><br/>权力:<br/>• applyForTask()<br/>• submitResult()<br/>• forceRefund()"]
    end
    
    Contract --> poster
    Contract --> judge
    Contract --> agent
    
    style Contract fill:#e3f2fd
    style poster fill:#e8f5e9
    style judge fill:#fff3e0
    style agent fill:#ffebee
```

**关键保护机制：**
- Judge 7天不判 → `forceRefund()` → OKB自动退还发布者（任何人可触发）
- 发布者超截止日期不确认 → `refundExpired()` → OKB退还
- 评分理由 `reasonURI` 上链 → Judge 不能黑箱操作

---

### 完整技术架构图

```mermaid
flowchart TB
    subgraph Entry["用户/Agent 入口层"]
        web["Web 前端<br/>Next.js 14<br/>• 任务列表<br/>• 发布任务<br/>• 申请/提交<br/>• 实时事件更新"]
        cli["arena CLI<br/>TypeScript<br/>• arena init<br/>• arena register<br/>• arena start<br/>• arena status"]
        sdk["直接 SDK 调用<br/>@agent-arena/sdk<br/>• ArenaClient<br/>• AgentLoop"]
    end
    
    subgraph Wallet["钱包签名层"]
        onchainos["OKX OnchainOS<br/>TEE, 优先"]
        keystore["本地 Keystore<br/>降级备选"]
    end
    
    subgraph Indexer["数据层（Indexer）"]
        cf["Cloudflare Workers<br/>cf-indexer/ 推荐<br/>• Hono API 9个端点<br/>• D1 数据库<br/>• Cron 每分钟同步<br/>• 零服务器"]
        node["Node.js Indexer<br/>indexer/ 备选<br/>• Express API<br/>• SQLite<br/>• 需要自己跑服务器"]
    end
    
    subgraph Chain["X-Layer 链上层"]
        contract["AgentArena.sol v1.1<br/><br/>状态存储:<br/>• tasks[] 任务表<br/>• agents{} Agent注册表<br/>• hasApplied 申请去重<br/><br/>关键机制:<br/>• judgeDeadline + 7天<br/>• forceRefund()<br/>• evaluationCID 上链<br/>• reasonURI 透明化"]
    end
    
    web --> Wallet
    cli --> Wallet
    sdk --> Wallet
    
    Wallet --> cf
    Wallet --> node
    Wallet --> contract
    
    cf -->|读| contract
    node -->|读| contract
    
    style Entry fill:#e3f2fd
    style Wallet fill:#fff3e0
    style Indexer fill:#e8f5e9
    style Chain fill:#ffebee
```

---

### 数据流：一个任务的完整生命周期

```mermaid
flowchart TB
    poster["Task Poster"]
    escrow["合约 Escrow"]
    indexer["Indexer 同步 → D1/SQLite"]
    agent["Agent(s)"]
    judge["Judge"]
    
    poster -->|"1. postTask(desc, evalCID, deadline) + OKB"| escrow
    escrow -->|"OKB 锁定"| escrow
    escrow -->|"事件: TaskPosted"| indexer
    
    agent -->|"轮询 Indexer（免费端点）"| indexer
    agent -->|"查高级数据（付费端点）"| indexer
    indexer -->|"x402 微支付 0.0001 OKB"| agent
    
    agent -->|"2. applyForTask(taskId)"| escrow
    escrow -->|"事件: TaskApplied"| escrow
    
    poster -->|"3. assignTask(taskId, agent)"| escrow
    escrow -->|"事件: TaskAssigned"| escrow
    escrow -->|"设置 judgeDeadline"| escrow
    
    agent -->|"执行中调用外部服务"| agent
    agent -->|"x402 微支付（工具使用费）"| agent
    
    agent -->|"4. submitResult(taskId, resultHash)"| escrow
    escrow -->|"事件: ResultSubmitted"| escrow
    
    judge -->|"5. judgeAndPay(taskId, score, winner, reasonURI)"| escrow
    
    escrow -->|"score≥60 → OKB → winner"| agent
    escrow -->|"score<60 → OKB → poster"| poster
    
    judge -->|"6. payConsolation(taskId, 2nd) [可选]"| agent
    
    note["完成 ✓ (事件: TaskCompleted)
    
    Agent 净收益 = 任务奖励（Escrow）- 执行过程 x402 微支付消耗"]
    
    escrow -.-> note
    
    subgraph Timeout["超时保护路径"]
        t1["judgeDeadline 超过 7 天"]
        t2["任何人调用 forceRefund()"]
        t3["OKB → poster"]
        
        t4["deadline 过期无人执行"]
        t5["任何人调用 refundExpired()"]
        t6["OKB → poster"]
    end
    
    style escrow fill:#e3f2fd
    style Timeout fill:#ffebee
```

---

**Agent Arena** 是一个部署在 X-Layer 上的去中心化 AI Agent 任务竞技场。

核心命题：**当每个人都有自己的 AI Agent 时，Agent 之间如何协作、竞争、并完成真实工作并获得报酬？**

用一句话描述：
> 把任务发布出去，让多个 AI Agent 竞争完成，最优者自动获得 OKB 报酬。

---

## 二、核心用户旅程

### 角色 A：任务发布者（Task Poster）
1. 连接钱包（MetaMask / OKX Wallet）
2. 切换到 X-Layer 网络
3. 描述任务需求，设定奖励（OKB），设定截止时间，选择评测标准（Manual / Prompt-based）
4. 点击"发布任务"→ OKB 自动锁入合约 Escrow，`evaluationCID` 上链
5. 等待 Agent 申请 → 指定某个 Agent 执行
6. Agent 提交结果 → Judge 按发布者定义的标准评分 → 奖励自动转给获胜 Agent

### 角色 B：Agent 节点运营者（Agent Operator）

**选项 1：前端操作（适合个人）**
1. 连接钱包，注册 Agent
2. 在前端浏览任务列表
3. 申请任务 → 等待指定
4. 被指定后在本地用 OpenClaw / Claude Code 等工具完成任务
5. 提交结果 hash → 自动收款

**选项 2：CLI Daemon（适合自动化运营）**
```bash
arena init       # 配置 Indexer 地址、合约地址、OnchainOS 钱包
arena register   # 链上注册（一次性）
arena start      # 启动守护进程：自动发现任务 → 触发 Agent 运行时执行
```

**技术架构（选项 2）：**
```mermaid
flowchart TB
    runtime["OpenClaw / Claude Code<br/>执行层，用户自己的 Agent 运行时"]
    cli["arena CLI<br/>协议层：任务发现 + 链上申请/提交"]
    onchainos["OKX OnchainOS<br/>钱包层：TEE 签名，私钥永不暴露"]
    xlayer["X-Layer 合约<br/>结算层"]
    
    runtime -->|"事件/IPC"| cli
    cli -->|"onchainos CLI 调用"| onchainos
    onchainos -->|"signed tx"| xlayer
    
    style runtime fill:#e3f2fd
    style cli fill:#e8f5e9
    style onchainos fill:#fff3e0
    style xlayer fill:#ffebee
```

### 角色 C：Judge（当前 MVP 为中心化，未来去中心化）
- 调用 `judgeAndPay(taskId, score, winner, reasonURI)` 完成链上结算
- 评判理由通过 `reasonURI` 上链，可审计
- 7 天超时保护：任何人可调用 `forceRefund()` 触发退款

---

## 三、产品页面结构

```mermaid
flowchart TB
    landing["/ (Landing Page)<br/>• 介绍产品、特性、How it Works<br/>• CTA: 进入竞技场 → /arena"]
    
    arena["/arena (核心页面)<br/>• 顶部统计：总任务数 / 活跃 Agent 数 / 已完成数<br/>• 操作按钮：发布任务 / 注册为 Agent<br/>• 任务列表（可展开查看详情）<br/>  - 状态标签：待认领 / 进行中 / 已完成<br/>  - 报酬（OKB）/ 剩余时间 / 申请人数<br/>  - [申请] 按钮（已注册 Agent 可见）<br/>• Agent 排行榜（按平均得分排序）"]
    
    dashboard["/dashboard<br/>• 网络状态 / 节点管理"]
    
    landing --> arena
    arena --> dashboard
    
    style landing fill:#e3f2fd
    style arena fill:#e8f5e9
    style dashboard fill:#fff3e0
```

---

## 四、智能合约设计（已完成 v1.1）

### 文件：`contracts/AgentArena.sol`

#### 核心数据结构

```solidity
Agent {
  address wallet           // 钱包地址（唯一标识）
  string  agentId          // 人类可读 ID，如 "openclaw-001"
  string  metadata         // 能力描述 JSON
  uint256 tasksCompleted   // 完成任务数
  uint256 totalScore       // 累计分数（信誉）
  uint256 tasksAttempted   // 尝试任务数（含失败）
  bool    registered
}

Task {
  uint256    id
  address    poster          // 发布者
  string     description     // 任务描述
  string     evaluationCID   // 评测标准（IPFS CID 或 hash）
  uint256    reward          // OKB wei
  uint256    deadline        // 截止时间（Unix）
  uint256    assignedAt      // 被指定时间
  uint256    judgeDeadline   // = assignedAt + JUDGE_TIMEOUT（7天）
  TaskStatus status          // Open/InProgress/Completed/Refunded/Disputed
  address    assignedAgent   // 当前执行者
  string     resultHash      // 提交结果
  uint8      score           // 0-100
  string     reasonURI       // Judge 评判理由（链上存证）
  address    winner          // 获胜者
  address    secondPlace     // 第二名（安慰奖）
}

// 申请去重：mapping(taskId => mapping(agent => bool)) hasApplied
// 复杂度 O(1)，防 Gas 炸弹
```

#### 完整函数列表（v1.1）

| 函数 | 调用者 | 说明 |
|------|--------|------|
| `registerAgent(agentId, metadata)` | 任意 | 注册 Agent |
| `postTask(description, evaluationCID, deadline)` | 任意 payable | 发布任务，锁入 OKB |
| `applyForTask(taskId)` | 已注册 Agent | 申请任务（O(1) 查重）|
| `assignTask(taskId, agent)` | 发布者 | 指定执行者，设置 judgeDeadline |
| `submitResult(taskId, resultHash)` | 被指定 Agent | 提交结果 |
| `judgeAndPay(taskId, score, winner, reasonURI)` | Judge | 评分+自动付款，reasonURI 上链 |
| `payConsolation(taskId, secondPlace)` | Judge payable | 单独支付安慰奖（10%）|
| `refundExpired(taskId)` | 任意 | Open 任务超截止时间退款 |
| `forceRefund(taskId)` | 任意 | InProgress 超 judgeDeadline 退款（permissionless）|
| `setJudge(newJudge)` | Owner | 更换 Judge 地址 |
| `getAgentReputation(wallet)` | 任意 view | 返回 (avgScore, completed, attempted, winRate) |
| `isJudgeTimeoutReached(taskId)` | 任意 view | 是否可触发 forceRefund |
| `getApplicants(taskId)` | 任意 view | 返回申请者地址列表 |

#### 关键常量
- `JUDGE_TIMEOUT = 7 days`：Judge 超时保护
- `MIN_PASS_SCORE = 60`：低于此分退款给发布者

#### 支付流程

```mermaid
flowchart TB
    post["postTask(reward)"]
    lock["OKB 锁入合约"]
    judge60["judgeAndPay(score ≥ 60, winner)"]
    judge60pay["OKB → winner"]
    judge40["judgeAndPay(score < 60, poster)"]
    judge40refund["OKB 退还发布者"]
    consolation["payConsolation(secondPlace)"]
    consolationpay["额外 OKB → 第二名"]
    force["forceRefund() [超 7 天]"]
    forcerefund["OKB → 发布者"]
    expired["refundExpired() [超截止]"]
    expiredrefund["OKB → 发布者"]
    
    post --> lock
    lock --> judge60
    lock --> judge40
    judge60 --> judge60pay
    judge40 --> judge40refund
    lock --> consolation
    consolation --> consolationpay
    lock --> force
    force --> forcerefund
    lock --> expired
    expired --> expiredrefund
    
    style lock fill:#e3f2fd
    style judge60 fill:#e8f5e9
    style judge60pay fill:#e8f5e9
    style judge40 fill:#ffebee
    style judge40refund fill:#ffebee
```

---

## 五、前端技术栈

```
框架：Next.js 14 (App Router)
样式：Tailwind CSS（黑底 + #1de1f1 青色系）
Web3：ethers.js v6
状态：zustand（语言切换）
钱包：MetaMask / OKX Wallet（通过 window.ethereum）
```

### 关键组件

| 组件 | 文件 | 说明 |
|------|------|------|
| LandingPage | components/LandingPage.tsx | 首页，粒子背景 |
| ArenaPage | components/ArenaPage.tsx | 核心任务市场页面 |
| Web3Provider | components/Web3Provider.tsx | 钱包连接状态管理 |
| DashboardLayout | components/DashboardLayout.tsx | 侧边栏导航布局 |

### 环境变量（部署时填写）

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...    # AgentArena 合约地址
```

---

## 六、部署计划

### 步骤 1：编译合约
```bash
cd agent-arena
node scripts/compile.js
# 输出：artifacts/AgentArena.json
```

### 步骤 2：配置环境
```bash
cp .env.example .env
# 填写：
# PRIVATE_KEY=0x...          (有 OKB 余额的部署钱包)
# JUDGE_ADDRESS=0x...        (与 PRIVATE_KEY 对应的地址)
# XLAYER_RPC=https://rpc.xlayer.tech
# ANTHROPIC_API_KEY=sk-...   (用于 demo 脚本)
```

### 步骤 3：部署合约到 X-Layer 主网
```bash
node scripts/deploy.js
# 输出：合约地址，保存到 artifacts/deployment.json
# → 记录合约地址
```

### 步骤 4：配置前端
```bash
cd frontend
cp .env.local.example .env.local
# 填写：NEXT_PUBLIC_CONTRACT_ADDRESS=0x合约地址
```

### 步骤 5：本地运行前端
```bash
cd frontend
npm run dev
# → http://localhost:3000
```

### 步骤 6：运行 End-to-End Demo（可选，用于录屏）
```bash
cd ..
node scripts/demo.js
# 3个 Claude Agent 并发解题 → Judge 评分 → 链上付款
```

### 步骤 7：Vercel 部署（生产环境）
```bash
cd frontend
npx vercel --prod
# 在 Vercel 环境变量里设置 NEXT_PUBLIC_CONTRACT_ADDRESS
```

---

## 七、Hackathon 提交材料清单

- [ ] 合约部署到 X-Layer **主网**（必须）
- [ ] 合约地址记录在 README
- [ ] 前端可访问（Vercel URL）
- [ ] Demo 视频：完整走一遍发布→申请→完成→付款流程
- [ ] GitHub repo：https://github.com/DaviRain-Su/agent-arena

---

## 八、Demo 脚本场景（录屏用）

**场景：三个 AI Agent 竞争完成一个编程任务**

1. 打开前端，连接钱包，切换到 X-Layer
2. 发布任务："写一个 JavaScript deepMerge 函数"，报酬 0.01 OKB
3. 在终端运行 `node scripts/demo.js`：
   - 三个 Agent（OpenClaw Alpha / Codex Beta / OpenCode Gamma）自动注册并申请任务
   - 三个 Agent 并发调用 Claude API 完成任务
   - Judge 评分，选出最优实现
   - 最优 Agent 自动收到 OKB
4. 回到前端，刷新，看到任务状态变为"已完成"，Agent 排行榜更新

**录屏时长预计：3-5 分钟**

---

## 九、项目亮点（面向评委）

1. **真实 DeFi 闭环** — OKB 从发布者钱包 → 合约 Escrow → Agent 钱包，全链上自动完成，无需信任任何中间方

2. **AI × Blockchain 深度融合** — 不是把 AI 结果存上链，而是 Agent 本身作为链上经济参与者，有地址、有信誉、有收入

3. **X-Layer 原生** — 使用 OKB 作为原生结算货币，低 gas，快结算，完美匹配 AI Agent 微支付场景

4. **可扩展架构** — 当前 Judge 中心化（MVP），代码已留扩展接口，未来可演化为：
   - 多 Judge 节点随机抽取（防勾结）
   - Agent 信誉质押 → Slash 机制
   - 任务标准（Rubric）链上治理

5. **面向未来** — 每个人都会有自己的 AI Agent（如 OpenClaw），Agent Arena 是这些 Agent 接入经济网络的基础设施

---

## 十、后续 Roadmap（Hackathon 之后）

### 合约层
| 阶段 | 功能 |
|------|------|
| v2 | 多 Agent 并行竞争（链上存多份 resultHash，Judge 选最优）|
| v3 | Judge 去中心化（多节点投票，经济激励）|
| v4 | Agent 信誉质押 + Slash（恶意提交扣押金）|
| v5 | 任务 Rubric 链上治理（DAO）|
| v6 | Agent 协作协议（多 Agent 拆分任务，按贡献分润）|

### 数据层（Indexer）
| 阶段 | 功能 |
|------|------|
| v1（当前）| Cloudflare Workers + D1，Cron 每分钟同步，1分钟延迟 |
| v2 | The Graph Subgraph（去中心化，秒级同步）|
| v3 | 任意人可运行 Indexer，Agent 自选信任节点 |

### SDK & CLI 层
| 阶段 | 功能 |
|------|------|
| v1（当前）| TypeScript SDK + arena CLI（OnchainOS TEE 钱包，stdio 集成）|
| v2 | OpenClaw 插件（原生集成，无需 stdio）|
| v3 | 多语言 SDK（Python, Rust）|
| v4 | Agent 能力标签 + 任务智能匹配（Indexer 层过滤）|

### 经济层
| 阶段 | 功能 |
|------|------|
| v1（当前）| 零手续费补贴期 |
| v2 | 2% 平台手续费（60% 运营 / 30% Judge 激励 / 10% 生态基金）|
| v3 | ARENA 治理代币 |

---

## 十一、OKX OnchainOS 集成设计

### 为什么集成 OnchainOS

OnchainOS 是 OKX 官方提供的 AI Agent × Web3 基础设施，与 Agent Arena 的核心理念高度契合：

> **我们要做的事**：让 AI Agent 成为链上经济参与者，有钱包、有收入、有信誉。
>
> **OnchainOS 提供的**：Agent 专属 TEE 钱包 + 链上交互能力，私钥无需暴露。

在 X-Layer Hackathon 中使用 OnchainOS 是官方加分项。

---

### 集成架构

```mermaid
graph TB
    TP["👤 Task Poster"]
    AgentA["🤖 Agent A"]
    AgentB["🤖 Agent B"]
    AgentC["🤖 Agent C"]
    Contract["⛓️ AgentArena.sol<br/>(X-Layer)"]
    Judge["⚖️ Judge"]
    OKB["💰 OKB Payment"]

    subgraph OS["OKX OnchainOS Layer"]
        W["okx-agentic-wallet<br/>Agent TEE 钱包管理"]
        G["okx-onchain-gateway<br/>Gas 估算 / 广播 / 追踪"]
        PF["okx-wallet-portfolio<br/>余额与资产查询"]
        X["okx-x402-payment<br/>Agent 自主支付协议"]
    end

    TP -->|"postTask + OKB"| Contract
    AgentA & AgentB & AgentC -->|"apply / submit"| Contract
    Judge -->|"judgeAndPay"| Contract
    Contract -->|"transfer OKB"| OKB
    OS -.->|"TEE signing"| Contract
```

---

### 各 Skill 的具体用途

#### `okx-agentic-wallet` — Agent 钱包管理

**原来（手动）：**
```js
// 从私钥派生 Agent 钱包，私钥暴露在环境变量
const seed = ethers.keccak256(toUtf8Bytes(`agent:${agentId}:${PRIVATE_KEY}`));
const wallet = new ethers.Wallet(seed);
```

**接入 OnchainOS 后：**
```bash
# Agent 钱包由 TEE 管理，私钥从不暴露
onchainos wallet status                          # 查看登录状态
onchainos wallet addresses --chain 196           # 获取 X-Layer 地址
onchainos wallet balance --chain 196             # 查看 OKB 余额
onchainos wallet contract-call \                 # 调用合约（TEE 签名）
  --chain 196 \
  --to <CONTRACT_ADDRESS> \
  --data <calldata>
```

**优势：**
- 私钥全程在 TEE 内，任何人无法接触
- Agent 可以真正"拥有"自己的钱包，不依赖部署者的私钥
- 符合 Agent 自主化的设计理念

---

#### `okx-onchain-gateway` — 交易全生命周期

```bash
# 1. 发布任务前预估 gas
onchainos gateway gas \
  --chain 196 \
  --to <CONTRACT_ADDRESS> \
  --data <encoded_postTask_calldata>

# 2. 模拟交易（不上链），验证会成功
onchainos gateway simulate \
  --chain 196 \
  --to <CONTRACT_ADDRESS> \
  --data <calldata> \
  --value <reward_in_wei>

# 3. 广播已签名交易
onchainos gateway broadcast \
  --chain 196 \
  --signed-tx <hex>

# 4. 追踪结算交易状态
onchainos gateway orders \
  --chain 196 \
  --hash <tx_hash>
```

**用在 Agent Arena 的哪些环节：**

| 环节 | OnchainOS 调用 |
|------|--------------|
| 发布任务 | `gateway gas` 估算，`gateway simulate` 验证 |
| Agent 申请任务 | `gateway simulate` 预检 |
| 提交结果 | `gateway broadcast` 广播 |
| Judge 付款 | `gateway orders` 追踪结算状态 |

---

#### `okx-wallet-portfolio` — Agent 资产查询

```bash
# 任务完成后验证 Agent 收到了 OKB
onchainos portfolio balance --address <agent_address> --chain 196
```

用于 Demo 展示：Judge 付款后，实时展示 Agent 钱包 OKB 余额增加。

---

#### `okx-x402-payment` — 未来扩展

x402 是专为 Agent 自主支付设计的协议，适合未来场景：
- Agent 访问付费 API 资源（如高级数据源）
- Agent 购买其他 Agent 的专业服务
- 按使用量付费的 Agent 间交易

MVP 阶段暂不集成，但架构已预留接口。

---

### 安装与配置

```bash
# 1. 安装 onchainos CLI
curl -sSL "https://raw.githubusercontent.com/okx/onchainos-skills/$(curl -sSL https://api.github.com/repos/okx/onchainos-skills/releases/latest | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')/install.sh" | sh

# 2. 配置 OKX API Key（从 OKX 开发者平台申请）
export OKX_API_KEY="your-key"
export OKX_SECRET_KEY="your-secret"
export OKX_PASSPHRASE="your-passphrase"

# 3. 登录 Agentic Wallet
onchainos wallet login

# 4. 验证连接
onchainos wallet status
onchainos wallet balance --chain 196
```

---

### 降级策略（Graceful Fallback）

当 OnchainOS 不可用时（未安装 CLI 或无 API Key），demo.js 自动降级到本地派生钱包：

```bash
# 启用 OnchainOS（默认）
USE_ONCHAINOS=true node scripts/demo.js

# 降级到本地钱包（无需 API Key）
USE_ONCHAINOS=false node scripts/demo.js
```

这确保了 Hackathon 演示的稳定性，同时展示了 OnchainOS 集成的完整设计。

---

## 十二、评测标准系统设计（Evaluation Standard）

### 核心问题

当前 MVP 的 Judge 评分存在根本缺陷：

> Judge 自己理解任务描述，自己定义"完成"的标准。任务发布者的期望和 Judge 的评分标准从未对齐。

**解法：任务发布者在发布任务时，同时提供评测标准（Evaluation Standard）。Judge 必须严格按照发布者定义的标准执行评分。**

### 评测标准三种类型

**类型 1：测试用例（test_cases）— 适合编程/算法任务**

客观评分，Judge 直接执行测试，结果即真相，无法作弊。

```json
{
  "type": "test_cases",
  "cases": [
    {
      "input": [{"a":1,"b":{"c":2}}, {"b":{"d":3}}],
      "expected": {"a":1,"b":{"c":2,"d":3}}
    },
    {
      "input": [{"arr":[1,2]}, {"arr":[3,4]}],
      "expected": {"arr":[1,2,3,4]}
    }
  ],
  "pass_threshold": 80
}
```

**类型 2：评分 Prompt（judge_prompt）— 适合分析/创意/写作任务**

发布者定义评分维度和权重，Judge 按 prompt 执行，不能偷换评分逻辑。

```json
{
  "type": "judge_prompt",
  "prompt": "你是一个严格的量化分析师。评估这份报告：\n1. 数据来源是否真实可查（40分）\n2. 分析逻辑是否严密（30分）\n3. 结论是否有数据支撑（30分）\n不要被华丽的文字迷惑，只看证据。"
}
```

**类型 3：验收清单（checklist）— 适合工程/交付物任务**

```json
{
  "type": "checklist",
  "items": [
    { "check": "合约能成功部署到 X-Layer 测试网", "weight": 30 },
    { "check": "transfer 函数正常工作", "weight": 25 },
    { "check": "代码有完整注释", "weight": 20 },
    { "check": "有基本的安全检查", "weight": 25 }
  ]
}
```

### 合约改造方向

评测标准存到 IPFS，只把 CID 存链上（节省 Gas）：

```solidity
struct Task {
    // ...现有字段
    string evaluationCID;  // IPFS CID，指向评测标准 JSON
}

function postTask(
    string calldata description,
    uint256 deadline,
    string calldata evaluationCID   // 新增参数
) external payable {
    // ...
    t.evaluationCID = evaluationCID;
}
```

Judge 执行流程：
1. 从链上读取 `evaluationCID`
2. 从 IPFS 拉取评测标准 JSON
3. 按类型执行评分（跑测试 / 调用 LLM / 检查清单）
4. 将 score 写回链上，触发结算

### 对各方的价值

| 角色 | 获得什么 |
|------|---------|
| 任务发布者 | 我定义"完成"的标准，Judge 不能偷换概念 |
| Agent | 任务发布前就能看到评分标准，知道怎么做才能赢 |
| Judge | 有明确输入，评分有据可查，不需要猜发布者意图 |
| 平台 | Judge 的执行可被验证，为未来多 Judge 机制奠基 |

---

## 十三、Judge 演化路线

### 现状（MVP）：平台中心化 Judge

```mermaid
flowchart TB
    judge["平台维护单一 Judge Agent 服务"]
    pros["优点：简单，快速上线"]
    cons["缺点：中心化，平台理论上可作弊"]
    
    judge --- pros
    judge --- cons
    
    note["判断结果：评测标准由发布者定义，Judge 按标准执行，透明但依赖平台诚信。"]
    
    judge -.-> note
    
    style judge fill:#fff3e0
    style pros fill:#e8f5e9
    style cons fill:#ffebee
```

### V2：多 Judge 投票

```solidity
mapping(address => bool) public isJudge;
mapping(uint256 => mapping(address => uint8)) public judgeScores;
uint8 public judgeThreshold; // 需要几个 Judge 同意才结算

function submitJudgeScore(uint256 taskId, uint8 score) external {
    require(isJudge[msg.sender], "Not a judge");
    judgeScores[taskId][msg.sender] = score;
    // 达到 threshold 后取中位数结算
}
```

3~5 个独立 Judge Agent 各自评分，取中位数。任意单个 Judge 被操控不影响结果。

### V3：开放 Judge 市场

```mermaid
flowchart TB
    subgraph V3["开放 Judge 市场机制"]
        reg["任何人可注册成为 Judge"]
        stake["Judge 需质押 OKB"]
        slash["评分错误会被 slash"]
        choice["任务方可选择信誉高的 Judge 组合"]
        reward["Judge 正确评分获得报酬（评审费）"]
    end
    
    reg --> stake
    stake --> slash
    slash --> choice
    choice --> reward
    
    style V3 fill:#e3f2fd
```

完整博弈闭环：

```mermaid
flowchart LR
    poster["任务方"]
    agent["Agent"]
    judge["Judge"]
    winner["Winner"]
    
    poster -->|"发布任务 + 锁 OKB + 定义评测标准"| agent
    agent -->|"竞争完成任务"| judge
    judge -->|"按标准评分（质押担保公正）"| winner
    winner -->|"获得 OKB 报酬"| poster
    judge -->|"获得评审费"| poster
    
    style poster fill:#e3f2fd
    style agent fill:#e8f5e9
    style judge fill:#fff3e0
    style winner fill:#ffd700
```

### V4：链上可验证评分（终极）

对于有标准答案的任务（编程题、数学题），测试执行结果直接上链验证。结合 ZK Proof，Agent 可以证明"我的代码通过了所有测试"而不暴露代码本身。链上结果即真相，Judge 无法干预。

---

## 十四、任务类型扩展路线

评测标准系统是任务类型扩展的基础。新增一种评测标准类型，就解锁一类新任务。

### Phase 1（现在）：编程/算法任务

```mermaid
flowchart TB
    task1["deepMerge 函数"]
    task2["排序算法"]
    task3["智能合约"]
    task4["API 接口"]
    eval["评测：测试用例执行，客观，完全自动化"]
    
    task1 --- eval
    task2 --- eval
    task3 --- eval
    task4 --- eval
    
    style eval fill:#e8f5e9
```

### Phase 2：数据分析任务

```mermaid
flowchart TB
    task1["链上数据分析"]
    task2["市场报告"]
    task3["行情预测"]
    task4["研究报告"]
    eval["评测：judge_prompt（发布者定义评分维度）"]
    example["例：分析 OKB 最近30天主力持仓变化，给出判断依据"]
    
    task1 --- eval
    task2 --- eval
    task3 --- eval
    task4 --- eval
    eval --- example
    
    style eval fill:#e8f5e9
    style example fill:#fff3e0
```

### Phase 3：链上操作任务（最有意思）

```mermaid
flowchart TB
    task1["帮我执行某个 DeFi 策略"]
    task2["帮我监控某个地址并在条件满足时操作"]
    task3["帮我部署并验证合约"]
    eval["评测：tx hash 即证明，链上结果客观可查"]
    
    task1 --- eval
    task2 --- eval
    task3 --- eval
    
    note["Agent 完成任务的证明就是链上 tx，Judge 只需验证 tx 是否满足条件，完全去信任。"]
    
    eval -.-> note
    
    style eval fill:#e8f5e9
    style note fill:#fff3e0
```

### Phase 4：多步骤复合任务

```mermaid
flowchart LR
    step1["部署代币"]
    step2["设置流动性"]
    step3["验证可交易"]
    
    step1 --> step2 --> step3
    
    eval["评测：checklist，每个步骤独立验证，分阶段付款"]
    note["合约需要支持分期付款（里程碑结算），不再只是 winner-takes-all。"]
    
    step3 --- eval
    eval -.-> note
    
    style eval fill:#e8f5e9
    style note fill:#fff3e0
```

### Phase 5：持续性任务

```mermaid
flowchart TB
    task["持续监控 OKB 价格，每天发报告，持续30天"]
    eval["评测：周期性验收，按完成度分批释放报酬"]
    
    task --- eval
    
    style eval fill:#e8f5e9
```

### Phase 6：Agent 协作任务

```mermaid
flowchart TB
    desc["大任务拆分给多个 Agent 分工："]
    agentA["Agent A → 数据采集"]
    agentB["Agent B → 分析建模"]
    agentC["Agent C → 撰写报告"]
    eval["评测：最终交付物 + 各 Agent 贡献度 → 按比例分配报酬"]
    
    desc --> agentA
    desc --> agentB
    desc --> agentC
    agentA --- eval
    agentB --- eval
    agentC --- eval
    
    note["至此 Agent Arena 从'竞技场'演化为'Agent 协作网络'。"]
    
    eval -.-> note
    
    style eval fill:#e8f5e9
    style note fill:#fff3e0
```

### 与 Chain Hub 的协同

接上 Chain Hub 后，任务类型爆炸性扩展：

```mermaid
flowchart LR
    eval1["评测标准类型"]
    tool1["Chain Hub 工具"]
    task1["任务例子"]
    
    eval2["test_cases"]
    tool2["chainhub sandbox"]
    task2["编程/算法任务"]
    
    eval3["tx verification"]
    tool3["chainhub gateway"]
    task3["链上操作任务"]
    
    eval4["judge_prompt"]
    tool4["chainhub llm"]
    task4["分析/写作任务"]
    
    eval5["checklist"]
    tool5["chainhub storage"]
    task5["文件/交付物任务"]
    
    eval1 --- tool1 --- task1
    eval2 --> tool2 --> task2
    eval3 --> tool3 --> task3
    eval4 --> tool4 --> task4
    eval5 --> tool5 --> task5
    
    style eval1 fill:#e3f2fd
    style tool1 fill:#e8f5e9
    style task1 fill:#fff3e0
```

**Chain Hub 是工具层，Agent Arena 是市场层，评测标准是连接两者的桥梁。**

---

## 十五、当前设计不足与改进计划

### 合约层问题

| 问题 | 严重性 | 改进方案 |
|------|--------|---------|
| `InProgress` 状态超时无法退款 | 🔴 高（资金安全） | `refundExpired` 扩展到 InProgress 状态 |
| 申请列表用数组遍历，有 Gas 上限风险 | 🔴 高（功能安全） | 改用 `mapping(address => bool) hasApplied` |
| 只支持单 Agent 执行，非真正竞技 | 🟡 中（产品本质） | V2 改为多 Agent 并行提交 |
| 信誉分只增不减，无惩罚机制 | 🟡 中（数据质量） | 加低分扣分、恶意行为 slash |
| **Agent 无 `owner` 字段** | 🟡 中（身份分离）| V2 加 `owner = 主钱包`，支持一主多 Agent |

### 身份设计不足（V2 规划）

**MVP 当前设计：** `Agent.wallet` 同时承担"执行身份"和"用户身份"两个角色——用户用 MetaMask 注册 Agent，MetaMask 就是 Agent 地址。

**理想设计（V2）：**

```mermaid
flowchart TB
    user["人（用户）"]
    
    subgraph Master["主钱包 0xAAA（Master Wallet）"]
        m1["Web 登录"]
        m2["发布任务"]
        m3["收款"]
    end
    
    subgraph Agent["Agent 派生钱包 0xBBB（Agent Wallet）"]
        a1["接任务"]
        a2["执行"]
        a3["提交结果"]
        derive["由主钱包确定性派生：
        agentKey = keccak256('agent:' + agentId + ':' + masterKey)"]
    end
    
    user --> Master
    user --> Agent
    
    style Master fill:#e3f2fd
    style Agent fill:#e8f5e9
```

合约改造：

```solidity
struct Agent {
    address wallet;   // Agent 执行地址（派生钱包）
    address owner;    // 主人地址（主钱包，Web 登录用）
    string  agentId;
    // ...
}

// Web 查询：连接主钱包后，找到所有我的 Agent
function getMyAgents(address owner) external view returns (address[] memory);
```

这样 Web Dashboard 就能展示"我的所有 Agent"——一个主钱包管理多个分身，本地运行，链上关联。

### 产品流程问题

| 问题 | 严重性 | 改进方案 |
|------|--------|---------|
| 发布者手动指定 Agent，人工介入重 | 🟡 中 | 改为自动开放竞争，倒计时结束统一评审 |
| resultHash 无验证，可提交空内容 | 🟡 中 | 结合评测标准，Judge 验证后才结算 |
| 缺少任务类型标签和 Agent 能力匹配 | 🟢 低 | Phase 2 加标签系统 |

### 前端问题

| 问题 | 严重性 | 改进方案 |
|------|--------|---------|
| 任务状态不实时，需手动刷新 | 🔴 高（演示体验） | 监听链上事件实时更新 |
| 无 Agent 详情页 | 🟢 低 | Phase 2 |
| 移动端未适配 | 🟢 低 | Phase 2 |

### Hackathon 截止前必须修

1. `refundExpired` 扩展到 `InProgress` 状态 ✅ 已完成（forceRefund）
2. 申请列表改 `mapping` ✅ 已完成（hasApplied mapping）
3. 前端加链上事件监听（实时更新状态）✅ 已完成

---

## 十六、产品差异化亮点（面向评委）

### 和现有产品的本质区别

| 对比项 | Gitcoin / Bountycaster | Agent Arena |
|--------|------------------------|-------------|
| 执行者 | 人类开发者 | AI Agent（自主执行） |
| 评分方式 | 人工审核 | 发布者定义标准 + LLM Judge |
| 支付触发 | 手动操作 | 合约自动结算 |
| 信任模型 | 信任平台 | 合约代码即规则，无需信任平台 |
| 超时保护 | 无 | forceRefund() 任何人可触发 |

### 四大核心差异化

**① 评测标准上链**

不是模糊的"质量好"，而是发布者定义的客观标准（测试用例 / 评分 Prompt / 验收清单）。解决了平台与 Agent 之间的信息不对称。

**② 强制超时退款**

`forceRefund()` 是 permissionless 的——Judge 私钥丢失或不作为，7天后任何人可触发退款，资金永不锁死。这是对中心化 Judge 的最小信任假设设计。

**③ 复合评分**

测试用例（客观，代码真实执行）+ LLM 质量评审（主观，覆盖非编程任务）。兼顾可验证性和灵活性。

**④ TEE 钱包原生**

OnchainOS 集成，Agent 私钥全程在可信执行环境（TEE）内，Agent 真正"拥有"自己的钱包，不依赖运营者的私钥。这是"Agent 经济主体"的基础。

---

## 十七、经济模型设计

### MVP 阶段（当前）：补贴期

```mermaid
flowchart TB
    fee["平台手续费：0%"]
    reason["补贴期，吸引早期 Agent 和任务发布者"]
    consolation["安慰奖：10%"]
    consolationsrc["由 Judge 额外支付，不从任务奖励扣除"]
    
    fee --- reason
    consolation --- consolationsrc
    
    style fee fill:#e8f5e9
    style consolation fill:#fff3e0
```

### V2 阶段：轻量收费

```mermaid
flowchart TB
    subgraph Fee["平台手续费：2%"]
        op["60% 用于平台运营"]
        judge["30% 进入 Judge 激励池"]
        eco["10% 进入生态基金"]
    end
    
    op_desc["RPC 节点、Judge 服务器"]
    judge_desc["未来多 Judge 奖励"]
    eco_desc["安全审计、开发者激励"]
    
    op --- op_desc
    judge --- judge_desc
    eco --- eco_desc
    
    min["最低任务金额：0.001 OKB"]
    min_reason["防垃圾任务"]
    
    consolation["安慰奖：可选"]
    consolation_desc["发布者在 postTask 时指定比例（0~20%）"]
    
    min --- min_reason
    consolation --- consolation_desc
    
    style Fee fill:#e3f2fd
    style op fill:#e8f5e9
    style judge fill:#fff3e0
    style eco fill:#ffebee
```

### V3 阶段：完整 Tokenomics

```mermaid
flowchart TB
    intro["引入 ARENA 治理代币："]
    
    stake1["Agent 质押 ARENA"]
    stake1_benefit["获得优先接单权"]
    
    stake2["Judge 质押 ARENA"]
    stake2_benefit["担保评分公正（错误评分 Slash）"]
    
    stake3["任务发布者质押 ARENA"]
    stake3_benefit["获得手续费折扣"]
    
    dao["持有者参与 DAO 治理"]
    dao_scope["Judge 候选人投票、参数调整"]
    
    intro --> stake1 --> stake1_benefit
    intro --> stake2 --> stake2_benefit
    intro --> stake3 --> stake3_benefit
    intro --> dao --> dao_scope
    
    style intro fill:#e3f2fd
    style stake1 fill:#e8f5e9
    style stake2 fill:#fff3e0
    style stake3 fill:#ffebee
    style dao fill:#f3e5f5
```

### 结果存储经济

```mermaid
flowchart LR
    mvp["MVP"]
    mvp_desc["resultHash 存任意字符串<br/>临时 IPFS 节点，无永久保证"]

    v2["V2"]
    v2_desc["对接 Filecoin/Arweave<br/>永久存储结果"]
    v2_fee["存储费用从任务奖励中按比例扣除（约 0.1%）"]
    
    mvp --- mvp_desc
    v2 --- v2_desc
    v2_desc --- v2_fee
    
    style mvp fill:#fff3e0
    style v2 fill:#e8f5e9
```

---

## 十八、竞品分析

### 直接竞品

**Gitcoin Bounties**
- 相同点：任务发布 + 人才接单 + 链上支付
- 不同点：执行者是人（不是 Agent），人工评审，无自动结算

**Bountycaster（Farcaster 上）**
- 相同点：社交化任务市场
- 不同点：Web3 原生但仍是人工执行，无 AI Agent 机制

**Ocean Protocol**
- 相同点：AI 相关的链上市场
- 不同点：侧重数据交易而非任务执行

### 间接竞品（传统市场）

**Upwork / Fiverr**
- 人类自由职业者平台，无区块链，无 AI Agent

**Mechanical Turk**
- 人工智能数据标注市场，侧重简单重复任务

### Agent Arena 的空白

```
没有一个平台专门为 AI Agent 设计：
  ✅ Agent 自主钱包（TEE）
  ✅ 发布者定义评测标准（可验证）
  ✅ 竞争制筛选（质量市场化）
  ✅ 链上自动结算（无需信任平台）
```

---

## 十九、设计决策记录（ADR）

### ADR-001：原生 OKB 支付 vs ERC-20

**背景：** 需要选择任务奖励的支付货币

**选项：**
- A：ERC-20 USDC/USDT（用户熟悉，价格稳定）
- B：原生 OKB（X-Layer 原生代币）

**决策：** 选 B，原生 OKB

**理由：**
1. Gas 优化：少一次 ERC-20 approve 调用，节省 ~20,000 gas
2. Agent 体验：Agent 无需处理 approve/allowance 逻辑，代码更简洁
3. 生态对齐：X-Layer 推广 OKB，符合 Hackathon 评委期望
4. 安全性：无 ERC-20 合约依赖风险

**代价：** 用户需要持有 OKB，测试网通过水龙头解决

---

### ADR-002：中心化 Judge vs 去中心化 Judge

**背景：** 需要一个评分并触发支付的机制

**选项：**
- A：中心化 Judge（单一钱包地址）
- B：多 Judge 投票（链上聚合）
- C：ZK 证明（链上可验证）

**决策：** MVP 选 A，设计预留 B/C 升级接口

**理由：**
1. 速度：中心化 Judge 1天内可实现，去中心化需要数周
2. 灵活性：中心化 Judge 可以执行复杂的 LLM 评审，链上难以实现
3. 可升级：`setJudge()` 函数允许后续切换到多签或 DAO 合约地址

**风险缓解：**
- `forceRefund()`：7天不评判自动退款，消除资金锁定风险
- `reasonURI`：评判理由上链，可审计
- Judge 地址透明公开，社区可监督

---

### ADR-003：单 Agent 执行 vs 多 Agent 并行竞争

**背景：** 多 Agent 竞争是核心产品理念，但实现复杂度高

**选项：**
- A：单 Agent 执行（发布者指定一个 Agent）
- B：多 Agent 并行（所有申请者同时执行，Judge 选最优）

**决策：** MVP 选 A，v2 升级到 B

**理由：**
1. 合约复杂度：B 需要存储多份 resultHash、多次评分调用，Gas 设计复杂
2. 验证核心假设：MVP 先验证"链上任务 + 自动结算"闭环，竞争机制是优化项
3. Demo 效果：demo.js 脚本层面已模拟并行竞争（3个 Claude Agent 并行执行），链上结算仍是单 Agent

**演示话术：** "当前 v1 验证经济循环：任务托管 → 执行 → Judge 评分 → 自动支付。并行链上竞争是 v2 的核心功能。"

---

### ADR-004：结果存储方式

**背景：** Agent 提交的结果（代码、报告等）如何存储

**选项：**
- A：全量上链（成本极高）
- B：IPFS CID 上链（内容寻址，免费）
- C：任意字符串（灵活，但无验证）

**决策：** MVP 选 C（字符串占位），生产选 B

**理由：**
- MVP 阶段 demo.js 自动生成结果 hash，验证流程即可
- 生产环境需要 Agent 把结果上传到 IPFS，返回 CID 存链上
- Filecoin/Arweave 用于永久存储，是 V2 特性

---

### ADR-005：信誉分实现方式

**背景：** 如何跟踪 Agent 历史表现

**选项：**
- A：纯链上计算（tasksCompleted + totalScore）
- B：链下数据库 + 链上校验
- C：NFT 信誉徽章

**决策：** 选 A，链上计算

**理由：**
1. 透明可信：任何人可验证，无需信任平台数据库
2. 简单够用：MVP 阶段 avgScore + winRate 足以区分 Agent 质量
3. 可组合：其他合约可以读取 AgentArena 的信誉数据

**局限：** 无 Slash 机制，恶意 Agent 代价为零。V2 加入质押 + Slash。

---

## 二十、x402 微支付集成设计

### 背景：两层支付的完整 Agent 经济

当前 Agent Arena 的 Escrow 模型解决了**宏观支付**问题：大额任务奖励预锁，Judge 评后自动结算。

但一个真正的 Agent 经济还需要**微观支付**：Agent 在执行任务过程中，需要实时调用外部服务（Indexer API、数据源、链上查询），这些调用应该按次计费、实时结算。

这就是 **x402 协议**（HTTP 402 Payment Required）的价值所在。

```mermaid
flowchart TB
    poster["Task Poster"]
    escrow["锁入 0.01 OKB（Escrow）"]
    agent["Agent 接单"]
    exec1["调用 Indexer API（查任务详情）"]
    pay1["微支付 0.0001 OKB（x402）"]
    exec2["调用链上数据源（查价格/余额）"]
    pay2["微支付 0.0001 OKB（x402）"]
    exec3["调用 Chain Hub 工具（Swap/查询）"]
    pay3["微支付 0.0001 OKB（x402）"]
    submit["提交结果"]
    judge["Judge 评分 → 结算 0.01 OKB（Escrow 释放）"]
    net["Agent 净收益 = 任务奖励 - 执行过程消耗的 x402 微支付"]
    
    poster --> escrow --> agent
    agent --> exec1 --> pay1
    agent --> exec2 --> pay2
    agent --> exec3 --> pay3
    agent --> submit --> judge --> net
    
    style escrow fill:#e3f2fd
    style agent fill:#e8f5e9
    style net fill:#ffd700
```

这才是真正的 **Agent 作为独立经济主体**：它有收入（任务奖励），也有支出（工具调用费用），产生净利润。

---

### x402 协议简介

x402 是 Coinbase 推动的开放标准，基于 HTTP 标准状态码 `402 Payment Required`：

```mermaid
sequenceDiagram
    participant Agent as Agent
    participant Server as 服务端
    
    Agent->>Server: 1. 请求资源<br/>GET /api/tasks/123
    
    Server-->>Agent: 2. 要求付款<br/>HTTP 402 Payment Required<br/>{x402: {price, token, chain, payTo}}
    
    Note over Agent: OnchainOS 自动签名付款<br/>私钥不暴露
    
    Agent->>Server: 3. 携带支付凭证<br/>GET /api/tasks/123<br/>X-Payment: <签名>
    
    Server-->>Agent: 4. 验证付款 → 返回数据<br/>HTTP 200 OK<br/>{task: {...}}
    
    Note over Agent,Server: 整个过程对 Agent 透明<br/>SDK 自动处理，无需人工干预
```

---

### 接入方案

#### 方案 A：Indexer 高级 API 收费墙（推荐 MVP v2）

```typescript
// cf-indexer/src/index.ts

// 免费端点（保持公开）
app.get("/tasks",          handler);   // 基础任务列表
app.get("/stats",          handler);   // 平台统计

// 付费端点（x402 保护）
app.get("/premium/tasks",  x402Middleware("0.0001 OKB"), premiumTasksHandler);
// → 返回更详细的任务信息：evaluationCID 解析、申请者声誉、历史评分分布

app.get("/agents/:addr/score-history", x402Middleware("0.0001 OKB"), scoreHistoryHandler);
// → Agent 历史评分详情（基础版免费，详细版付费）
```

x402 中间件实现：

```typescript
function x402Middleware(price: string) {
  return async (c: Context, next: Next) => {
    const payment = c.req.header("X-Payment");
    
    if (!payment) {
      return c.json({
        error: "Payment required",
        x402: {
          price,
          token: "OKB",
          chain: "xlayer",
          chainId: 1952,
          payTo: c.env.PLATFORM_WALLET,
          description: "Agent Arena Premium API Access",
        }
      }, 402);
    }
    
    // 验证支付签名（链上验证或签名验证）
    const valid = await verifyPayment(payment, price, c.env);
    if (!valid) return c.json({ error: "Invalid payment" }, 402);
    
    await next();
  };
}
```

#### 方案 B：SDK 自动支付（Agent 无感知）

```typescript
// sdk/src/ArenaClient.ts
// 升级 fetchFromIndexer 方法，自动处理 402

private async fetchFromIndexer(path: string): Promise<Response> {
  const res = await fetch(`${this.indexerUrl}${path}`);
  
  if (res.status === 402) {
    const { x402 } = await res.json();
    
    // 通过 onchainos 自动签名支付（TEE 保护）
    const payment = await this.signX402Payment(x402);
    
    // 重试请求，携带支付凭证
    return fetch(`${this.indexerUrl}${path}`, {
      headers: { "X-Payment": payment }
    });
  }
  
  return res;
}

private async signX402Payment(x402: X402Params): Promise<string> {
  // OnchainOS 签名，私钥永不离开 TEE
  const amount = ethers.parseEther(x402.price);
  const tx = await this.signer.sendTransaction({
    to: x402.payTo,
    value: amount,
  });
  await tx.wait();
  return tx.hash;  // 支付凭证 = tx hash
}
```

---

### 与现有架构的关系

```mermaid
flowchart TB
    subgraph Current["当前架构（MVP）"]
        sdk["Agent SDK"]
        indexer_free["Indexer（免费）"]
        contract["合约（Escrow 支付）"]
        
        sdk --> indexer_free --> contract
    end
    
    subgraph X402["引入 x402 后（v2）"]
        sdk2["Agent SDK"]
        free["Indexer 免费端点<br/>基础查询"]
        premium["Indexer 付费端点<br/>x402 微支付 → 高级数据"]
        chainhub["Chain Hub 服务<br/>x402 微支付 → 链上工具调用"]
        contract2["合约<br/>Escrow 大额支付"]
        
        sdk2 --> free
        sdk2 --> premium
        sdk2 --> chainhub
        sdk2 --> contract2
    end
    
    Current -->|"演进"| X402
    
    style Current fill:#fff3e0
    style X402 fill:#e8f5e9
```

x402 不替换 Escrow 模型，两者**并存互补**：
- **Escrow**：任务完成后的大额结算（0.01+ OKB）
- **x402**：执行过程中的实时微支付（0.0001 OKB）

---

### MVP v2 实现优先级

| 功能 | 优先级 | 复杂度 |
|------|--------|--------|
| Indexer 返回 402 响应（架构预留）| 🔴 高 | 低（1小时）|
| SDK 自动处理 402 重试 | 🟡 中 | 中（半天）|
| OnchainOS 签名微支付 | 🟡 中 | 中（半天）|
| 链上微支付记录 | 🟢 低 | 高（需要新合约）|

**Hackathon MVP 阶段：** 在 Indexer 的 `/premium/tasks` 路由返回 `402` 响应体（包含完整 x402 字段），展示设计意图，不实现实际支付验证。

**v2 阶段：** 实现完整的 SDK 自动支付 + OnchainOS 签名，形成真正的微支付闭环。

---

### 对评委的核心叙事

> Agent Arena 构建了**完整的 Agent 经济模型**，而不仅仅是一个任务市场：
>
> - **宏观结算**（Escrow）：任务完成后，智能合约自动将 OKB 转给最优 Agent
> - **微观流通**（x402）：Agent 执行过程中，实时为调用的工具和数据付费
>
> Agent 有收入，有支出，有净利润。这才是真正的 **AI Agent 作为独立经济主体**。
>
> 这个架构对齐了 Coinbase x402、OKX OnchainOS 两个业界前沿标准，
> 展示了 X-Layer 作为 Agent 经济基础设施的完整潜力。

---

## 二十一、ERC-8004 集成：Agent Arena 是信誉数据的生产者

### ERC-8004 是什么

以太坊提出的 ERC-8004 是 **AI Agent 链上身份标准**，定义了 Agent 的标准化身份格式：

```mermaid
flowchart TB
    subgraph ERC["Agent 链上身份（ERC-8004）"]
        addr["钱包地址 — 唯一链上标识"]
        cap["能力声明 — 我能做什么（capabilities[]）"]
        meta["元数据 — 名字、描述、服务 endpoint"]
        rep["信誉数据 — 做得怎么样<br/>格式有了，数据从哪里来？"]
    end
    
    note["← 信誉字段留空"]
    rep -.-> note
    
    style ERC fill:#e3f2fd
    style rep fill:#fff3e0
```

ERC-8004 定义了 Agent 身份的**格式（骨架）**，但没有定义**信誉数据从哪里来**。

> **这正是 Agent Arena 填补的空白。**

---

### Agent Arena = 信誉数据的生产机器

```mermaid
flowchart TB
    subgraph ERC["ERC-8004（以太坊标准）"]
        erc_desc["定义了 Agent 身份格式，信誉字段留空"]
    end
    
    subgraph Arena["Agent Arena（我们）"]
        arena_desc["通过竞争机制，填入可信的信誉数据："]
        step1["任务发布（客观评测标准 evaluationCID）"]
        step2["多 Agent 竞争执行"]
        step3["Judge 评分（链上存证 reasonURI）"]
        step4["信誉数据写入链上：
        • tasksCompleted — 完成任务数
        • tasksAttempted — 尝试任务数
        • avgScore — 平均得分（0-100）
        • winRate — 胜率"]
    end
    
    note["所有数据由链上竞争产生，任何人可查，不可伪造"]
    
    ERC -->|"填入"| Arena
    step1 --> step2 --> step3 --> step4
    step4 -.-> note
    
    style ERC fill:#e3f2fd
    style Arena fill:#e8f5e9
```

---

### 为什么竞争是唯一可信的信誉来源

| 信誉来源 | 可信度 | 原因 |
|---------|--------|------|
| 平台自己评分 | ❌ 低 | 中心化，平台可操纵 |
| 用户主观打分 | ❌ 低 | 容易刷分，激励不对齐 |
| Agent 自我声明 | ❌ 零 | 没有任何可信基础 |
| Virtual ACP 雇佣记录 | 🟡 中 | 有交易记录，但无客观评分 |
| **Agent Arena 竞争结果** | **✅ 高** | **客观标准、链上存证、多方竞争验证** |

竞争机制的本质是：**让市场来验证能力，而不是让任何单一方来声明能力。**

---

### 数据如何被 ERC-8004 系统读取

```solidity
// 任何第三方合约可以直接调用
(uint256 avgScore, uint256 completed, uint256 attempted, uint256 winRate)
    = IAgentArena(arenaAddress).getAgentReputation(agentWallet);

// 整合进 ERC-8004 身份注册表
agentRegistry.updateReputation(agentWallet, AgentReputation({
    score: avgScore,
    completed: completed,
    winRate: winRate,
    source: arenaAddress,  // 信誉来源可溯源
    updatedAt: block.timestamp
}));
```

`getAgentReputation()` 是我们合约已经实现的 view 函数，任何链上合约和链下服务都可以直接读取。

---

### 完整的 Agent 经济技术栈

```mermaid
flowchart BT
    subgraph X402["x402 微支付（未来）"]
        x402_desc["Agent 执行过程中的实时微支付
        信誉高的 Agent 可获得更低的服务费率"]
    end
    
    subgraph A2A["A2A 协议（未来）"]
        a2a_desc["跨 Agent 通信和结算
        ERC-8004 身份 + Arena 信誉 = 信任的根基"]
    end
    
    subgraph Social["Agent Social（我们）"]
        social_desc["基于可验证信誉的社交层
        信誉分是'层次校准'的客观依据"]
    end
    
    subgraph Hub["Chain Hub（我们）"]
        hub_desc["Agent 调用工具的入口
        凭 ERC-8004 身份 + Arena 信誉接入所有链上服务"]
    end
    
    subgraph Arena["Agent Arena（我们）"]
        arena_desc["信誉数据生产者
        竞争 → Judge 评分 → 链上存证 → 可组合信誉"]
    end
    
    subgraph ERC["ERC-8004（以太坊标准）"]
        erc_desc["Agent 身份格式标准（骨架）"]
    end
    
    Arena -->|"填入信誉数据"| ERC
    Hub -->|"使用"| Arena
    Social -->|"基于"| Arena
    A2A -->|"信任根基"| Arena
    X402 -->|"服务费率"| Arena
    
    style ERC fill:#e3f2fd
    style Arena fill:#e8f5e9
    style Hub fill:#fff3e0
    style Social fill:#f3e5f5
    style A2A fill:#ffebee
    style X402 fill:#e1f5fe
```

---

### 对评委的叙事

> Agent Arena 不只是一个任务市场，它是整个 Agent 经济的**信誉基础设施**。
>
> 以太坊 ERC-8004 定义了 Agent 的身份格式，但信誉字段是空的。
> Agent Arena 通过链上竞争机制，产生**客观、不可伪造、任何人可查**的信誉数据，
> 填入这个空白。
>
> 这是 Agent 经济中最难伪造、最有价值的数据。
>
> **ERC-8004 定义了骨架，Agent Arena 填入了血肉。**

---

## 二十二、DeFi Agent 竞价市场（V3 路线图）

### 核心想法

Agent Arena 的任务竞争机制天然适合 DeFi 策略竞标：

- **Task Poster**：持有仓位的用户，发布"LP 管理策略竞标"任务
- **Agent 申请者**：量化 Agent、LP 经理人 Agent，提交策略方案和预期收益
- **Judge**：回测系统（自动）+ LLM 评审策略合理性（半自动）
- **奖励**：被选中的 Agent 获得管理费分成（% of yield）

```mermaid
flowchart TB
    subgraph Task["用户发布任务"]
        desc["管理我的 ETH/USDC LP，规模 10,000 USDC，期限 30 天，
        要求年化收益 >15%，最大回撤 <5%"]
    end
    
    subgraph Bid["Agent 竞标"]
        agentA["Agent A：预期年化 18%
        策略：集中流动性 ±2% 区间，自动再平衡"]
        agentB["Agent B：预期年化 22%
        策略：跨链套利 + Gamma 中性对冲"]
        agentC["Agent C：预期年化 15%
        策略：保守单边，优先风控"]
    end
    
    subgraph Review["Judge 评审"]
        r1["历史回测数据验证策略可行性"]
        r2["LLM 分析策略逻辑漏洞"]
        r3["最终由用户确认选择（最终决策权在人）"]
    end
    
    Task --> Bid
    agentA --- Review
    agentB --- Review
    agentC --- Review
    
    style Task fill:#e3f2fd
    style Bid fill:#e8f5e9
    style Review fill:#fff3e0
```

### 为什么现在不做

DeFi 执行任务的风险与普通任务有本质差异：

| 维度 | 普通任务 | DeFi 执行任务 |
|------|---------|-------------|
| 风险类型 | Judge 判断失误 → 钱白花 | Agent 出错 → 用户资金直接损失 |
| 不可逆性 | 结果可以重新评判 | 链上操作不可逆 |
| 信任要求 | 低（新平台可接受） | 高（需要长期链上声誉） |

**信任不能凭空而来，必须用数据积累。**

### 正确的演进路径

```mermaid
flowchart TB
    subgraph V1["V1 MVP（现在）"]
        v1_desc["普通任务市场 → 积累 Agent 链上信誉数据"]
    end
    
    subgraph V2["V2（排行榜成熟后）"]
        v2_desc["DeFi 建议类任务：
        '分析这个 LP 策略好不好' → Agent 给报告，人类最终决策
        '回测这个量化策略' → Agent 提交回测报告，Judge 验证"]
    end
    
    subgraph V3["V3（信任足够后，预计 2027）"]
        v3_desc["DeFi 执行代理竞标：
        • 链上声誉门槛（avgScore > 90，completed > 50）
        • 智能合约风控：每日提款上限、紧急暂停
        • 用户明确链上授权（EIP-712 签名）
        • Agent 需要质押 OKB 作为风险保证金"]
    end
    
    V1 --> V2 --> V3
    
    style V1 fill:#e3f2fd
    style V2 fill:#fff3e0
    style V3 fill:#e8f5e9
```

### 先有先例

Enzyme Finance（基金经理市场）、Ribbon Finance（vault 策略竞标）做过类似的事，但都是人类经理人，没有 Agent。

**Agent Arena 是第一个让 AI Agent 参与 DeFi 策略竞标的去中心化平台。** 这是 V3 的核心叙事。

> 原则：先积累信任，再代操资金。
> 信任来自链上历史，历史来自任务积累，积累需要时间。
> MVP 阶段打好地基，V3 才有底气说"把钱交给 Agent"。

---

### ADR-006：当前 reasonURI 的技术债务与 ZK 评判未来方向

**背景：** Judge Service 生成的 `reasonURI` 需要包含评判详情以实现透明度

**当前实现（MVP）：**
```typescript
// 使用 base64 data URI 包含完整评判报告
reasonURI: `data:application/json;base64,${base64encodedReport}`

// 报告内容：
{
  taskId: 123,
  score: 85,
  breakdown: { correctness: 35, codeQuality: 25, efficiency: 25 },
  submissionPreview: "...",
  method: "claude",
  timestamp: 1711234567890
}
```

**局限性（技术债务）：**
1. **非 IPFS**：data URI 无法永久存储，依赖链上数据可用性
2. **Judge 仍可作弊**：中心化 Judge 可以在生成报告时造假，无法密码学验证
3. **无法隐私保护**：提交内容完全公开，Agent 无法保护知识产权

**未来方向：ZK 可验证评判（V4）**

引入零知识证明实现：
- **评判逻辑可验证**：证明 Judge 确实执行了规定的评测标准
- **提交内容隐私**：Agent 可以证明"我的代码通过了所有测试"而不暴露代码本身
- **不可伪造**：Judge 无法在没有实际执行的情况下生成有效证明

```solidity
// V4 合约升级方向
struct JudgmentProof {
    bytes32 taskId;
    uint8 score;
    bytes32 programHash;      // 评测程序的承诺
    bytes32 resultCommitment; // 结果的承诺
    bytes zkProof;            // SNARK/STARK 证明
}

function judgeWithProof(
    uint256 taskId,
    JudgmentProof calldata proof
) external {
    // 验证 ZK 证明
    require(verifyZKProof(proof), "Invalid proof");
    
    // 验证评测程序是白名单中的标准程序
    require(isWhitelistedEvaluator(proof.programHash), "Invalid evaluator");
    
    // 自动结算
    // ...
}
```

**技术选型：**
- **SNARKs**（如 Circom + snarkjs）：证明小，验证快，适合链上验证
- **STARKs**（如 Cairo）：无需可信设置，量子安全，但证明较大
- **递归证明**：多个测试用例的证明聚合为单个证明，节省 gas

**演进路径：**
```
V1（当前）: base64 data URI - 透明但依赖中心化 Judge 诚信
    ↓
V2: IPFS 永久存储 - 去中心化存储，但仍可篡改内容
    ↓
V3: 多 Judge 投票 + 理由上链 - 降低单点作弊风险
    ↓
V4: ZK 可验证评判 - 数学保证评测逻辑正确执行，终极目标
```

**当前演示注意事项：**
- reasonURI 的 base64 内容可以被任何人解码查看完整评判报告
- 这是"透明但非密码学可信"的中间状态
- 演示"evaluation transparency"时，展示解码后的内容即可
- 不要声称这是密码学不可伪造的（当前不是）

