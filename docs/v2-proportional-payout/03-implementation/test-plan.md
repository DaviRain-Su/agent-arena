# V2 测试计划

## 测试金字塔

```
        /\
       /  \
      / E2E\          (10%)  完整流程测试
     /--------\       
    /Integration\     (30%)  合约+Judge+Indexer
   /--------------\
  /    Unit        \  (60%)  函数级测试
 /------------------\
```

## 1. 单元测试 (Hardhat)

### 1.1 数据结构测试

```javascript
// test/v2/01-data-structures.test.ts
describe("V2 Data Structures", () => {
  it("should create proportional task with correct defaults", async () => {
    const tx = await arena.postTaskProportional(
      "Test task",
      "ipfs://eval",
      deadline,
      70  // quality threshold
    );
    
    const task = await arena.tasks(0);
    expect(task.taskType).to.equal(1); // PROPORTIONAL
    expect(task.qualityThreshold).to.equal(70);
    expect(task.submissionCount).to.equal(0);
  });
  
  it("should store submission correctly", async () => {
    await arena.connect(agent1).submitResultV2(0, hash1);
    
    const submission = await arena.taskSubmissions(0, 0);
    expect(submission.agent).to.equal(agent1.address);
    expect(submission.resultHash).to.equal(hash1);
  });
});
```

### 1.2 结算算法测试

```javascript
// test/v2/02-settlement-algorithm.test.ts
describe("Settlement Algorithm", () => {
  const testCases = [
    {
      name: "3 qualified submissions",
      scores: [90, 80, 70],
      threshold: 60,
      reward: ethers.parseEther("0.01"),
      expected: {
        winner: 0, // index 0 (score 90)
        winnerAmount: ethers.parseEther("0.006"), // 60%
        runnerShares: [
          ethers.parseEther("0.00125"), // 25%/2
          ethers.parseEther("0.00125")
        ],
        protocolFee: ethers.parseEther("0.001") // 10%
      }
    },
    {
      name: "1 qualified submission",
      scores: [85],
      threshold: 60,
      expected: {
        winner: 0,
        winnerAmount: ethers.parseEther("0.009"), // 90% (no runner share)
        protocolFee: ethers.parseEther("0.001")
      }
    },
    {
      name: "0 qualified submissions",
      scores: [55, 50],
      threshold: 60,
      expected: "REFUND"
    },
    {
      name: "Edge: max submissions",
      scores: Array(50).fill(75), // 50 submissions
      threshold: 60,
      expected: {
        // Gas 测试
        gasLimit: 300000
      }
    }
  ];
  
  testCases.forEach(tc => {
    it(tc.name, async () => {
      // Setup task with submissions
      // Judge with scores
      // Verify payouts
    });
  });
});
```

### 1.3 边界条件测试

```javascript
// test/v2/03-edge-cases.test.ts
describe("Edge Cases", () => {
  it("should reject submission after deadline", async () => {
    await time.increase(SUBMISSION_DEADLINE + 1);
    await expect(
      arena.submitResultV2(0, hash)
    ).to.be.revertedWith("Submission closed");
  });
  
  it("should prevent double submission from same agent", async () => {
    await arena.connect(agent).submitResultV2(0, hash1);
    await expect(
      arena.connect(agent).submitResultV2(0, hash2)
    ).to.be.revertedWith("Already submitted");
  });
  
  it("should handle max submissions limit", async () => {
    // Create 50 submissions
    for (let i = 0; i < 50; i++) {
      await arena.connect(agents[i]).submitResultV2(0, hash);
    }
    
    // 51st should fail
    await expect(
      arena.connect(agents[50]).submitResultV2(0, hash)
    ).to.be.revertedWith("Max submissions reached");
  });
  
  it("should handle transfer failure gracefully", async () => {
    // Deploy malicious agent that rejects payment
    const MaliciousAgent = await ethers.getContractFactory("MaliciousAgent");
    const malicious = await MaliciousAgent.deploy();
    
    // Setup task...
    // Settlement should not revert, but mark as failed
    // Agent can claim later
  });
});
```

## 2. 集成测试

### 2.1 合约 + Judge 集成

```javascript
// test/v2/04-judge-integration.test.ts
describe("Judge Integration", () => {
  it("should complete full flow: post -> submit -> judge -> settle", async () => {
    // 1. Post task
    const taskId = await postProportionalTask();
    
    // 2. Multiple agents submit
    await Promise.all(agents.map(a => submit(a, taskId)));
    
    // 3. Start judging phase
    await arena.startJudging(taskId);
    
    // 4. Judge evaluates off-chain
    const evaluations = await judgeService.evaluate(taskId);
    // [{agent: A1, score: 90}, {agent: A2, score: 80}]
    
    // 5. Submit judgement on-chain
    await arena.connect(judge).judgeMultiple(
      taskId,
      evaluations.map(e => e.agent),
      evaluations.map(e => e.score)
    );
    
    // 6. Settlement
    const tx = await arena.settleProportional(taskId);
    
    // 7. Verify balances
    expect(await getBalance(winner)).to.increase(winnerAmount);
    expect(await getBalance(runner)).to.increase(runnerAmount);
  });
});
```

### 2.2 合约 + Indexer 集成

```javascript
// test/v2/05-indexer-integration.test.ts
describe("Indexer Sync", () => {
  it("should sync all V2 events correctly", async () => {
    // 1. Execute contract transactions
    const tx1 = await arena.postTaskProportional(...);
    const tx2 = await arena.connect(agent).submitResultV2(...);
    
    // 2. Wait for Indexer sync
    await waitForSync(5000);
    
    // 3. Query Indexer API
    const response = await fetch(`http://localhost:8787/tasks/${taskId}`);
    const data = await response.json();
    
    // 4. Verify data consistency
    expect(data.task_type).to.equal("PROPORTIONAL");
    expect(data.submissions).to.have.length(1);
    expect(data.submissions[0].agent).to.equal(agent.address);
  });
});
```

## 3. E2E 测试

### 3.1 CLI 完整流程

```bash
#!/bin/bash
# test/e2e/v2-cli-flow.sh

set -e

echo "=== V2 CLI E2E Test ==="

# Setup
export ARENA_RPC="http://localhost:8545"
export ARENA_PRIVATE_KEY="0x..."

# 1. Post proportional task
echo "1. Posting proportional task..."
TASK_OUTPUT=$(arena post \
  --type proportional \
  --description "Write a Fibonacci function" \
  --reward 0.01 \
  --threshold 70)

TASK_ID=$(echo $TASK_OUTPUT | grep -o "taskId: [0-9]*" | cut -d' ' -f2)
echo "   Task ID: $TASK_ID"

# 2. Multiple agents submit
for i in {1..3}; do
  echo "2.$i Agent $i submitting..."
  export ARENA_PRIVATE_KEY="0xAGENT${i}_KEY"
  arena submit $TASK_ID --result "result$i.json"
done

# 3. Check submissions
echo "3. Checking submissions..."
arena status --task $TASK_ID | grep "submissions: 3"

# 4. Wait for judging
sleep 5

# 5. Verify settlement
echo "5. Verifying settlement..."
arena status --task $TASK_ID | grep "status: Completed"

echo "=== E2E Test Passed ==="
```

### 3.2 升级流程 E2E

```javascript
// test/e2e/upgrade-flow.test.ts
describe("Contract Upgrade E2E", () => {
  it("should upgrade from V1 to V2 without data loss", async () => {
    // 1. Deploy V1
    const { proxy, v1 } = await deployV1();
    
    // 2. Create some V1 tasks
    await proxy.postTask("V1 task", "eval", deadline);
    
    // 3. Upgrade to V2
    const v2 = await deployV2();
    await proxy.upgradeTo(v2.address);
    
    // 4. Verify old task still works
    const oldTask = await proxy.tasks(0);
    expect(oldTask.description).to.equal("V1 task");
    
    // 5. Create V2 task
    await proxy.postTaskProportional("V2 task", "eval", deadline, 60);
    
    // 6. Both tasks should coexist
    const newTask = await proxy.tasks(1);
    expect(newTask.taskType).to.equal(1); // PROPORTIONAL
  });
});
```

## 4. 性能测试

### 4.1 Gas 基准

```javascript
// test/v2/06-gas-benchmark.test.ts
describe("Gas Benchmarks", () => {
  const gasReport = {};
  
  after(async () => {
    console.table(gasReport);
  });
  
  it("measure postTaskProportional", async () => {
    const tx = await arena.postTaskProportional(...);
    const receipt = await tx.wait();
    gasReport["postTaskProportional"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.lt(200000);
  });
  
  it("measure submitResultV2", async () => {
    const tx = await arena.submitResultV2(0, hash);
    const receipt = await tx.wait();
    gasReport["submitResultV2"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.lt(100000);
  });
  
  it("measure settleProportional (n=5)", async () => {
    // Setup 5 submissions
    const tx = await arena.settleProportional(0);
    const receipt = await tx.wait();
    gasReport["settleProportional (n=5)"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.lt(300000);
  });
  
  it("measure settleProportional (n=50)", async () => {
    // Setup 50 submissions
    const tx = await arena.settleProportional(1);
    const receipt = await tx.wait();
    gasReport["settleProportional (n=50)"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.lt(1000000);
  });
});
```

### 4.2 并发测试

```javascript
// test/v2/07-concurrency.test.ts
describe("Concurrent Submissions", () => {
  it("should handle 100 concurrent submissions", async () => {
    const taskId = await createProportionalTask();
    
    // 100 agents submit simultaneously
    const promises = agents.map((agent, i) => 
      arena.connect(agent).submitResultV2(taskId, `hash${i}`)
    );
    
    await Promise.all(promises);
    
    const task = await arena.tasks(taskId);
    expect(task.submissionCount).to.equal(100);
  });
});
```

## 5. 安全测试

### 5.1 重入攻击

```solidity
// contracts/test/ReentrancyAttacker.sol
contract ReentrancyAttacker {
    AgentArena public target;
    uint256 public taskId;
    
    function attack() external {
        // Attempt reentrant settleProportional
        target.settleProportional(taskId);
    }
    
    receive() external payable {
        // Reenter
        if (gasleft() > 100000) {
            target.settleProportional(taskId);
        }
    }
}
```

### 5.2 Fuzzing 测试

```javascript
// test/v2/08-fuzzing.test.ts
describe("Fuzzing", () => {
  it("should handle random scores", async () => {
    for (let i = 0; i < 100; i++) {
      const scores = Array(5).fill(0).map(() => Math.floor(Math.random() * 101));
      const threshold = Math.floor(Math.random() * 100);
      
      // Should not revert
      await arena.testCalculatePayouts(scores, threshold);
    }
  });
});
```

## 6. 测试覆盖率目标

| 指标 | 目标 | 验证 |
|------|------|------|
| 行覆盖率 | >95% | `npx hardhat coverage` |
| 分支覆盖率 | >90% | `npx hardhat coverage` |
| 函数覆盖率 | 100% | `npx hardhat coverage` |
| Gas 基准 | 有记录 | 每次 CI 对比 |
| E2E 通过率 | 100% | 每次发布前 |

## 7. CI/CD 集成

```yaml
# .github/workflows/v2-test.yml
name: V2 Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm ci
      
      - name: Compile contracts
        run: npx hardhat compile
      
      - name: Run unit tests
        run: npx hardhat test test/v2/*.test.ts
      
      - name: Run coverage
        run: npx hardhat coverage
      
      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/lcov.info | grep -o "LF:[0-9]*" | head -1 | cut -d: -f2)
          if [ $COVERAGE -lt 95 ]; then exit 1; fi
      
      - name: Gas report
        run: npx hardhat test test/v2/06-gas-benchmark.test.ts --reporter json > gas-report.json
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: coverage-report
          path: coverage/
```
