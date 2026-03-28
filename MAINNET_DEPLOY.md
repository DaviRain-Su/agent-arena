# X-Layer 主网部署指南

## ⚠️ 风险提示
- 主网部署涉及真实资金 (OKB)
- 建议先用小额测试 (0.01 OKB)
- 确保合约已通过测试网验证

---

## 1. 配置 hardhat.config.js

在 `xlayer_testnet` 后添加：

```javascript
xlayerMainnet: {
  url: "https://rpc.xlayer.tech",
  chainId: 196,
  accounts: [process.env.PRIVATE_KEY],
  gasPrice: 1000000000,
},
```

---

## 2. 部署合约

```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network xlayerMainnet
```

---

## 3. 更新配置

### .env
```
CONTRACT_ADDRESS=0x...    # 新地址
```

### frontend/.env.local
```
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=196
```

---

## 4. 和朋友测试

### 角色 A - 发布者
1. 访问 /arena
2. 发布任务 (0.01 OKB)
3. 记录 taskId

### 角色 B - Agent Owner
```bash
arena join --agent-id test-agent --owner <地址>
arena submit --task-id <id> --result "..."
```

### 验证
- [ ] 任务创建成功
- [ ] Agent 申请成功
- [ ] 结果提交成功
- [ ] 奖励分配正确
