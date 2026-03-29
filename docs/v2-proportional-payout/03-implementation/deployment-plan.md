# V2 部署计划

## 部署概览

```
Phase 1: 测试网验证 (3天)
Phase 2: 审计 (7-14天)  
Phase 3: 主网部署 (1天)
Phase 4: 监控 & 回滚准备 (持续)
```

## Phase 1: X-Layer Testnet 部署

### 步骤 1.1: 准备

```bash
# 环境检查
npx hardhat --version  # >= 2.19.0
node --version         # >= 18

# 环境变量
cat > .env.testnet << EOF
XLAYER_TESTNET_RPC=https://testrpc.xlayer.tech
PRIVATE_KEY_DEPLOYER=0x...
ETHERSCAN_API_KEY=...
EOF

# 编译
npx hardhat compile
npx hardhat size-contracts  # 检查合约大小 < 24KB
```

### 步骤 1.2: 部署 V1 Proxy

```typescript
// scripts/deploy/v1-proxy.ts
async function main() {
  // 1. 部署 V1 Implementation
  const V1 = await ethers.getContractFactory("AgentArenaV1");
  const v1 = await V1.deploy();
  await v1.deployed();
  console.log("V1 deployed to:", v1.address);
  
  // 2. 部署 Proxy
  const Proxy = await ethers.getContractFactory("AgentArenaProxy");
  const proxy = await Proxy.deploy(
    v1.address,
    v1.interface.encodeFunctionData("initialize", [JUDGE_ADDRESS])
  );
  await proxy.deployed();
  console.log("Proxy deployed to:", proxy.address);
  
  // 3. 验证
  await hre.run("verify:verify", {
    address: v1.address,
    constructorArguments: [],
  });
  
  // 保存地址
  fs.writeFileSync("deployments/testnet-v1.json", JSON.stringify({
    proxy: proxy.address,
    implementation: v1.address,
    timestamp: new Date().toISOString()
  }, null, 2));
}
```

**检查点**:
- [ ] Proxy 地址可用
- [ ] 可以通过 Proxy 调用 V1 函数
- [ ] Etherscan 验证通过

### 步骤 1.3: 模拟现有数据

```typescript
// scripts/deploy/seed-test-data.ts
async function main() {
  const arena = await ethers.getContractAt("AgentArena", PROXY_ADDRESS);
  
  // 创建 10 个 V1 任务 (模拟生产环境)
  for (let i = 0; i < 10; i++) {
    await arena.postTask(
      `Test task ${i}`,
      `ipfs://eval-${i}`,
      Math.floor(Date.now() / 1000) + 86400,
      { value: ethers.parseEther("0.01") }
    );
  }
  
  console.log("10 V1 tasks created");
}
```

### 步骤 1.4: 升级到 V2

```typescript
// scripts/deploy/upgrade-to-v2.ts
async function main() {
  // 1. 部署 V2 Implementation
  const V2 = await ethers.getContractFactory("AgentArenaV2");
  const v2 = await V2.deploy();
  await v2.deployed();
  console.log("V2 deployed to:", v2.address);
  
  // 2. 获取 ProxyAdmin
  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN_ADDRESS);
  
  // 3. 执行升级 (需要多签)
  console.log("Upgrading proxy...");
  const tx = await proxyAdmin.upgrade(PROXY_ADDRESS, v2.address);
  await tx.wait();
  console.log("Upgrade complete");
  
  // 4. 初始化 V2
  const arena = await ethers.getContractAt("AgentArenaV2", PROXY_ADDRESS);
  await arena.initializeV2();
  
  // 5. 验证
  await hre.run("verify:verify", {
    address: v2.address,
    constructorArguments: [],
  });
  
  // 保存
  fs.writeFileSync("deployments/testnet-v2.json", JSON.stringify({
    proxy: PROXY_ADDRESS,
    v1: V1_ADDRESS,
    v2: v2.address,
    timestamp: new Date().toISOString()
  }, null, 2));
}
```

### 步骤 1.5: 完整 E2E 测试

```bash
#!/bin/bash
# scripts/e2e/testnet-full-flow.sh

set -e

echo "=== Testnet V2 Full Flow Test ==="

# 配置
export ARENA_RPC=https://testrpc.xlayer.tech
export ARENA_CONTRACT=$(cat deployments/testnet-v2.json | jq -r .proxy)

# 测试 1: V1 任务仍然工作
echo "Test 1: V1 compatibility..."
arena post --type fixed --reward 0.001 --description "V1 test"

# 测试 2: V2 Proportional 任务
echo "Test 2: V2 proportional task..."
TASK_ID=$(arena post --type proportional --reward 0.01 --threshold 70 \
  --description "V2 test" | grep "taskId:" | awk '{print $2}')

# 测试 3: 多 Agent 提交
for i in {1..3}; do
  echo "Agent $i submitting..."
  arena submit $TASK_ID --agent-key $AGENT_KEY_$i
done

# 测试 4: 结算
echo "Settlement..."
sleep 5  # 等待 Judge
arena settle $TASK_ID

# 测试 5: 验证余额
echo "Verifying balances..."
# ... balance checks

echo "=== All Tests Passed ==="
```

**检查点**:
- [ ] 旧 V1 任务数据完整
- [ ] V2 新功能可用
- [ ] 结算正确
- [ ] Gas 在预期范围

---

## Phase 2: 安全审计

### 审计范围

```markdown
# audit-scope.md

## 合约
- AgentArenaProxy.sol
- AgentArenaV1.sol  
- AgentArenaV2.sol
- ProxyAdmin.sol

## 重点审计点
1. 存储槽位冲突 (Proxy 模式)
2. 重入攻击 (settleProportional 多转账)
3. 整数溢出 (分数计算)
4. 访问控制 (onlyJudge, onlyOwner)
5. 升级权限 (ProxyAdmin 安全)

## 不在审计范围
- Judge 服务 (链下)
- Indexer (链下)
- CLI 工具

## 审计预算
- 2 家审计公司并行
- 预算: $20K - $30K
- 时间: 7-14 天
```

### 审计公司选择

| 公司 | 专长 | 报价 | 时间 |
|------|------|------|------|
| OpenZeppelin | 升级模式 | $25K | 14天 |
| Trail of Bits | DeFi 协议 | $30K | 10天 |
| Certik | 快速审计 | $15K | 7天 |
| Code4rena | 社区审计 | $20K | 7天 |

**建议**: OpenZeppelin + Code4rena (双保险)

### 审计准备清单

```bash
# 1. 完整文档
- [ ] 架构设计文档
- [ ] 合约注释 (NatSpec)
- [ ] 测试覆盖报告 (>95%)
- [ ] 已知问题清单

# 2. 部署信息
- [ ] Testnet 地址
- [ ] 测试账号私钥 (仅测试网)
- [ ] 复现步骤文档

# 3. 代码冻结
- [ ] Git commit hash: 0x...
- [ ] 代码冻结日期
- [ ] 审计期间不修改代码
```

---

## Phase 3: X-Layer Mainnet 部署

### 部署前检查表

```markdown
## 主网部署检查表

### 资金准备
- [ ] Deployer 钱包: 1 OKB (gas)
- [ ] ProxyAdmin 多签: 3/5 签名者确认
- [ ] 应急资金: 10 OKB (意外情况)

### 合约准备
- [ ] 代码最终审计通过
- [ ] 所有审计问题修复并验证
- [ ] Testnet 运行 7 天无故障
- [ ] 合约大小 < 24KB

### 基础设施
- [ ] Indexer 已更新支持 V2
- [ ] Judge 服务已部署
- [ ] 监控告警配置完成
- [ ] 回滚方案准备就绪

### 团队准备
- [ ] 部署团队待命 (24h)
- [ ] 多签持有者在线
- [ ] 社区公告已准备
```

### 主网部署步骤

```typescript
// scripts/deploy/mainnet-deploy.ts

const MAINNET_CONFIG = {
  rpc: "https://rpc.xlayer.tech",
  chainId: 196,
  judgeAddress: "0x...",  // 生产 Judge 地址
};

async function main() {
  console.log("=== Mainnet Deployment ===");
  console.log("Time:", new Date().toISOString());
  
  // 1. 确认网络
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 196n) {
    throw new Error("Not on X-Layer mainnet!");
  }
  
  // 2. 检查余额
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "OKB");
  if (balance < ethers.parseEther("0.5")) {
    throw new Error("Insufficient balance");
  }
  
  // 3. 部署 V1 (如果尚未部署)
  // 如果 V1 已运行，则直接升级
  
  // 4. 部署 V2 Implementation
  console.log("Deploying V2...");
  const V2 = await ethers.getContractFactory("AgentArenaV2");
  const v2 = await V2.deploy();
  await v2.deployed();
  console.log("V2 deployed:", v2.address);
  
  // 5. 升级 (通过多签)
  console.log("Please execute upgrade via multisig:");
  console.log("  ProxyAdmin.upgrade(", PROXY_ADDRESS, ",", v2.address, ")");
  
  // 6. 验证
  await hre.run("verify:verify", {
    address: v2.address,
    constructorArguments: [],
  });
  
  // 7. 保存部署信息
  fs.writeFileSync("deployments/mainnet-v2.json", JSON.stringify({
    network: "xlayer-mainnet",
    proxy: PROXY_ADDRESS,
    v2: v2.address,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    txHash: v2.deployTransaction.hash
  }, null, 2));
}
```

### 主网验证

```bash
# 1. 合约验证
npx hardhat verify --network xlayer-mainnet V2_ADDRESS

# 2. 功能验证
export ARENA_RPC=https://rpc.xlayer.tech
export ARENA_CONTRACT=PROXY_ADDRESS

# 测试 V1 兼容
arena post --type fixed --reward 0.001 --description "V1 smoke test"

# 测试 V2 功能
arena post --type proportional --reward 0.01 --threshold 70 \
  --description "V2 smoke test"

# 3. 监控检查
# - 交易是否成功
# - Gas 使用是否正常
# - Indexer 是否同步
```

---

## Phase 4: 监控 & 回滚

### 监控仪表板

```typescript
// monitoring/v2-metrics.ts

const METRICS = {
  // 业务指标
  'v2_tasks_created': 'Counter',      // Type B 任务数
  'v2_submissions_count': 'Counter',  // 提交数
  'v2_settlements': 'Counter',        // 结算数
  'v2_avg_submissions_per_task': 'Gauge',  // 平均提交数
  
  // 技术指标
  'v2_settle_gas_used': 'Histogram',  // 结算 Gas
  'v2_contract_calls': 'Counter',     // 调用次数
  'v2_errors': 'Counter',             // 错误数
  
  // 安全指标
  'v2_disputes': 'Counter',           // 争议数
  'v2_failed_transfers': 'Counter',   // 转账失败
};

// 告警规则
const ALERTS = [
  {
    name: 'HighGasUsage',
    condition: 'v2_settle_gas_used > 500000',
    severity: 'warning',
  },
  {
    name: 'SettlementFailure',
    condition: 'v2_errors{type="settlement"} > 0',
    severity: 'critical',
  },
  {
    name: 'NoSubmissions',
    condition: 'v2_tasks_created - v2_submissions_count > 10',
    severity: 'info',
  },
];
```

### 回滚方案

```solidity
// 紧急回滚脚本
// scripts/emergency/rollback-to-v1.ts

async function emergencyRollback() {
  console.log("🚨 EMERGENCY ROLLBACK INITIATED");
  
  // 1. 获取当前状态
  const arena = await ethers.getContractAt("AgentArenaV2", PROXY_ADDRESS);
  const taskCount = await arena.taskCount();
  console.log("Current task count:", taskCount);
  
  // 2. 检查是否有进行中任务
  let inProgressTasks = 0;
  for (let i = 0; i < taskCount; i++) {
    const task = await arena.tasks(i);
    if (task.status === 1) { // InProgress
      inProgressTasks++;
    }
  }
  
  if (inProgressTasks > 0) {
    console.warn(`⚠️ ${inProgressTasks} tasks in progress!`);
    console.log("Options:");
    console.log("1. Wait for completion");
    console.log("2. Force refund all");
    console.log("3. Proceed anyway (risky)");
    
    // 人工确认...
  }
  
  // 3. 执行回滚
  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN_ADDRESS);
  const tx = await proxyAdmin.upgrade(PROXY_ADDRESS, V1_ADDRESS);
  await tx.wait();
  
  console.log("✅ Rollback complete");
  console.log("Proxy now points to V1:", V1_ADDRESS);
}
```

### 紧急联系

```markdown
## 应急响应

### 升级失败
1. 立即停止所有新任务创建
2. 执行回滚脚本
3. 通知社区 (Discord, Twitter)

### 资金冻结
1. 确认问题范围
2. 联系 X-Layer 支持 (如需要)
3. 准备赔偿方案

### 联系人
- 技术负责人: Davirian
- 多签持有者: [列表]
- X-Layer 支持: support@xlayer.com
- 审计公司: [联系方式]
```

---

## 部署时间线

```
Day 1-3:   Testnet 部署 + E2E 测试
Day 4-17:  审计 (并行)
Day 18-20: 审计修复 + 复测
Day 21:    主网部署 (预计 2 小时)
Day 22-28: 监控期 (24/7 待命)
Day 30:    正式运营
```

## 成功标准

- [ ] Testnet 运行 7 天无故障
- [ ] 审计通过，所有高危问题修复
- [ ] 主网部署成功，首笔交易确认
- [ ] 7 天内无重大故障
- [ ] 社区反馈正面
