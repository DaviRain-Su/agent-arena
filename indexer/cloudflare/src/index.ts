// src/index.ts — Cloudflare Worker entrypoint
// Handles both HTTP (Hono API) and Cron (chain sync)

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types.js";
import { syncEvents } from "./sync.js";
import {
  getTasks, getTaskById, getApplicants, setResultPreview,
  getAgent, getAgentTasks, getLeaderboard, getStats,
  storeResult, getResult,
} from "./db.js";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", async (c) => {
  let blockHeight: number | null = null;
  try {
    const res = await fetch(c.env.XLAYER_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    const data = await res.json() as { result: string };
    blockHeight = parseInt(data.result, 16);
  } catch {}
  return c.json({ status: "ok", blockHeight, contractAddress: c.env.CONTRACT_ADDRESS });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

app.get("/stats", async (c) => {
  return c.json(await getStats(c.env.DB));
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

app.get("/tasks", async (c) => {
  const status   = c.req.query("status") || "open";
  const poster   = c.req.query("poster");
  const limit    = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const offset   = parseInt(c.req.query("offset") || "0");
  const sort     = c.req.query("sort") || "newest";
  const minReward = c.req.query("min_reward");

  const result = await getTasks(c.env.DB, { status, poster, limit, offset, sort, minReward });
  return c.json(result);
});

app.get("/tasks/:taskId", async (c) => {
  const taskId = parseInt(c.req.param("taskId"));
  const task = await getTaskById(c.env.DB, taskId);
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json(task);
});

app.get("/tasks/:taskId/applicants", async (c) => {
  const taskId = parseInt(c.req.param("taskId"));
  const applicants = await getApplicants(c.env.DB, taskId);
  return c.json({ applicants });
});

// Forward apply tx to chain (broadcasts signed tx)
app.post("/tasks/:taskId/apply", async (c) => {
  const { signedTx } = await c.req.json<{ signedTx: string }>();
  if (!signedTx) return c.json({ error: "signedTx required" }, 400);

  try {
    const res = await fetch(c.env.XLAYER_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] }),
    });
    const data = await res.json() as { result?: string; error?: { message: string } };
    if (data.error) return c.json({ error: data.error.message }, 400);
    return c.json({ txHash: data.result });
  } catch (e: unknown) {
    return c.json({ error: e instanceof Error ? e.message : "broadcast failed" }, 400);
  }
});

// Forward submit tx + store result preview
app.post("/tasks/:taskId/submit", async (c) => {
  const taskId = parseInt(c.req.param("taskId"));
  const { signedTx, resultPreview } = await c.req.json<{ signedTx: string; resultPreview?: string }>();

  if (!signedTx) return c.json({ error: "signedTx required" }, 400);

  try {
    const res = await fetch(c.env.XLAYER_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] }),
    });
    const data = await res.json() as { result?: string; error?: { message: string } };
    if (data.error) return c.json({ error: data.error.message }, 400);

    if (resultPreview) {
      await setResultPreview(c.env.DB, taskId, resultPreview);
    }

    return c.json({ txHash: data.result });
  } catch (e: unknown) {
    return c.json({ error: e instanceof Error ? e.message : "broadcast failed" }, 400);
  }
});

// ─── Agents ───────────────────────────────────────────────────────────────────

app.get("/agents/:address", async (c) => {
  const agent = await getAgent(c.env.DB, c.req.param("address"));
  if (!agent) return c.json({ error: "Agent not registered" }, 404);
  const recentTasks = await getAgentTasks(c.env.DB, c.req.param("address"), "all");
  return c.json({ ...agent, recentTasks: recentTasks.slice(0, 5) });
});

app.get("/agents/:address/tasks", async (c) => {
  const status = c.req.query("status") || "assigned";
  const tasks = await getAgentTasks(c.env.DB, c.req.param("address"), status);
  return c.json({ tasks });
});

app.get("/leaderboard", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "10"), 50);
  const sort  = c.req.query("sort") || "avg_score";
  return c.json({ agents: await getLeaderboard(c.env.DB, limit, sort) });
});

// ─── Results (content storage for judge service) ──────────────────────────────

app.post("/results/:taskId", async (c) => {
  const taskId = parseInt(c.req.param("taskId"));
  const { content, agentAddress } = await c.req.json<{ content: string; agentAddress?: string }>();
  if (!content || typeof content !== "string") {
    return c.json({ error: "content (string) required" }, 400);
  }
  if (!agentAddress || typeof agentAddress !== "string") {
    return c.json({ error: "agentAddress (string) required" }, 400);
  }
  // Verify caller is assigned agent (fetch task from chain)
  try {
    const task = await getTaskById(c.env.DB, taskId);
    if (task && task.assignedAgent && task.assignedAgent.toLowerCase() !== agentAddress.toLowerCase()) {
      return c.json({ error: "Not the assigned agent for this task" }, 403);
    }
  } catch { /* allow on verify failure for MVP */ }
  await storeResult(c.env.DB, taskId, content, agentAddress || null);
  return c.json({ ok: true, taskId });
});

app.get("/results/:taskId", async (c) => {
  const taskId = parseInt(c.req.param("taskId"));
  const result = await getResult(c.env.DB, taskId);
  if (!result) return c.json({ error: "No result stored for this task" }, 404);
  return c.json(result);
});

// ─── Admin: manual sync trigger ───────────────────────────────────────────────
// Protected by a simple secret header for emergency use

app.post("/admin/sync", async (c) => {
  const secret = c.req.header("x-admin-secret");
  if (secret !== c.env.CONTRACT_ADDRESS) { // reuse contract addr as secret for MVP
    return c.json({ error: "Unauthorized" }, 401);
  }
  const result = await syncEvents(c.env);
  return c.json({ ok: true, ...result });
});

// ─── Worker Export ────────────────────────────────────────────────────────────

export default {
  // HTTP handler — delegates to Hono
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  // Cron handler — runs every minute to sync chain events
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[cron] Triggered at ${new Date().toISOString()}`);
    ctx.waitUntil(
      syncEvents(env).then(result => {
        console.log(`[cron] Sync complete: ${result.synced} events, block ${result.newBlock}`);
      }).catch(e => {
        console.error("[cron] Sync failed:", e);
      })
    );
  },
};
