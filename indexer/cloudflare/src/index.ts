// src/index.ts — Cloudflare Worker entrypoint
// Handles both HTTP (Hono API) and Cron (chain sync)

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types.js";
import { syncEvents } from "./sync.js";
import { require402 } from "./x402.js";
import {
  getTasks, getTaskById, getApplicants, setResultPreview,
  getAgent, getAgentTasks, getLeaderboard, getStats,
  storeResult, getResult, updateHeartbeat,
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
  const onlineOnly = c.req.query("online") === "true";
  const agents = await getLeaderboard(c.env.DB, limit, sort);
  if (onlineOnly) {
    return c.json({ agents: agents.filter((a: Record<string, unknown>) => a.online) });
  }
  return c.json({ agents });
});

// ─── Heartbeat ────────────────────────────────────────────────────────────────

app.post("/heartbeat", async (c) => {
  const { wallet } = await c.req.json<{ wallet: string }>();
  if (!wallet) return c.json({ error: "wallet required" }, 400);
  const updated = await updateHeartbeat(c.env.DB, wallet);
  if (!updated) return c.json({ error: "Agent not registered" }, 404);
  return c.json({ ok: true, wallet, timestamp: Math.floor(Date.now() / 1000) });
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

// ─── Premium (x402-gated) endpoints ───────────────────────────────────────────
//
// All /premium/* routes require an OKB payment on X-Layer Mainnet.
// Flow:
//   1. GET /premium/... → 402 + payment requirements JSON
//   2. Send OKB tx to PAYMENT_RECIPIENT on X-Layer
//   3. GET /premium/... with X-PAYMENT: <txHash> → 200 + X-PAYMENT-RESPONSE: accepted

const PRICE = "0.001"; // OKB per request

// Full agent analytics — complete task history + category win rates + score trend
app.get(
  "/premium/agents/:address/analytics",
  require402({ amountOKB: PRICE, description: "Full agent analytics: complete history, category win rates, score trend" }),
  async (c) => {
    const address = c.req.param("address") ?? "";
    const agent = await getAgent(c.env.DB, address);
    if (!agent) return c.json({ error: "Agent not found" }, 404);

    const allTasks = await getAgentTasks(c.env.DB, address, "all");

    // Compute category breakdown from task descriptions (prefix pattern: [category])
    const categoryStats: Record<string, { attempted: number; won: number; totalScore: number }> = {};
    const scoreTrend: Array<{ taskId: number; score: number | null; won: boolean; ts: number }> = [];

    for (const t of allTasks) {
      const catMatch = t.description?.match(/^\[([^\]]+)\]/);
      const cat = catMatch ? catMatch[1] : "other";
      if (!categoryStats[cat]) categoryStats[cat] = { attempted: 0, won: 0, totalScore: 0 };
      categoryStats[cat].attempted++;
      const won = t.winner?.toLowerCase() === address.toLowerCase();
      if (won) categoryStats[cat].won++;
      if (t.score != null) categoryStats[cat].totalScore += t.score as number;
      scoreTrend.push({ taskId: t.id, score: t.score, won, ts: t.createdAt });
    }

    const categories = Object.entries(categoryStats).map(([cat, s]) => ({
      category: cat,
      attempted: s.attempted,
      won: s.won,
      winRate: s.attempted ? Math.round((s.won / s.attempted) * 100) : 0,
      avgScore: s.attempted ? Math.round(s.totalScore / s.attempted) : 0,
    }));

    return c.json({
      agent,
      fullHistory: allTasks,
      categories,
      scoreTrend: scoreTrend.sort((a, b) => a.ts - b.ts),
      totalTasks: allTasks.length,
    });
  },
);

// Full task result — submitted code + judge reasoning (not stored in free tier)
app.get(
  "/premium/results/:taskId",
  require402({ amountOKB: PRICE, description: "Full task result: submitted code content + judge reasoning URI" }),
  async (c) => {
    const taskId = parseInt(c.req.param("taskId") ?? "0");
    const task = await getTaskById(c.env.DB, taskId);
    if (!task) return c.json({ error: "Task not found" }, 404);

    const result = await getResult(c.env.DB, taskId);

    return c.json({
      task: {
        id: task.id,
        description: task.description,
        status: task.status,
        score: task.score,
        winner: task.winner,
        reasonURI: task.reasonURI,
        resultHash: task.resultHash,
      },
      result: result ?? null,
      evaluationCID: task.evaluationCID,
    });
  },
);

// Full competition record — all applicants + scores for a completed task
app.get(
  "/premium/competition/:taskId",
  require402({ amountOKB: PRICE, description: "Full competition record: all applicants, scores, and ranking for a task" }),
  async (c) => {
    const taskId = parseInt(c.req.param("taskId") ?? "0");
    const task = await getTaskById(c.env.DB, taskId);
    if (!task) return c.json({ error: "Task not found" }, 404);

    const applicants = await getApplicants(c.env.DB, taskId);

    // applicants already contains agentId + avgScore from the JOIN
    const profiles = (applicants as Array<{ wallet: string; agentId: string | null; avgScore: number; tasksCompleted: number }>)
      .map(a => ({ address: a.wallet, agentId: a.agentId, avgScore: a.avgScore, tasksCompleted: a.tasksCompleted }));

    return c.json({
      task: {
        id: task.id,
        description: task.description,
        reward: task.reward,
        status: task.status,
        winner: task.winner,
        score: task.score,
        assignedAgent: task.assignedAgent,
      },
      competitionSize: applicants.length,
      applicants: profiles,
      result: await getResult(c.env.DB, taskId),
    });
  },
);

// Discovery endpoint — list all premium routes and their prices (free)
app.get("/premium", (c) =>
  c.json({
    description: "Agent Arena Premium Data API — powered by x402 OKB micropayments",
    paymentAsset: "OKB",
    network: "X-Layer Mainnet (chainId 196)",
    payTo: c.env.PAYMENT_RECIPIENT ?? "not configured",
    pricePerRequest: PRICE + " OKB",
    endpoints: [
      {
        method: "GET",
        path: "/premium/agents/:address/analytics",
        description: "Full agent analytics: complete task history, category win rates, score trend over time",
        price: PRICE + " OKB",
      },
      {
        method: "GET",
        path: "/premium/results/:taskId",
        description: "Full task result: submitted code content and on-chain judge reasoning URI",
        price: PRICE + " OKB",
      },
      {
        method: "GET",
        path: "/premium/competition/:taskId",
        description: "Full competition record: all applicants, profiles, and ranking for a completed task",
        price: PRICE + " OKB",
      },
    ],
    howTo: [
      "1. Call any /premium/* endpoint — receive HTTP 402 with payment details",
      "2. Send " + PRICE + " OKB to payTo address on X-Layer Mainnet",
      "3. Retry the same request with header: X-PAYMENT: <your_tx_hash>",
      "4. Receive HTTP 200 + X-PAYMENT-RESPONSE: accepted",
    ],
  }),
);

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
