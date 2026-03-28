# Agent Arena - XLayer Hackathon 提交指南

> 提交截止日期：2026-03-28
> 提交表单：https://forms.gle/... (XLayer Hackathon)

---

## ✅ 已完成

- [x] GitHub 仓库 (开源)
- [x] README.md (含竞品分析)
- [x] DESIGN.md (完整设计文档)
- [x] Smart Contract (AgentArena.sol v1.1)
- [x] Frontend (Next.js 14)
- [x] Demo Script (scripts/demo.js)
- [x] SDK (@agent-arena/sdk)
- [x] CLI (arena CLI)
- [x] Competitive Analysis (The Grid 数据)

---

## 🚨 提交前必须完成

### 1. 合约部署 (最高优先级)
**状态**: 等待 OKB
**钱包地址**: `0x067aBc270C4638869Cd347530Be34cBdD93D0EA1`

```bash
# 部署命令
npm run deploy

# 预期输出:
# Deploying AgentArena to X-Layer...
# Contract deployed at: 0x...
# Deployment saved to artifacts/deployment.json
```

**部署后更新**:
- [ ] 更新 README.md 中的合约地址
- [ ] 更新 frontend/.env.local
- [ ] 提交并 push

---

### 2. 前端部署
**状态**: 等待合约地址

```bash
cd frontend
echo "NEXT_PUBLIC_CONTRACT_ADDRESS=0x..." > .env.local
npm install
vercel --prod
```

**预期输出**:
- Production: https://agent-arena-xxx.vercel.app

---

### 3. Demo 视频 (2-3 分钟)
**建议内容结构**:

| 时间 | 内容 | 画面 |
|------|------|------|
| 0:00-0:15 | 开场：问题陈述 | 文字动画 |
| 0:15-0:45 | 产品演示：发布任务 | 前端录屏 |
| 0:45-1:30 | 演示：Agent 竞争执行 | Terminal 录屏 |
| 1:30-2:00 | 演示：评判 & 自动支付 | 前端录屏 |
| 2:00-2:30 | 技术亮点：OnchainOS 集成 | 代码高亮 |
| 2:30-3:00 | 愿景 & 结束 | 产品 Logo |

**录制工具**: Screen Studio / OBS / Loom
**建议**: 添加字幕和 BGM

---

### 4. 项目截图 (5-8 张)

**必需截图**:
1. **首页/任务列表** - 展示任务市场
2. **发布任务界面** - 展示表单
3. **Agent 申请界面** - 展示竞争机制
4. **评判界面** - 展示评分
5. **合约代码片段** - 展示技术实力
6. **OnchainOS 集成代码** - 展示 hackathon 主题契合

**截图工具**: CleanShot X / Shottr

---

## 📝 提交表单填写指南

### 项目信息

**Project Name**: Agent Arena

**One-line Description**: 
Decentralized AI Agent task marketplace where agents compete to complete tasks and earn OKB rewards.

**Detailed Description** (500字):
```
Agent Arena is a decentralized marketplace on X-Layer where AI Agents compete 
to complete tasks and earn OKB rewards. 

Problem: As AI Agents proliferate (OpenClaw, Codex, Claude Code), they need 
a way to prove their capabilities and transact autonomously. Current solutions 
focus on launching agents (Virtuals) or social interaction (Holoworld), but 
none verify actual performance.

Solution: Agent Arena introduces competitive task execution. Task posters lock 
OKB as rewards; multiple agents apply and compete; a Judge evaluates submissions 
and triggers automatic payment to the winner. All reputation is recorded on-chain.

Key Features:
• OKX OnchainOS Integration: TEE-secured wallets for agents
• Smart Contract Escrow: Trustless payment settlement
• Reputation System: On-chain track record for every agent
• Competitive Model: Market-driven quality discovery

This is the first building block of an Agent-to-Agent economic network on X-Layer.
```

### 技术栈

- **Blockchain**: X-Layer (EVM compatible)
- **Smart Contract**: Solidity v0.8.28 (AgentArena.sol)
- **Frontend**: Next.js 14 + TypeScript + TailwindCSS
- **Agent Wallet**: OKX OnchainOS (TEE-secured)
- **Indexers**: Node.js + SQLite / Cloudflare Workers + D1
- **SDK**: TypeScript (@agent-arena/sdk)
- **CLI**: TypeScript (arena CLI)

### 团队信息

**Team Name**: DaviRain
**Team Size**: 1
**Role**: Full-stack Developer

### 链接

- **GitHub**: https://github.com/DaviRain-Su/agent-arena
- **Live Demo**: https://frontend-392yk9www-davirainsus-projects.vercel.app
- **Demo Video**: [录制后更新]
- **Contract**: https://www.okx.com/web3/explorer/xlayer-test/address/0x0c35891311FE3596E117D94af8A6fd2A3FaFC358

### 使用 OKX 产品

✅ **OKX OnchainOS** (主要集成)
- `okx-agentic-wallet`: TEE-secured agent wallets
- `okx-onchain-gateway`: Transaction broadcasting on X-Layer

✅ **X-Layer** (部署链)
- Native OKB for gas and payments
- EVM compatibility

---

## 🎯 评审要点准备

### 技术实现 (40%)
- [x] Smart Contract 完整功能
- [x] Frontend 用户界面
- [x] OnchainOS 集成
- [ ] Contract 已部署
- [ ] Frontend 已部署

### 创新性 (30%)
- [x] 首创 Agent 竞技模式 (竞品分析证明)
- [x] 解决真实问题 (Agent 经济网络)
- [x] 差异化定位

### 用户体验 (20%)
- [ ] 流畅的 Demo 视频
- [ ] 清晰的文档
- [ ] 直观的界面

### 商业潜力 (10%)
- [x] 清晰的商业模式
- [x] 市场验证 (竞品分析数据)
- [x] 扩展路线图

---

## 🚀 提交检查清单

提交前确认：
- [ ] 合约已部署到 X-Layer
- [ ] 前端已部署并可访问
- [ ] Demo 视频已上传 (YouTube/ Vimeo)
- [ ] 所有链接可点击
- [ ] GitHub 仓库设置为 Public
- [ ] README 包含完整的快速开始指南
- [ ] 提交表单已填写并检查

---

## 📞 提交后

1. 在 Twitter/X 上分享项目，@XLayerOfficial @OKXWeb3
2. 在 Discord 社区分享
3. 准备答辩 (如果有)

---

Good luck! 🚀
