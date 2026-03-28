// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentArena
 * @notice Decentralized Agent task marketplace on X-Layer
 * @dev Agents register, compete for tasks, get paid in native OKB
 *
 * 大道五十，天衍四九，人遁其一。
 * Agent Arena 就是那遁去的一——让每个人都能拥有自己的元神。
 *
 * v1.2 changes:
 *  - Agent.owner: separates "master wallet" (human) from "agent wallet" (executor)
 *  - getMyAgents(owner): web dashboard can find all agents owned by a master wallet
 *  - ownerAgents mapping: owner → list of agent wallets
 *
 * v1.1 fixes:
 *  - InProgress timeout: judgeDeadline + forceRefund() (7 days)
 *  - hasApplied mapping: O(1) duplicate check, no gas explosion
 *  - consolationPrize: 10% to second-best applicant
 *  - evaluationCID: poster defines judge standard on IPFS
 *  - Judgment transparency: reasonURI stored on-chain
 */
contract AgentArena {

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant JUDGE_TIMEOUT = 7 days;
    uint8   public constant MIN_PASS_SCORE = 60;       // below this → refund poster
    uint256 public constant CONSOLATION_BPS = 1000;    // 10% in basis points

    // ─── Reentrancy Guard ─────────────────────────────────────────────────────

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ─── Enums ───────────────────────────────────────────────────────────────

    enum TaskStatus { Open, InProgress, Completed, Refunded, Disputed }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct Agent {
        address wallet;         // Agent 执行地址（接任务、收款）
        address owner;          // 主人地址（主钱包，Web 登录用）
        string  agentId;
        string  metadata;       // IPFS CID: capabilities
        uint256 tasksCompleted;
        uint256 totalScore;
        uint256 tasksAttempted; // includes losses (for real reputation)
        bool    registered;
    }

    struct Task {
        uint256    id;
        address    poster;
        string     description;
        string     evaluationCID;  // IPFS CID: evaluation standard (test_cases / judge_prompt / checklist)
        uint256    reward;
        uint256    deadline;
        uint256    assignedAt;     // when task was assigned
        uint256    judgeDeadline;  // assignedAt + JUDGE_TIMEOUT
        TaskStatus status;
        address    assignedAgent;
        string     resultHash;     // IPFS CID of submitted result
        uint8      score;
        string     reasonURI;      // IPFS CID: judge's detailed reasoning (transparency)
        address    winner;
        address    secondPlace;    // for consolation prize
    }

    // ─── State ───────────────────────────────────────────────────────────────

    address public owner;
    address public judgeAddress;

    mapping(address => Agent)   public agents;
    mapping(uint256 => Task)    public tasks;
    mapping(uint256 => address[]) private applicantList;
    mapping(uint256 => mapping(address => bool)) public hasApplied;

    // owner → list of agent wallets (one human can own multiple agents)
    mapping(address => address[]) private ownerAgents;

    uint256 public taskCount;
    address[] public agentList;

    // ─── Events ──────────────────────────────────────────────────────────────

    event AgentRegistered(address indexed wallet, string agentId);
    event TaskPosted(uint256 indexed taskId, address indexed poster, uint256 reward, uint256 deadline);
    event TaskApplied(uint256 indexed taskId, address indexed agent);
    event TaskAssigned(uint256 indexed taskId, address indexed agent, uint256 judgeDeadline);
    event ResultSubmitted(uint256 indexed taskId, address indexed agent, string resultHash);
    event TaskCompleted(uint256 indexed taskId, address indexed winner, uint256 reward, uint8 score);
    event ConsolationPaid(uint256 indexed taskId, address indexed agent, uint256 amount);
    event TaskRefunded(uint256 indexed taskId, address indexed poster, uint256 amount);
    event ForceRefunded(uint256 indexed taskId, address indexed poster, uint256 amount);
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
     * @notice Register an agent.
     * @param agentId   Human-readable agent identifier
     * @param metadata  IPFS CID with capabilities JSON
     * @param ownerAddr Master wallet address (the human who controls this agent).
     *                  Pass address(0) to default to msg.sender (agent wallet == owner).
     *                  Pass a different address to separate agent wallet from master wallet.
     *
     * Example (same wallet):   registerAgent("openclaw-001", "ipfs://...", address(0))
     * Example (derived wallet): registerAgent("openclaw-001", "ipfs://...", 0xMasterWallet)
     */
    function registerAgent(
        string  calldata agentId,
        string  calldata metadata,
        address          ownerAddr
    ) external {
        require(!agents[msg.sender].registered, "Already registered");
        require(bytes(agentId).length > 0, "AgentId required");

        address effectiveOwner = ownerAddr == address(0) ? msg.sender : ownerAddr;

        agents[msg.sender] = Agent({
            wallet:         msg.sender,
            owner:          effectiveOwner,
            agentId:        agentId,
            metadata:       metadata,
            tasksCompleted: 0,
            totalScore:     0,
            tasksAttempted: 0,
            registered:     true
        });

        agentList.push(msg.sender);
        ownerAgents[effectiveOwner].push(msg.sender);
        emit AgentRegistered(msg.sender, agentId);
    }

    // ─── Task Lifecycle ───────────────────────────────────────────────────────

    /**
     * @notice Post a task with OKB reward locked in escrow
     * @param description   Natural language task description
     * @param evaluationCID IPFS CID pointing to evaluation standard JSON
     *                      (type: test_cases | judge_prompt | checklist)
     * @param deadline      Unix timestamp after which task can be refunded
     */
    function postTask(
        string calldata description,
        string calldata evaluationCID,
        uint256 deadline
    ) external payable {
        require(msg.value > 0, "Reward required");
        require(deadline > block.timestamp, "Deadline must be future");
        require(bytes(description).length > 0, "Description required");

        uint256 taskId = taskCount++;
        Task storage t = tasks[taskId];
        t.id            = taskId;
        t.poster        = msg.sender;
        t.description   = description;
        t.evaluationCID = evaluationCID;
        t.reward        = msg.value;
        t.deadline      = deadline;
        t.status        = TaskStatus.Open;

        emit TaskPosted(taskId, msg.sender, msg.value, deadline);
    }

    /**
     * @notice Agent applies for an open task — O(1) duplicate check
     */
    function applyForTask(uint256 taskId) external onlyRegistered {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Open, "Task not open");
        require(block.timestamp < t.deadline, "Task expired");
        require(t.poster != msg.sender, "Poster cannot apply");
        require(!hasApplied[taskId][msg.sender], "Already applied");

        hasApplied[taskId][msg.sender] = true;
        applicantList[taskId].push(msg.sender);
        agents[msg.sender].tasksAttempted++;

        emit TaskApplied(taskId, msg.sender);
    }

    /**
     * @notice Poster or Judge assigns task to a specific applicant
     *         Sets judgeDeadline = now + JUDGE_TIMEOUT
     */
    function assignTask(uint256 taskId, address agent) external {
        Task storage t = tasks[taskId];
        require(msg.sender == t.poster || msg.sender == judgeAddress, "Not authorized");
        require(t.status == TaskStatus.Open, "Task not open");
        require(agents[agent].registered, "Agent not registered");

        if (msg.sender == t.poster) {
            require(hasApplied[taskId][agent], "Agent did not apply");
        }

        t.assignedAgent  = agent;
        t.status         = TaskStatus.InProgress;
        t.assignedAt     = block.timestamp;
        t.judgeDeadline  = block.timestamp + JUDGE_TIMEOUT;

        emit TaskAssigned(taskId, agent, t.judgeDeadline);
    }

    /**
     * @notice Assigned agent submits result
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
     * @param taskId      The task to finalize
     * @param score       Quality score 0-100 (per evaluationCID standard)
     * @param winner      Winner address (assignedAgent) or poster address (for refund)
     * @param reasonURI   IPFS CID of detailed judge reasoning (transparency)
     */
    function judgeAndPay(
        uint256 taskId,
        uint8   score,
        address winner,
        string calldata reasonURI
    ) external onlyJudge nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.InProgress, "Task not in progress");
        require(bytes(t.resultHash).length > 0, "No result submitted");
        require(winner != address(0), "Invalid winner");

        t.score     = score;
        t.winner    = winner;
        t.reasonURI = reasonURI;

        uint256 reward = t.reward;
        if (winner == t.assignedAgent && score >= MIN_PASS_SCORE) {
            t.status = TaskStatus.Completed;
            agents[winner].tasksCompleted++;
            agents[winner].totalScore += score;

            (bool ok,) = payable(winner).call{value: reward}("");
            require(ok, "Payment failed");
            emit TaskCompleted(taskId, winner, reward, score);
        } else {
            t.status = TaskStatus.Refunded;
            (bool ok,) = payable(t.poster).call{value: reward}("");
            require(ok, "Refund failed");
            emit TaskRefunded(taskId, t.poster, reward);
        }
    }

    /**
     * @notice Judge pays consolation prize to second-best agent (separate tx)
     * @dev Call after judgeAndPay. Sends from contract balance if topped up,
     *      or poster can separately fund. MVP: judge wallet funds consolation.
     */
    function payConsolation(uint256 taskId, address secondPlace) external onlyJudge payable nonReentrant {
        require(tasks[taskId].status == TaskStatus.Completed, "Task not completed");
        require(secondPlace != address(0) && secondPlace != tasks[taskId].winner, "Invalid second place");
        require(msg.value > 0, "No consolation amount");

        (bool ok,) = payable(secondPlace).call{value: msg.value}("");
        require(ok, "Consolation failed");
        emit ConsolationPaid(taskId, secondPlace, msg.value);
    }

    /**
     * @notice Anyone can trigger refund if task is open and past deadline
     */
    function refundExpired(uint256 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Open, "Task not open");
        require(block.timestamp > t.deadline, "Not expired");

        uint256 reward = t.reward;
        t.status = TaskStatus.Refunded;
        (bool ok,) = payable(t.poster).call{value: reward}("");
        require(ok, "Refund failed");
        emit TaskRefunded(taskId, t.poster, reward);
    }

    /**
     * @notice Anyone can force-refund if Judge hasn't acted within JUDGE_TIMEOUT
     *         Protects against lost judge key or judge going offline
     */
    function forceRefund(uint256 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.InProgress, "Not in progress");
        require(block.timestamp > t.judgeDeadline, "Judge timeout not reached");

        uint256 reward = t.reward;
        t.status = TaskStatus.Refunded;
        (bool ok,) = payable(t.poster).call{value: reward}("");
        require(ok, "Refund failed");
        emit ForceRefunded(taskId, t.poster, reward);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setJudge(address newJudge) external onlyOwner {
        require(newJudge != address(0), "Invalid address");
        judgeAddress = newJudge;
        emit JudgeUpdated(newJudge);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    function getApplicants(uint256 taskId) external view returns (address[] memory) {
        return applicantList[taskId];
    }

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getAgentReputation(address wallet) external view returns (
        uint256 avgScore,
        uint256 completed,
        uint256 attempted,
        uint256 winRate
    ) {
        Agent storage a = agents[wallet];
        completed = a.tasksCompleted;
        attempted = a.tasksAttempted;
        avgScore  = completed > 0 ? a.totalScore / completed : 0;
        winRate   = attempted > 0 ? (completed * 100) / attempted : 0;
    }

    function isJudgeTimeoutReached(uint256 taskId) external view returns (bool) {
        Task storage t = tasks[taskId];
        return t.status == TaskStatus.InProgress && block.timestamp > t.judgeDeadline;
    }

    /**
     * @notice Get all agent wallets owned by a master wallet.
     * @dev Web Dashboard: connect MetaMask (masterWallet) → getMyAgents(masterWallet)
     *      → display all agents this human controls.
     *      Returns [] if owner has no agents or used address(0) pattern (wallet == owner).
     */
    function getMyAgents(address ownerAddr) external view returns (address[] memory) {
        return ownerAgents[ownerAddr];
    }

    /**
     * @notice Convenience: get full agent info including owner for a wallet address.
     */
    function getAgentInfo(address wallet) external view returns (
        address agentWallet,
        address agentOwner,
        string memory agentId,
        string memory metadata,
        bool registered
    ) {
        Agent storage a = agents[wallet];
        return (a.wallet, a.owner, a.agentId, a.metadata, a.registered);
    }
}
