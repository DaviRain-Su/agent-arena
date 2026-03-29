# 文档提交指南

## ✅ 本次新增文档清单

### 1. V2 Proportional Payout 完整设计
```
docs/v2-proportional-payout/
├── 01-thinking/
│   └── ADR-001-proportional-payout.md      # 决策记录
├── 02-design/
│   ├── system-design.md                    # 系统架构
│   ├── data-model.md                       # 数据模型
│   ├── state-machine.md                    # 状态机
│   ├── sequence-diagrams.md                # 时序图
│   └── contract-upgrade-strategy.md        # 升级策略
└── 03-implementation/
    ├── task-breakdown.md                   # 任务拆解(4周)
    ├── test-plan.md                        # 测试计划
    └── deployment-plan.md                  # 部署计划
```

### 2. 开发流程文档
```
docs/development/
├── README.md                               # 开发文档索引
├── release-process.md                      # 发布流程和检查清单
└── adding-cli-commands.md                  # CLI命令开发指南

cli/src/commands/changelog.ts               # CLI changelog命令
.github/workflows/changelog-check.yml       # CI自动检查
```

### 3. 跨学科研究文档
```
docs/research/
├── README.md                               # 研究文档索引
├── interdisciplinary-analysis.md           # 多学科视角分析
└── competition-vs-cooperation.md           # 竞争vs合作模型
```

### 4. 项目维护文档
```
CHANGELOG.md                                # 版本变更记录
docs/README.md                              # 文档索引(已更新)
```

---

## 🚀 提交命令

### 方式一：一次提交（推荐）

```bash
# 1. 添加所有变更
git add CHANGELOG.md \
    .github/workflows/changelog-check.yml \
    cli/src/commands/changelog.ts \
    docs/development/ \
    docs/research/ \
    docs/v2-proportional-payout/ \
    docs/README.md

# 2. 提交
git commit -m "docs: comprehensive documentation update

V2 Proportional Payout Design:
- Complete design docs: ADR, system, data model, state machine
- Implementation plan: 4-week roadmap, test plan, deployment

Development Process:
- CHANGELOG.md with version history
- CI workflow for changelog validation
- CLI changelog command implementation
- Release process documentation

Interdisciplinary Research:
- Biology, physics, economics perspectives on Agent competition
- Competition vs cooperation analysis (vs Virtuals model)
- Protocol positioning as infrastructure layer"

# 3. 推送
git push origin main
```

### 方式二：分两次提交

```bash
# 第一次：V2 设计文档
git add docs/v2-proportional-payout/
git commit -m "docs: V2 Proportional Payout complete design

- ADR-001: Design rationale for proportional payout mechanism
- System design: Type B task architecture
- Data model: storage layout and events
- State machine: task lifecycle
- Sequence diagrams: full interaction flows
- Upgrade strategy: OpenZeppelin proxy pattern
- Implementation: 4-week task breakdown
- Test plan: unit, integration, E2E, gas benchmarks
- Deployment plan: testnet → audit → mainnet"

# 第二次：流程和研究文档
git add CHANGELOG.md \
    .github/workflows/changelog-check.yml \
    cli/src/commands/changelog.ts \
    docs/development/ \
    docs/research/ \
    docs/README.md
git commit -m "docs: development process and research docs

Process:
- CHANGELOG.md: Keep a Changelog format
- CI: automatic changelog check on PR
- Release process: checklist and version management
- CLI: changelog command implementation guide

Research:
- Interdisciplinary analysis (biology, physics, economics, CS)
- Competition vs cooperation model comparison
- Protocol positioning as evaluation infrastructure"

# 推送
git push origin main
```

---

## 📊 文档统计

| 类别 | 文件数 | 主要贡献 |
|------|--------|---------|
| V2 设计 | 9 | 完整实施路线图 |
| 开发流程 | 5 | CI/CD + CLI |
| 研究分析 | 3 | 跨学科理论基础 |
| 维护 | 2 | 版本管理 |
| **总计** | **19** | **~50KB** |

---

## ✅ 提交前最后检查

- [x] 所有文档已保存
- [x] docs/README.md 已更新索引
- [x] 文件路径正确
- [x] Markdown 格式规范

文档已准备就绪，可以提交！
