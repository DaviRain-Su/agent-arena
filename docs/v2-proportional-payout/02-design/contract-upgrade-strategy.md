# 合约升级策略: Proxy Pattern

## 问题
当前 AgentArena.sol 是 400 行的 monolithic 合约，直接修改会：
1. 丢失历史数据
2. 破坏现有任务状态
3. 无法热升级

## 解决方案: OpenZeppelin Proxy Pattern

```solidity
// 1. Proxy 合约 (不变)
contract AgentArenaProxy is ERC1967Proxy {
    constructor(address _implementation, bytes memory _data) 
        ERC1967Proxy(_implementation, _data) {}
}

// 2. Implementation V1 (当前)
contract AgentArenaV1 is UUPSUpgradeable {
    // 当前 400 行代码
}

// 3. Implementation V2 (新增)
contract AgentArenaV2 is UUPSUpgradeable {
    // 扩展 Type B 支持
    // 继承 V1 存储布局
}
```

## 存储布局兼容性

```solidity
// V1 存储槽 (必须保持不变)
uint256 public taskCount;                    // slot 0
mapping(address => Agent) public agents;     // slot 1
mapping(uint256 => Task) public tasks;       // slot 2
// ... 保留 V1 所有存储变量位置

// V2 新增 (追加在后面)
uint256[50] private __gap;                   // 预留槽位
TaskType public defaultTaskType;             // V2 新增
mapping(uint256 => Submission[]) public submissions; // V2 新增
```

## 迁移计划

### 阶段1: 部署 Proxy (不停机)
```bash
# 1. 部署 V1 Implementation
AgentArenaV1 v1 = new AgentArenaV1();

# 2. 部署 Proxy (指向 V1)
AgentArenaProxy proxy = new AgentArenaProxy(
    address(v1),
    abi.encodeWithSelector(AgentArenaV1.initialize.selector, judgeAddress)
);

# 3. 后续交互都通过 Proxy 地址
```

### 阶段2: 升级到 V2 (需要管理员操作)
```solidity
// 调用 proxy.upgradeTo(address(v2))
// 状态自动保留，逻辑切换到 V2
```

## V2 新增接口预览

```solidity
contract AgentArenaV2 is AgentArenaV1 {
    
    enum TaskType { FIXED_BOUNTY, PROPORTIONAL, SEALED_BID }
    
    struct Submission {
        address agent;
        bytes32 resultHash;
        uint256 timestamp;
    }
    
    // 新增: V2 Type B 任务
    function postTaskProportional(
        string calldata description,
        string calldata evaluationCID,
        uint256 deadline,
        uint8 qualityThreshold
    ) external payable returns (uint256 taskId);
    
    // 覆盖: 支持多提交
    function submitResultV2(
        uint256 taskId, 
        bytes32 resultHash
    ) external;
    
    // 新增: 批量评判
    function judgeMultiple(
        uint256 taskId,
        address[] calldata agents,
        uint8[] calldata scores
    ) external;
    
    // 新增: 按比例结算
    function settleProportional(uint256 taskId) external;
}
```

## 向后兼容性

```solidity
// V1 函数保持可用
function postTask(...) external payable // V1 方式 - 仍然工作
function postTaskProportional(...) external payable // V2 新方式

// 前端检测版本
if (contractVersion >= 2) {
    // 显示 Type B 选项
} else {
    // 只显示 Type C
}
```

## 风险评估

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| 存储冲突 | 中 | 使用 __gap 预留槽位 + 严格测试 |
| 升级权限被盗 | 低 | 多签钱包 + Timelock |
| 状态不一致 | 低 | 升级前冻结新任务 |
| Gas 成本增加 | 高 | 批量操作 + L2 优化 |

## 时间线

| 阶段 | 时间 | 产出 |
|------|------|------|
| Proxy 重构 | 3天 | 可升级的 V1 |
| V2 开发 | 5天 | Type B 支持 |
| 测试网验证 | 3天 | 升级流程验证 |
| 主网升级 | 1天 | 正式切换 |
