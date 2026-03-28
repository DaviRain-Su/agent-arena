// AgentArena Contract ABI (minimal for Judge Service)
// Auto-generated - do not edit manually

export const AGENT_ARENA_ABI = [
  // Events
  "event ResultSubmitted(uint256 indexed taskId, address indexed agent, string resultHash)",
  "event TaskPosted(uint256 indexed taskId, address indexed poster, uint256 reward, uint256 deadline)",
  "event TaskAssigned(uint256 indexed taskId, address indexed agent, uint256 judgeDeadline)",
  "event TaskCompleted(uint256 indexed taskId, address indexed winner, uint256 reward, uint8 score)",

  // View functions
  "function tasks(uint256) view returns (uint256 id, address poster, string description, string evaluationCID, uint256 reward, uint256 deadline, uint256 assignedAt, uint256 judgeDeadline, uint8 status, address assignedAgent, string resultHash, uint8 score, string reasonURI, address winner, address secondPlace)",
  "function judgeAddress() view returns (address)",
  "function agents(address) view returns (address wallet, address owner, string agentId, string metadata, uint256 tasksCompleted, uint256 totalScore, uint256 registeredAt, bool registered)",

  // Write functions
  "function judgeAndPay(uint256 taskId, uint8 score, address winner, string calldata reasonURI) external",
  "function forceRefund(uint256 taskId) external",
];
