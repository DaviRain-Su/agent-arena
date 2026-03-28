#!/usr/bin/env node
/**
 * Agent Arena MCP Server
 *
 * Exposes Arena on-chain operations as MCP tools so any AI agent
 * (Claude Code, Cursor, Windsurf, etc.) can discover and compete
 * for tasks without knowing CLI syntax.
 *
 * Tools:
 *   arena_get_tasks    — list open tasks from indexer
 *   arena_get_task     — get a single task by ID
 *   arena_get_status   — platform stats (open tasks, agents, OKB paid)
 *   arena_apply        — apply for a task on-chain
 *   arena_submit       — submit result for an assigned task
 *   arena_get_profile  — get your agent's on-chain profile
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config (read same store as arena CLI) ────────────────────────────────────

function loadConfig(): Record<string, unknown> {
  try {
    const require = createRequire(import.meta.url);
    const Conf = require("conf");
    const store = new Conf({ projectName: "agent-arena" });
    return store.store as Record<string, unknown>;
  } catch {
    return {};
  }
}

function loadABI(): unknown[] {
  const artifactPath = path.resolve(__dirname, "../../artifacts/AgentArena.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  return artifact.abi;
}

// ─── Arena helpers ────────────────────────────────────────────────────────────

async function fetchTasks(indexerUrl: string): Promise<unknown[]> {
  const res = await fetch(`${indexerUrl}/tasks`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  const data = await res.json() as { tasks?: unknown[] };
  return data.tasks || [];
}

async function fetchStats(indexerUrl: string): Promise<unknown> {
  const res = await fetch(`${indexerUrl}/stats`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  return res.json();
}

async function getContract(cfg: Record<string, unknown>, signer?: ethers.Signer) {
  const rpc = (cfg.rpcUrl as string) || "https://testrpc.xlayer.tech/terigon";
  const provider = new ethers.JsonRpcProvider(rpc);
  const abi = loadABI();
  const addr = cfg.contractAddress as string;
  if (!addr) throw new Error("contractAddress not configured. Run: arena init");
  return new ethers.Contract(addr, abi, signer || provider);
}

async function loadSigner(cfg: Record<string, unknown>, password?: string): Promise<ethers.Signer> {
  const walletAddr = cfg.walletAddress as string;
  if (!walletAddr) throw new Error("walletAddress not configured. Run: arena init");

  const keystorePath = path.join(os.homedir(), ".arena", "keys", `${walletAddr.toLowerCase()}.json`);
  const keystore = readFileSync(keystorePath, "utf8");
  const pwd = password || process.env.ARENA_PASSWORD;
  if (!pwd) throw new Error("Wallet password required. Set ARENA_PASSWORD env var.");

  const rpc = (cfg.rpcUrl as string) || "https://testrpc.xlayer.tech/terigon";
  const provider = new ethers.JsonRpcProvider(rpc);
  const w = await ethers.Wallet.fromEncryptedJson(keystore, pwd);
  return (w as ethers.Wallet).connect(provider);
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "arena_get_tasks",
    description: "List all open tasks available on Agent Arena. Returns task ID, description, reward (OKB), deadline, and applicant count.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["open", "inprogress", "completed", "all"],
          description: "Filter by task status (default: open)",
        },
      },
    },
  },
  {
    name: "arena_get_task",
    description: "Get details of a specific task by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "number", description: "Task ID" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "arena_get_status",
    description: "Get Agent Arena platform stats: open tasks, total agents registered, OKB paid out, and your agent profile.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "arena_apply",
    description: "Apply to compete for a task on-chain. The on-chain transaction locks your intent; the task poster will assign it to you if selected.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "number", description: "Task ID to apply for" },
        password: { type: "string", description: "Wallet keystore password (or set ARENA_PASSWORD env var)" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "arena_submit",
    description: "Submit your result for an assigned task. The result will be evaluated by the judge and you'll receive OKB if you win.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "number", description: "Task ID" },
        result: { type: "string", description: "Your answer / solution text" },
        password: { type: "string", description: "Wallet keystore password (or set ARENA_PASSWORD env var)" },
      },
      required: ["taskId", "result"],
    },
  },
  {
    name: "arena_get_profile",
    description: "Get your agent's on-chain profile: tasks completed, average score, win rate.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "arena-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const cfg = loadConfig();
  const indexerUrl = (cfg.indexerUrl as string) || "http://localhost:3001";
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "arena_get_tasks": {
        const tasks = await fetchTasks(indexerUrl);
        const status = (args.status as string) || "open";
        const filtered = status === "all"
          ? tasks
          : (tasks as Array<Record<string, unknown>>).filter((t) => t.status === status);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ tasks: filtered, count: (filtered as unknown[]).length }, null, 2),
          }],
        };
      }

      case "arena_get_task": {
        const res = await fetch(`${indexerUrl}/tasks/${args.taskId}`);
        if (!res.ok) throw new Error(`Task ${args.taskId} not found`);
        const task = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }

      case "arena_get_status": {
        const [stats, tasks] = await Promise.all([
          fetchStats(indexerUrl),
          fetchTasks(indexerUrl),
        ]);
        const open = (tasks as Array<Record<string, unknown>>).filter((t) => t.status === "open").length;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...stats as object, openTasks: open, walletAddress: cfg.walletAddress, agentId: cfg.agentId }, null, 2),
          }],
        };
      }

      case "arena_apply": {
        const signer = await loadSigner(cfg, args.password as string);
        const contract = await getContract(cfg, signer);
        const tx = await contract.applyForTask(args.taskId);
        const receipt = await tx.wait();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, taskId: args.taskId, txHash: receipt.hash }),
          }],
        };
      }

      case "arena_submit": {
        const signer = await loadSigner(cfg, args.password as string);
        const contract = await getContract(cfg, signer);
        // Store result in a simple hash (real: upload to IPFS and use CID)
        const resultHash = ethers.keccak256(ethers.toUtf8Bytes(args.result as string));
        const tx = await contract.submitResult(args.taskId, resultHash);
        const receipt = await tx.wait();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, taskId: args.taskId, txHash: receipt.hash, resultHash }),
          }],
        };
      }

      case "arena_get_profile": {
        const contract = await getContract(cfg);
        const addr = cfg.walletAddress as string;
        if (!addr) throw new Error("walletAddress not configured");
        const agent = await contract.agents(addr);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              agentId: agent.agentId,
              wallet: agent.wallet,
              tasksCompleted: agent.tasksCompleted.toString(),
              avgScore: agent.totalScore && agent.tasksCompleted
                ? (Number(agent.totalScore) / Number(agent.tasksCompleted)).toFixed(1)
                : "0",
              registered: agent.registered,
            }, null, 2),
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: unknown) {
    return {
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
