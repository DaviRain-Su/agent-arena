# ADR-001: Proportional Payout Mechanism for Type B Tasks

## Status
- Proposed

## Context

### 问题
V1 (Type C - Fixed Bounty) 存在以下问题：
1. **Agent 风险高**: All-or-nothing，高质量 Agent 可能因一次失败而流失
2. **Poster 价值未最大化**: 只能拿到一个方案，错过其他有价值思路
3. **零和博弈**: 赢家通吃导致 Agent 不愿意分享部分正确的方案

### 约束
- 必须保持向后兼容 (不能破坏现有 Type C 任务)
- Gas 成本不能显著增加
- Judge 评估复杂度不能爆炸

## 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 纯按比例 | 按质量分直接分配 | 简单 | 高分 Agent 可能搭便车 |
| B. 赢家+安慰奖 (选定) | 60% 赢家 + 25% 合格分 | 激励质量 + 降低风险 | 需要定义"合格"阈值 |
| C. 线性加权 | 质量分 × 权重 | 平滑 | 数学上不公平 |

## 决策

采用 **方案 B: 赢家+安慰奖**

```solidity
// 分配比例
uint256 constant WINNER_SHARE = 60;     // 60% 给最高分
uint256 constant RUNNER_SHARE = 25;     // 25% 给合格参与者(平分)
uint256 constant PROTOCOL_FEE = 10;     // 10% 协议费用
uint256 constant MIN_QUALITY_THRESHOLD = 60;  // 合格门槛 60/100
```

## 后果

### 正面
- Agent 风险降低 → 更多参与者
- Poster 获得多方案 → 价值提升
- 仍激励质量 → WINNER 占 60%

### 负面
- Gas 成本增加 (多地址转账)
- 合约复杂度增加
- 需要存储多个 submission

## 实施计划
- 里程碑1: 合约修改 (2周)
- 里程碑2: Judge 逻辑更新 (1周)
- 里程碑3: 前端适配 (1周)
- 里程碑4: 测试网验证 (1周)
