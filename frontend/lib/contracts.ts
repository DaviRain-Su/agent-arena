// lib/contracts.ts - Agent Arena contract integration
import { ethers } from "ethers";

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

export const ABI = [
  // Agent Registration
  "function registerAgent(string calldata agentId, string calldata metadata, address ownerAddr) external",
  "function agents(address) external view returns (address wallet, address owner, string agentId, string metadata, uint256 tasksCompleted, uint256 totalScore, uint256 tasksAttempted, bool registered)",
  "function agentList(uint256) external view returns (address)",
  "function getAgentCount() external view returns (uint256)",
  "function getAgentReputation(address wallet) external view returns (uint256 avgScore, uint256 completed, uint256 attempted, uint256 winRate)",
  "function getMyAgents(address ownerAddr) external view returns (address[])",
  "function getAgentInfo(address wallet) external view returns (address agentWallet, address agentOwner, string agentId, string metadata, bool registered)",
  "function hasApplied(uint256 taskId, address agent) external view returns (bool)",

  // Task Lifecycle
  "function postTask(string calldata description, string calldata evaluationCID, uint256 deadline) external payable",
  "function applyForTask(uint256 taskId) external",
  "function assignTask(uint256 taskId, address agent) external",
  "function submitResult(uint256 taskId, string calldata resultHash) external",
  "function judgeAndPay(uint256 taskId, uint8 score, address winner, string calldata reasonURI) external",
  "function payConsolation(uint256 taskId, address secondPlace) external payable",
  "function refundExpired(uint256 taskId) external",
  "function forceRefund(uint256 taskId) external",

  // Views
  "function tasks(uint256) external view returns (uint256 id, address poster, string description, string evaluationCID, uint256 reward, uint256 deadline, uint256 assignedAt, uint256 judgeDeadline, uint8 status, address assignedAgent, string resultHash, uint8 score, string reasonURI, address winner, address secondPlace)",
  "function taskCount() external view returns (uint256)",
  "function getApplicants(uint256 taskId) external view returns (address[])",
  "function isJudgeTimeoutReached(uint256 taskId) external view returns (bool)",
  "function JUDGE_TIMEOUT() external view returns (uint256)",
  "function MIN_PASS_SCORE() external view returns (uint8)",

  // Admin
  "function judgeAddress() external view returns (address)",
  "function owner() external view returns (address)",
  "function setJudge(address newJudge) external",

  // Events
  "event AgentRegistered(address indexed wallet, string agentId)",
  "event TaskPosted(uint256 indexed taskId, address indexed poster, uint256 reward, uint256 deadline)",
  "event TaskApplied(uint256 indexed taskId, address indexed agent)",
  "event TaskAssigned(uint256 indexed taskId, address indexed agent, uint256 judgeDeadline)",
  "event ResultSubmitted(uint256 indexed taskId, address indexed agent, string resultHash)",
  "event TaskCompleted(uint256 indexed taskId, address indexed winner, uint256 reward, uint8 score)",
  "event ConsolationPaid(uint256 indexed taskId, address indexed agent, uint256 amount)",
  "event TaskRefunded(uint256 indexed taskId, address indexed poster, uint256 amount)",
  "event ForceRefunded(uint256 indexed taskId, address indexed poster, uint256 amount)",
  "event JudgeUpdated(address indexed newJudge)",
];

export enum TaskStatus {
  Open = 0,
  InProgress = 1,
  Completed = 2,
  Refunded = 3,
  Disputed = 4,
}

export const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "In Progress",
  2: "Completed",
  3: "Refunded",
  4: "Disputed",
};

export const STATUS_LABELS_ZH: Record<number, string> = {
  0: "待认领",
  1: "进行中",
  2: "已完成",
  3: "已退款",
  4: "争议中",
};

export function getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
}

export function formatOKB(wei: bigint): string {
  return parseFloat(ethers.formatEther(wei)).toFixed(4) + " OKB";
}

export function shortenAddress(addr: string): string {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export const XLAYER_CHAIN = {
  chainId: "0xc4", // 196 mainnet
  chainName: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"],
  blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"],
};
