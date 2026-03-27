// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentArena
 * @notice Decentralized Agent task marketplace on X-Layer
 * @dev Agents register, compete for tasks, get paid in native OKB
 */
contract AgentArena {

    // ─── Enums ───────────────────────────────────────────────────────────────

    enum TaskStatus { Open, InProgress, Completed, Refunded, Disputed }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Agent {
        address wallet;
        string  agentId;       // human-readable ID e.g. "openclaw-001"
        string  metadata;      // IPFS CID: capabilities description
        uint256 tasksCompleted;
        uint256 totalScore;    // cumulative judge scores (for future reputation)
        bool    registered;
    }

    struct Task {
        uint256    id;
        address    poster;
        string     description;    // IPFS CID or short text
        uint256    reward;         // in wei (OKB)
        uint256    deadline;       // unix timestamp
        TaskStatus status;
        address[]  applicants;     // agents that applied
        address    assignedAgent;  // agent currently working on it
        string     resultHash;     // IPFS CID of submitted result
        uint8      score;          // 0-100, set by Judge
        address    winner;         // final winner address
    }

    // ─── State ───────────────────────────────────────────────────────────────

    address public owner;
    address public judgeAddress;   // centralized for MVP; will be DAO later

    mapping(address => Agent)  public agents;
    mapping(uint256 => Task)   public tasks;
    uint256 public taskCount;

    address[] public agentList;    // for enumeration

    // ─── Events ──────────────────────────────────────────────────────────────

    event AgentRegistered(address indexed wallet, string agentId);
    event TaskPosted(uint256 indexed taskId, address indexed poster, uint256 reward, uint256 deadline);
    event TaskApplied(uint256 indexed taskId, address indexed agent);
    event TaskAssigned(uint256 indexed taskId, address indexed agent);
    event ResultSubmitted(uint256 indexed taskId, address indexed agent, string resultHash);
    event TaskCompleted(uint256 indexed taskId, address indexed winner, uint256 reward, uint8 score);
    event TaskRefunded(uint256 indexed taskId, address indexed poster, uint256 amount);
    event JudgeUpdated(address indexed newJudge);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyJudge() {
        require(msg.sender == judgeAddress, "Not judge");
        _;
    }

    modifier onlyRegistered() {
        require(agents[msg.sender].registered, "Agent not registered");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _judgeAddress) {
        owner        = msg.sender;
        judgeAddress = _judgeAddress;
    }

    // ─── Agent Registration ───────────────────────────────────────────────────

    /**
     * @notice Register as an Agent node in the network
     * @param agentId  Human-readable identifier (e.g. "openclaw-001")
     * @param metadata IPFS CID pointing to agent capability description
     */
    function registerAgent(string calldata agentId, string calldata metadata) external {
        require(!agents[msg.sender].registered, "Already registered");
        require(bytes(agentId).length > 0, "AgentId required");

        agents[msg.sender] = Agent({
            wallet:         msg.sender,
            agentId:        agentId,
            metadata:       metadata,
            tasksCompleted: 0,
            totalScore:     0,
            registered:     true
        });

        agentList.push(msg.sender);
        emit AgentRegistered(msg.sender, agentId);
    }

    // ─── Task Lifecycle ───────────────────────────────────────────────────────

    /**
     * @notice Post a task with OKB reward locked in escrow
     * @param description IPFS CID or short task description
     * @param deadline    Unix timestamp after which task can be refunded
     */
    function postTask(string calldata description, uint256 deadline) external payable {
        require(msg.value > 0, "Reward required");
        require(deadline > block.timestamp, "Deadline must be in future");
        require(bytes(description).length > 0, "Description required");

        uint256 taskId = taskCount++;
        Task storage t = tasks[taskId];
        t.id          = taskId;
        t.poster      = msg.sender;
        t.description = description;
        t.reward      = msg.value;
        t.deadline    = deadline;
        t.status      = TaskStatus.Open;

        emit TaskPosted(taskId, msg.sender, msg.value, deadline);
    }

    /**
     * @notice Agent applies for an open task
     */
    function applyForTask(uint256 taskId) external onlyRegistered {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Open, "Task not open");
        require(block.timestamp < t.deadline, "Task expired");
        require(t.poster != msg.sender, "Poster cannot apply");

        // check not already applied
        for (uint i = 0; i < t.applicants.length; i++) {
            require(t.applicants[i] != msg.sender, "Already applied");
        }

        t.applicants.push(msg.sender);
        emit TaskApplied(taskId, msg.sender);
    }

    /**
     * @notice Poster assigns task to a specific applicant
     * @dev Can also be called by Judge for automated assignment
     */
    function assignTask(uint256 taskId, address agent) external {
        Task storage t = tasks[taskId];
        require(msg.sender == t.poster || msg.sender == judgeAddress, "Not authorized");
        require(t.status == TaskStatus.Open, "Task not open");
        require(agents[agent].registered, "Agent not registered");

        // verify agent applied (unless judge is force-assigning)
        if (msg.sender == t.poster) {
            bool found = false;
            for (uint i = 0; i < t.applicants.length; i++) {
                if (t.applicants[i] == agent) { found = true; break; }
            }
            require(found, "Agent did not apply");
        }

        t.assignedAgent = agent;
        t.status        = TaskStatus.InProgress;
        emit TaskAssigned(taskId, agent);
    }

    /**
     * @notice Assigned agent submits their result
     * @param resultHash IPFS CID of the completed work
     */
    function submitResult(uint256 taskId, string calldata resultHash) external onlyRegistered {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.InProgress, "Task not in progress");
        require(t.assignedAgent == msg.sender, "Not assigned agent");
        require(bytes(resultHash).length > 0, "Result hash required");

        t.resultHash = resultHash;
        emit ResultSubmitted(taskId, msg.sender, resultHash);
    }

    /**
     * @notice Judge evaluates result and releases payment
     * @param taskId  The task to finalize
     * @param score   Quality score 0-100
     * @param winner  Address to receive reward (normally assignedAgent)
     *                Pass poster address to refund (score too low)
     */
    function judgeAndPay(
        uint256 taskId,
        uint8   score,
        address winner
    ) external onlyJudge {
        Task storage t = tasks[taskId];
        require(
            t.status == TaskStatus.InProgress,
            "Task not in progress"
        );
        require(bytes(t.resultHash).length > 0, "No result submitted yet");
        require(winner != address(0), "Invalid winner");

        t.score  = score;
        t.winner = winner;

        if (winner == t.assignedAgent) {
            // Agent wins: pay them, update stats
            t.status = TaskStatus.Completed;
            agents[winner].tasksCompleted++;
            agents[winner].totalScore += score;

            (bool ok,) = payable(winner).call{value: t.reward}("");
            require(ok, "Payment failed");

            emit TaskCompleted(taskId, winner, t.reward, score);
        } else {
            // Score too low: refund poster
            t.status = TaskStatus.Refunded;
            (bool ok,) = payable(t.poster).call{value: t.reward}("");
            require(ok, "Refund failed");

            emit TaskRefunded(taskId, t.poster, t.reward);
        }
    }

    /**
     * @notice Anyone can trigger refund after deadline if task is still open
     */
    function refundExpired(uint256 taskId) external {
        Task storage t = tasks[taskId];
        require(
            t.status == TaskStatus.Open || t.status == TaskStatus.InProgress,
            "Cannot refund"
        );
        require(block.timestamp > t.deadline, "Not expired yet");

        t.status = TaskStatus.Refunded;
        (bool ok,) = payable(t.poster).call{value: t.reward}("");
        require(ok, "Refund failed");

        emit TaskRefunded(taskId, t.poster, t.reward);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setJudge(address newJudge) external onlyOwner {
        require(newJudge != address(0), "Invalid address");
        judgeAddress = newJudge;
        emit JudgeUpdated(newJudge);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function getApplicants(uint256 taskId) external view returns (address[] memory) {
        return tasks[taskId].applicants;
    }

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getAgentReputation(address wallet) external view returns (uint256 avgScore, uint256 completed) {
        Agent storage a = agents[wallet];
        completed = a.tasksCompleted;
        avgScore  = completed > 0 ? a.totalScore / completed : 0;
    }
}
