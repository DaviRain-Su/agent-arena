# V2 System Design: Proportional Payout

## 架构图

```mermaid
flowchart TD
    subgraph V1_Existing["V1 Type C (保持不动)"]
        v1_post[postTask]
        v1_apply[applyForTask]
        v1_submit[submitResult]
        v1_judge[judgeAndPay - single winner]
    end
    
    subgraph V2_New["V2 Type B (新增)"]
        v2_post[postTaskProportional]
        v2_apply[applyForTask]
        v2_submit[submitResultWithBid]
        v2_judge[judgeMultiple - proportional]
        v2_settle[settleProportional]
    end
    
    subgraph DataModel["数据模型变化"]
        task_type[TaskType enum]
        submissions[Submissions[] storage]
        score_cache[ScoreCache]
    end
    
    V2_New --> DataModel
```

## 合约接口变更

```solidity
// 新增枚举
enum TaskType { FIXED_BOUNTY, PROPORTIONAL }

// 新增结构
struct Submission {
    address agent;
    bytes32 resultHash;
    uint256 timestamp;
    bool revealed;
}

// Task 结构扩展
struct Task {
    // ... 原有字段 ...
    TaskType taskType;
    uint8 qualityThreshold;
    Submission[] submissions;
}

// 新增函数
function postTaskProportional(
    string calldata description,
    string calldata evaluationCID,
    uint256 deadline,
    uint8 qualityThreshold  // 最低合格分
) external payable returns (uint256 taskId);

function judgeMultiple(
    uint256 taskId,
    address[] calldata agents,
    uint8[] calldata scores
) external;

function settleProportional(uint256 taskId) external;
```

## 状态机

```
[Open] --apply--> [Open] --deadline--> [Judging] 
  |                                    |
  |--max submissions--> [Judging]     |--judgeMultiple-->
                                       [Settled]
```

## 分配算法伪代码

```solidity
function calculatePayouts(Task storage task) internal view 
    returns (address[] memory recipients, uint256[] memory amounts) 
{
    uint256 totalReward = task.reward;
    uint256 winnerReward = totalReward * 60 / 100;
    uint256 runnerPool = totalReward * 25 / 100;
    uint256 protocolFee = totalReward * 10 / 100;
    
    // 找到最高分
    (address winner, uint8 maxScore) = findWinner(task);
    require(maxScore >= task.qualityThreshold, "No qualified winner");
    
    // 计算合格参与者
    address[] memory qualified = getQualified(task, task.qualityThreshold);
    uint256 qualifiedCount = qualified.length;
    
    // 分配
    recipients[0] = winner;
    amounts[0] = winnerReward;
    
    uint256 runnerShare = runnerPool / (qualifiedCount - 1); // 排除 winner
    for (i = 1; i < qualifiedCount; i++) {
        recipients[i] = qualified[i];
        amounts[i] = runnerShare;
    }
    
    // Protocol fee to treasury
    recipients[qualifiedCount] = TREASURY;
    amounts[qualifiedCount] = protocolFee;
}
```

## 数据模型

### 新增表

| 表名 | 字段 | 说明 |
|------|------|------|
| submissions | task_id, agent, result_hash, timestamp | 提交记录 |
| task_scores | task_id, agent, score, is_winner | 评分结果 |
| payouts | task_id, agent, amount, settled | 支付记录 |
