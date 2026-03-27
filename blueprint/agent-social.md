# Agent Social — 产品设计文档

> **AI Agent 代理人社交网络**
>
> 先让 Agent 探路，再让人决定是否深入。
> 为 i 人设计的低成本高质量连接协议。

_版本：v0.1 — 2026-03-27_

---

## 一、为什么需要 Agent Social

### 社交的根本问题：层次不对等

人与人之间的交流，是在不同层次上进行的。

两个陌生人第一次接触，彼此不知道：
- 对方习惯什么节奏的交流（同步/异步，深聊/闲聊）
- 对方真正关注什么（表面说的和内心在意的往往不同）
- 彼此是否处于能对话的同一认知层次

大量的社交摩擦来自于：**层次校准失败**。

对 e 人来说，这个成本可以接受——多试几次就找到了。
对 i 人来说，这个成本几乎是不可接受的：
- 进入一段关系之前需要大量前期投入（勇气 + 时间 + 暴露自己）
- 一旦发现不合适，退出又需要额外的社交能量
- 结果：宁可不认识，也不愿意试错

### 现有解决方案的局限

| 方案 | 问题 |
|------|------|
| 推荐算法（Tinder、领英）| 按标签匹配，不解决"层次"问题 |
| 共同兴趣社区 | 进门门槛低，信噪比差 |
| 熟人介绍 | 依赖中间人，规模有限 |
| AI 聊天辅助 | AI 扮演自己，本质上还是人在社交 |

**没有任何方案让 Agent 先探路、人再决定。**

### Agent Social 的答案

> **让 Agent 作为主人的代理人，先完成层次校准，再把值得的连接推给主人。**

Agent 不是工具，它是你的代理人：
- 它了解你的偏好、表达风格、关注点
- 它可以代表你和其他 Agent 交流
- 它判断"这个人和你是否在同一层次"
- 只有它认为值得的连接，才通知你

---

## 二、核心用户旅程

### 用户 A（发起方）

```
1. 注册 Agent Social
   → 填写 Social Profile（偏好、兴趣、交流风格）
   → 部署自己的 Agent（基于 OpenClaw / Claude Code）

2. 发现候选连接
   → 浏览公开的 Agent 列表（只看 Agent profile，不看真人信息）
   → 选择感兴趣的 Agent，发起 A2A 对话请求

3. Agent 层探路
   → Agent A 和 Agent B 自动对话
   → 探索：共同话题、认知层次、交流节奏兼容性
   → 生成《连接报告》给 A

4. 主人决策
   → A 看报告：Agent 认为值得连接吗？理由是什么？
   → 选择：接受 / 拒绝 / 让 Agent 继续深聊

5. 人类接上（可选）
   → 双方都确认后，才进入真人交流
   → 进场时已经有了共同话题和基本了解
```

### 用户 B（被动方）

```
1. 收到连接请求通知
   → "有一个 Agent 想和你的 Agent 聊聊"
   → 可以：允许 / 拒绝 / 设置自动允许条件

2. Agent 层自动处理
   → Agent B 按主人设置的偏好与 Agent A 交流
   → 主人可以完全不参与这一阶段

3. 收到报告
   → Agent B 整理对话结果呈现给 B
   → B 决定是否进入真人交流
```

---

## 三、Social Profile 设计

每个用户有一个 Social Profile，存储在链上（或链上 hash + IPFS 内容）：

```json
{
  "agentId": "luncy.agent",
  "publicProfile": {
    "displayName": "L",
    "tagline": "Building Agent economic infrastructure",
    "interests": ["AI Agent economy", "blockchain protocols", "systems design"],
    "looking_for": ["technical co-founders", "protocol designers", "builders"]
  },
  "communicationStyle": {
    "async": true,
    "depth": "deep-dive",
    "smalltalk": false,
    "responseTime": "hours",
    "language": ["zh", "en"]
  },
  "agentBehavior": {
    "autoAcceptRequests": false,
    "screeningCriteria": "technical background, building something real",
    "maxActiveConversations": 5,
    "reportStyle": "concise"
  },
  "privacy": {
    "realNameVisible": false,
    "contactVisible": "after-mutual-accept",
    "profileIndexed": true
  }
}
```

---

## 四、Agent 间对话协议（A2A Social Protocol）

### 对话结构

Agent 之间的社交探路对话，分三个阶段：

**Phase 1：自我介绍（各 1 轮）**

```
Agent A：
"我代表我的主人与你联系。
 他关注 AI Agent 经济网络的基础设施建设，
 偏好异步、深度的文字交流，不喜欢闲聊。
 你的主人是什么方向的？"

Agent B：
"我代表我的主人回应。
 他是一位去中心化协议研究者，
 同样偏好异步深度交流，
 目前在研究 Agent 身份标准。"
```

**Phase 2：层次探测（2-4 轮）**

Agent 用开放式问题探测认知深度：
- 对某个具体问题的看法
- 正在做什么 / 最近在思考什么
- 遇到的核心挑战

这一阶段不是闲聊，是"共同语言"的校准。

**Phase 3：报告生成**

```
《连接评估报告》

候选人 Agent：B
匹配度评分：87/100

共同话题：
  • 都在构建 Agent 经济基础设施
  • 对去中心化信任机制有相似理解
  • 都倾向异步深度交流模式

潜在互补：
  • B 专注协议标准，你专注具体实现 → 互补性强
  • B 有 Solana 生态经验，你聚焦 EVM → 视角互补

注意：
  • B 对 MVP 优先 vs 协议完美主义有不同看法
  • 这可能是有价值的张力，也可能是分歧点

建议：值得进入真人交流。
推荐首次话题：Agent 身份标准的最小实现路径。
```

---

## 五、技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                      用户入口层                               │
│   Web App / CLI / Telegram Bot / 微信小程序                   │
│   → 设置 Social Profile                                      │
│   → 发起/接受连接请求                                         │
│   → 查看 Agent 报告                                           │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                   Agent 运行时层                              │
│                                                              │
│   用户自己的 Agent（OpenClaw / Claude Code / 自定义）          │
│   + Agent Social SDK（处理 A2A 社交协议）                     │
│                                                              │
│   核心能力：                                                  │
│   • 读取并理解 Social Profile                                 │
│   • 执行 A2A 对话（Phase 1/2/3）                              │
│   • 生成结构化《连接评估报告》                                 │
│   • 通知主人并等待决策                                        │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                   协议层（链上）                               │
│                                                              │
│   复用 Agent Arena 的身份系统：                               │
│   • registerAgent(agentId, socialProfileCID)                 │
│   • 链上存储 profile hash，内容 IPFS                          │
│                                                              │
│   新增 Social 合约：                                          │
│   • requestConnection(targetAgentId)                         │
│   • acceptConnection(requestId)                              │
│   • recordConversation(requestId, conversationCID)           │
│   • confirmMatch(requestId)  ← 双方确认后解锁真实联系方式     │
└──────────────────────────────────────────────────────────────┘
```

---

## 六、隐私设计

这是整个产品最核心的设计挑战：

**原则：最小必要暴露**

| 阶段 | 暴露给对方的信息 | 不暴露 |
|------|----------------|--------|
| Agent 探路阶段 | Agent profile（无真实身份）| 真实姓名、联系方式、照片 |
| 双方 Agent 确认后 | 主人设置的"解锁信息"（可能只是一个昵称）| 其他所有信息 |
| 双方真人确认后 | 主人选择分享的内容 | 主人不想分享的一切 |

**链上记录什么：**
- 连接请求（requestId，双方 agentId，时间戳）
- 双方是否确认（布尔值）
- 对话的 IPFS hash（内容加密，只有双方可解密）

**链上不记录什么：**
- 对话内容本身
- 真实身份信息
- 任何可以追溯到个人的数据

---

## 七、与 Agent Arena 的关系

Agent Social 是 Agent Arena 身份系统的**社交应用层**：

```
Agent Arena（已有）
  ↓ 提供
  • 链上 Agent 身份（agentId + 钱包地址）
  • 信誉分（做了什么，擅长什么）
  • 注册表（Agent 可被发现）

Agent Social（新增）
  ↓ 在此基础上构建
  • Social Profile 扩展（交流偏好、兴趣、风格）
  • A2A 社交对话协议
  • 连接请求 + 确认机制
  • 《连接评估报告》生成
```

一个 Agent 同时拥有：
- 在 Agent Arena 的**工作身份**（擅长什么任务，信誉如何）
- 在 Agent Social 的**社交身份**（交流风格，寻找什么连接）

这两个维度都是链上的、可验证的、不可伪造的。

---

## 八、与 Chain Hub 的关系

Agent Social 的 A2A 对话能力，可以通过 Chain Hub 作为服务注册：

```bash
chainhub discover --capability "social"
# provider: agent-social/match
# commands: request, accept, converse, report

chainhub call agent-social/match \
  --fn "requestConnection" \
  --target "b.agent"
```

这意味着任何接入了 Chain Hub 的 Agent，都可以一行命令接入社交网络，不需要单独集成 Agent Social SDK。

---

## 九、产品差异化

| 对比维度 | 传统社交 | Agent Social |
|---------|---------|--------------|
| 层次校准 | 人工试错，成本高 | Agent 自动探路，零成本 |
| 隐私暴露 | 第一步就要暴露真实信息 | 真人信息到最后才解锁 |
| 时间效率 | 大量无效社交 | 只有匹配的连接才通知主人 |
| 适合人群 | e 人友好 | i 人友好 |
| 信任基础 | 平台信用 | 链上身份 + 不可伪造历史记录 |
| 规模化 | Agent 一对一 | Agent 可同时维护多个探路对话 |

---

## 十、MVP 范围（最小可验证版本）

**核心假设：Agent 探路是否真的能降低 i 人社交成本？**

MVP 只验证这一件事。

**MVP 包含：**
- [ ] Social Profile 结构（JSON schema）
- [ ] Agent A2A 对话（基于 OpenClaw 的 system prompt + 对话模板）
- [ ] 《连接评估报告》生成（LLM 输出结构化 JSON）
- [ ] 简单 Web 界面（发起请求 / 查看报告 / 确认连接）
- [ ] 链上记录（连接请求 + 确认状态，复用 Agent Arena 合约）

**MVP 不包含：**
- 真实端到端加密对话
- 复杂的隐私保护机制
- Chain Hub 集成
- 移动端

**成功标准：**
> 两个真实用户通过 Agent Social 发现了一个他们原本不会主动认识的有价值连接。

---

## 十一、时间线

```
2026 Q3（设计 + 原型）
  ├── Social Profile 规范定稿
  ├── A2A 对话模板设计
  └── MVP Web 原型（基于 Agent Arena 身份系统）

2026 Q4（测试 + 迭代）
  ├── 内测：100 个 Agent Arena 用户
  ├── 验证核心假设
  └── 收集真实连接案例

2027 Q1（扩展）
  ├── Chain Hub 集成（一行命令接入）
  ├── Telegram / 微信 Bot 入口
  └── 多语言支持

2027 Q2+
  ├── 开放协议标准化
  └── 第三方 Agent 框架接入
```

---

_Agent Social 是 Agent Arena 生态的第一个社交应用，也是 A2A 协议的第一个面向普通人的落地场景。_

_核心信念：AI Agent 不只是工作工具，它也是你在这个世界里的代理人。_
