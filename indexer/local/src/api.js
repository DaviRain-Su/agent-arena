// local-indexer/src/api.js — Express REST API

import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import {
  getTasks, getTaskById, getApplicants, setResultPreview,
  getAgent, getAgentTasks, getLeaderboard, getStats,
} from "./db.js";

export function createApp(provider, contract) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ─── Health ──────────────────────────────────────────────────────────────────
  app.get("/health", async (req, res) => {
    const blockHeight = await provider.getBlockNumber().catch(() => null);
    res.json({ status: "ok", blockHeight, contractAddress: contract.target });
  });

  // ─── Stats ───────────────────────────────────────────────────────────────────
  app.get("/stats", (req, res) => {
    res.json(getStats());
  });

  // ─── Tasks ───────────────────────────────────────────────────────────────────
  app.get("/tasks", (req, res) => {
    const { status = "open", poster, limit = "20", offset = "0", sort = "newest", min_reward } = req.query;
    const result = getTasks({
      status,
      poster,
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset),
      sort,
      minReward: min_reward,
    });
    res.json(result);
  });

  app.get("/tasks/:taskId", (req, res) => {
    const taskId = parseInt(req.params.taskId);
    const task = getTaskById(taskId);
    if (!task) return res.status(404).json({ error: "Task not found" });

    const applicants = getApplicants(taskId);
    task.applicantCount = applicants.length;
    res.json(task);
  });

  app.get("/tasks/:taskId/applicants", (req, res) => {
    const taskId = parseInt(req.params.taskId);
    const rows = getApplicants(taskId);
    res.json({
      applicants: rows.map(r => ({
        wallet: r.agent,
        agentId: r.agent_id || null,
        avgScore: r.tasks_completed > 0 ? Math.round(r.total_score / r.tasks_completed) : 0,
        tasksCompleted: r.tasks_completed || 0,
        winRate: r.tasks_attempted > 0 ? Math.round((r.tasks_completed / r.tasks_attempted) * 100) : 0,
        appliedAt: r.applied_at,
      })),
    });
  });

  // Forward apply tx to chain
  app.post("/tasks/:taskId/apply", async (req, res) => {
    const { signedTx } = req.body;
    if (!signedTx) return res.status(400).json({ error: "signedTx required" });
    try {
      const tx = await provider.broadcastTransaction(signedTx);
      res.json({ txHash: tx.hash });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Forward submit tx to chain
  app.post("/tasks/:taskId/submit", async (req, res) => {
    const taskId = parseInt(req.params.taskId);
    const { signedTx, resultPreview } = req.body;
    if (!signedTx) return res.status(400).json({ error: "signedTx required" });
    try {
      const tx = await provider.broadcastTransaction(signedTx);
      await tx.wait();
      if (resultPreview) setResultPreview(taskId, resultPreview);
      res.json({ txHash: tx.hash });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // ─── Agents ──────────────────────────────────────────────────────────────────
  app.get("/agents/:address", (req, res) => {
    const agent = getAgent(req.params.address);
    if (!agent) return res.status(404).json({ error: "Agent not registered" });
    const recentTasks = getAgentTasks(req.params.address, "all").slice(0, 5);
    res.json({ ...agent, recentTasks });
  });

  app.get("/agents/:address/tasks", (req, res) => {
    const { status = "assigned" } = req.query;
    const tasks = getAgentTasks(req.params.address, status);
    res.json({ tasks });
  });

  app.get("/leaderboard", (req, res) => {
    const { limit = "10", sort = "avg_score" } = req.query;
    res.json({ agents: getLeaderboard({ limit: Math.min(parseInt(limit), 50), sort }) });
  });

  return app;
}
