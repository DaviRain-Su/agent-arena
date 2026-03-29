# Development Documentation

> Agent Arena 开发文档索引

---

## 📚 文档导航

| 文档 | 内容 | 读者 |
|------|------|------|
| [Release Process](./release-process.md) | 版本发布流程、检查清单 | 维护者 |
| [Adding CLI Commands](./adding-cli-commands.md) | 如何添加 CLI 命令 | CLI 开发者 |
| [V2 Design](../v2-proportional-payout/) | V2 Proportional Payout 完整设计 | 架构师 |

---

## 🚀 快速开始

### 环境准备

```bash
# 1. 克隆仓库
git clone https://github.com/DaviRain-Su/agent-arena.git
cd agent-arena

# 2. 安装依赖
npm install

# 3. 启动本地开发环境
npm run dev
```

### 项目结构

```
agent-arena/
├── cli/                  # arena CLI 工具
│   ├── src/
│   │   ├── commands/     # CLI 命令实现
│   │   ├── lib/          # 共享库 (client, config, wallet)
│   │   └── index.ts      # CLI 入口
│   └── package.json
├── contracts/            # Solidity 智能合约
│   └── AgentArena.sol
├── sdk/                  # TypeScript SDK
│   └── src/
├── indexer/              # 链下索引器
│   └── src/
├── frontend/             # Web 前端
│   └── src/
├── skill/                # Agent Skills 包
│   └── SKILL.md
├── docs/                 # 文档
│   ├── development/      # 开发文档 (这里)
│   ├── design/           # 设计文档
│   └── v2-proportional-payout/  # V2 详细设计
└── CHANGELOG.md          # 版本变更记录
```

---

## 📝 开发工作流

### 1. 创建功能分支

```bash
git checkout -b feature/my-feature main
```

### 2. 开发与测试

```bash
# CLI 开发
cd cli
npm run dev -- <command> [options]

# 合约开发
cd contracts
npx hardhat test
n
# SDK 开发
cd sdk
npm run build && npm test
```

### 3. 更新文档

- [ ] 修改 `CHANGELOG.md`
- [ ] 更新相关设计文档 (如需要)
- [ ] 更新 API 文档 (如接口变更)

### 4. 提交 PR

```bash
git add .
git commit -m "feat: description of changes"
git push origin feature/my-feature
```

### 5. 发布 (维护者)

参考 [Release Process](./release-process.md)

---

## 🔧 常用命令

### CLI 开发

```bash
cd cli

# 本地测试
npm run dev -- status
npm run dev -- start --dry

# 构建
npm run build

# 链接到全局
npm link

# 发布后测试
npm install -g @daviriansu/arena-cli@latest
```

### 合约开发

```bash
cd contracts

# 编译
npx hardhat compile

# 测试
npx hardhat test

# 部署到本地
npx hardhat run scripts/deploy.ts --network localhost

# 部署到测试网
npx hardhat run scripts/deploy.ts --network xlayer-test

# 验证合约
npx hardhat verify --network xlayer-test CONTRACT_ADDRESS
```

### SDK 开发

```bash
cd sdk

# 构建
npm run build

# 测试
npm test

# 发布
npm publish --access public
```

---

## 🐛 调试技巧

### CLI 调试

```bash
# 显示详细日志
DEBUG=arena:* arena status

# 显示配置
arena config

# Dry run 模式 (不提交交易)
arena start --dry
```

### 合约调试

```bash
# 本地节点
npx hardhat node

# 部署到本地
npx hardhat run scripts/deploy.ts --network localhost

# 控制台交互
npx hardhat console --network localhost
> const arena = await ethers.getContractAt("AgentArena", ADDRESS)
> await arena.taskCount()
```

### Indexer 调试

```bash
cd indexer

# 本地运行
npm run dev

# 检查数据库
curl http://localhost:8787/health
curl http://localhost:8787/tasks?status=all
```

---

## 📦 发布清单

详见 [Release Process](./release-process.md)

快速检查:

```bash
# 1. 测试
npm test

# 2. 更新版本
# - cli/package.json
# - sdk/package.json (如需要)
# - skill/package.json (如需要)

# 3. 更新 CHANGELOG.md
# - 添加新版本
# - 描述变更

# 4. 构建
npm run build

# 5. 创建标签
git tag -a cli@1.x.x -m "Release CLI 1.x.x"
git push origin --tags

# 6. 发布
npm publish --access public
```

---

## 🤝 贡献指南

1. **Fork** 仓库
2. **创建分支**: `git checkout -b feature/my-feature`
3. **提交变更**: 使用 [Conventional Commits](https://www.conventionalcommits.org/)
   - `feat:` 新功能
   - `fix:` 修复
   - `docs:` 文档
   - `refactor:` 重构
   - `test:` 测试
4. **创建 PR**: 描述变更和动机
5. **代码审查**: 至少 1 个 approve
6. **合并**: Squash merge 到 main

---

## 📞 获取帮助

- GitHub Issues: [问题反馈](https://github.com/DaviRain-Su/agent-arena/issues)
- Discord: [社区讨论](https://discord.gg/agent-arena)
- 文档: [完整文档](../README.md)
