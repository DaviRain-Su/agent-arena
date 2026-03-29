// src/db.ts — D1 database queries

import type { Env, Task, TaskDetail, TaskFilters, AgentRow } from "./types.js";

const STATUS_MAP: Record<number, string> = {
  0: "open", 1: "in_progress", 2: "completed", 3: "refunded", 4: "disputed",
};

function weiToOkb(wei: string): string {
  try {
    return String(Number(BigInt(wei)) / 1e18);
  } catch {
    return "0";
  }
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    poster: row.poster as string,
    description: row.description as string,
    evaluationCID: row.evaluation_cid as string,
    reward: weiToOkb(row.reward_wei as string),
    rewardWei: row.reward_wei as string,
    deadline: row.deadline as number,
    deadlineISO: new Date((row.deadline as number) * 1000).toISOString(),
    status: row.status as Task["status"],
    assignedAgent: (row.assigned_agent as string) || null,
    judgeDeadline: (row.judge_deadline as number) || null,
    createdAt: row.created_at as number,
    txHash: (row.post_tx as string) || null,
    resultHash: (row.result_hash as string) || null,
    score: row.score != null ? (row.score as number) : null,
    winner: (row.winner as string) || null,
    reasonURI: (row.reason_uri as string) || null,
  };
}

function rowToTaskDetail(row: Record<string, unknown>): TaskDetail {
  return {
    ...rowToTask(row),
    resultHash: (row.result_hash as string) || null,
    resultPreview: (row.result_preview as string) || null,
    score: row.score != null ? (row.score as number) : null,
    winner: (row.winner as string) || null,
    reasonURI: (row.reason_uri as string) || null,
    applicantCount: 0,
    judgeTxHash: (row.judge_tx as string) || null,
  };
}

function rowToAgent(row: AgentRow) {
  return {
    wallet: row.wallet,
    owner: row.owner || null,
    agentId: row.agent_id,
    metadata: row.metadata,
    tasksCompleted: row.tasks_completed,
    tasksAttempted: row.tasks_attempted,
    totalScore: row.total_score,
    avgScore: row.tasks_completed > 0 ? Math.round(row.total_score / row.tasks_completed) : 0,
    winRate: row.tasks_attempted > 0 ? Math.round((row.tasks_completed / row.tasks_attempted) * 100) : 0,
    registeredAt: row.registered_at,
    lastSeen: row.last_seen || 0,
    online: (row.last_seen || 0) > Math.floor(Date.now() / 1000) - 300,
  };
}

// ─── Sync State ───────────────────────────────────────────────────────────────

export async function getLastBlock(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM sync_state WHERE key = 'last_block'").first<{ value: string }>();
  return row ? parseInt(row.value) : 0;
}

export async function setLastBlock(db: D1Database, block: number): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_block', ?)")
    .bind(String(block)).run();
}

// ─── Task Queries ─────────────────────────────────────────────────────────────

export async function upsertTask(db: D1Database, t: {
  id: number; poster: string; description: string; evaluationCid: string;
  rewardWei: string; deadline: number; assignedAt: number | null;
  judgeDeadline: number | null; status: string; assignedAgent: string | null;
  resultHash: string | null; score: number | null; winner: string | null;
  reasonUri: string | null; createdAt: number; postTx: string | null; judgeTx: string | null;
}): Promise<void> {
  await db.prepare(`
    INSERT INTO tasks (id, poster, description, evaluation_cid, reward_wei, deadline,
      assigned_at, judge_deadline, status, assigned_agent, result_hash, score, winner,
      reason_uri, created_at, post_tx, judge_tx)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
    ON CONFLICT(id) DO UPDATE SET
      evaluation_cid = excluded.evaluation_cid,
      assigned_at    = excluded.assigned_at,
      judge_deadline = excluded.judge_deadline,
      status         = excluded.status,
      assigned_agent = excluded.assigned_agent,
      result_hash    = excluded.result_hash,
      score          = excluded.score,
      winner         = excluded.winner,
      reason_uri     = excluded.reason_uri,
      judge_tx       = excluded.judge_tx
  `).bind(
    t.id, t.poster, t.description, t.evaluationCid, t.rewardWei, t.deadline,
    t.assignedAt, t.judgeDeadline, t.status, t.assignedAgent, t.resultHash,
    t.score, t.winner, t.reasonUri, t.createdAt, t.postTx, t.judgeTx
  ).run();
}

export async function setResultPreview(db: D1Database, taskId: number, preview: string): Promise<void> {
  await db.prepare("UPDATE tasks SET result_preview = ? WHERE id = ?").bind(preview, taskId).run();
}

export async function getTasks(db: D1Database, filters: TaskFilters): Promise<{ total: number; tasks: Task[] }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status !== "all") {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.poster) {
    where.push("LOWER(poster) = LOWER(?)");
    params.push(filters.poster);
  }
  if (filters.minReward) {
    where.push("CAST(reward_wei AS INTEGER) >= ?");
    params.push(String(Math.round(parseFloat(filters.minReward) * 1e18)));
  }

  const orderMap: Record<string, string> = {
    newest: "created_at DESC",
    reward_desc: "CAST(reward_wei AS INTEGER) DESC",
    reward_asc: "CAST(reward_wei AS INTEGER) ASC",
    deadline_asc: "deadline ASC",
  };

  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
  const orderClause = orderMap[filters.sort] || "created_at DESC";

  const [rowsResult, countResult] = await Promise.all([
    db.prepare(`SELECT * FROM tasks ${whereClause} ORDER BY ${orderClause} LIMIT ? OFFSET ?`)
      .bind(...params, filters.limit, filters.offset).all(),
    db.prepare(`SELECT COUNT(*) as cnt FROM tasks ${whereClause}`)
      .bind(...params).first<{ cnt: number }>(),
  ]);

  return {
    total: countResult?.cnt ?? 0,
    tasks: (rowsResult.results as Record<string, unknown>[]).map(rowToTask),
  };
}

export async function getTaskById(db: D1Database, id: number): Promise<TaskDetail | null> {
  const row = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  const detail = rowToTaskDetail(row);
  const cnt = await db.prepare("SELECT COUNT(*) as c FROM applicants WHERE task_id = ?").bind(id).first<{ c: number }>();
  detail.applicantCount = cnt?.c ?? 0;
  return detail;
}

export async function getApplicants(db: D1Database, taskId: number) {
  const result = await db.prepare(`
    SELECT a.agent, a.applied_at, ag.agent_id, ag.tasks_completed, ag.tasks_attempted, ag.total_score
    FROM applicants a
    LEFT JOIN agents ag ON LOWER(a.agent) = LOWER(ag.wallet)
    WHERE a.task_id = ?
    ORDER BY a.applied_at ASC
  `).bind(taskId).all();
  return (result.results as Record<string, unknown>[]).map(r => ({
    wallet: r.agent as string,
    agentId: (r.agent_id as string) || null,
    avgScore: (r.tasks_completed as number) > 0
      ? Math.round((r.total_score as number) / (r.tasks_completed as number)) : 0,
    tasksCompleted: (r.tasks_completed as number) || 0,
    winRate: (r.tasks_attempted as number) > 0
      ? Math.round(((r.tasks_completed as number) / (r.tasks_attempted as number)) * 100) : 0,
    appliedAt: r.applied_at as number,
  }));
}

export async function addApplicant(db: D1Database, taskId: number, agent: string, timestamp: number): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO applicants (task_id, agent, applied_at) VALUES (?, ?, ?)")
    .bind(taskId, agent, timestamp).run();
}

// ─── Agent Queries ────────────────────────────────────────────────────────────

export async function upsertAgent(db: D1Database, a: {
  wallet: string; owner?: string | null; agentId: string; metadata: string;
  tasksCompleted: number; tasksAttempted: number; totalScore: number; registeredAt: number;
}): Promise<void> {
  await db.prepare(`
    INSERT INTO agents (wallet, owner, agent_id, metadata, tasks_completed, tasks_attempted, total_score, registered_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
    ON CONFLICT(wallet) DO UPDATE SET
      owner           = COALESCE(excluded.owner, agents.owner),
      tasks_completed = excluded.tasks_completed,
      tasks_attempted = excluded.tasks_attempted,
      total_score     = excluded.total_score
  `).bind(a.wallet, a.owner || null, a.agentId, a.metadata, a.tasksCompleted, a.tasksAttempted, a.totalScore, a.registeredAt).run();
}

export async function getAgent(db: D1Database, wallet: string) {
  const row = await db.prepare("SELECT * FROM agents WHERE LOWER(wallet) = LOWER(?)")
    .bind(wallet).first<AgentRow>();
  return row ? rowToAgent(row) : null;
}

export async function getLeaderboard(db: D1Database, limit: number, sort: string) {
  const orderMap: Record<string, string> = {
    avg_score: "(CASE WHEN tasks_completed > 0 THEN total_score / tasks_completed ELSE 0 END) DESC",
    win_rate: "(CASE WHEN tasks_attempted > 0 THEN tasks_completed * 100 / tasks_attempted ELSE 0 END) DESC",
    completed: "tasks_completed DESC",
    newest: "registered_at DESC",
  };
  const result = await db.prepare(
    `SELECT * FROM agents ORDER BY ${orderMap[sort] || orderMap.avg_score} LIMIT ?`
  ).bind(limit).all();
  return (result.results as unknown as AgentRow[]).map(rowToAgent);
}

export async function getAgentTasks(db: D1Database, wallet: string, status: string): Promise<Task[]> {
  let sql: string;
  let params: unknown[];

  switch (status) {
    case "assigned":
      sql = "SELECT * FROM tasks WHERE status = 'in_progress' AND LOWER(assigned_agent) = LOWER(?) ORDER BY created_at DESC";
      params = [wallet];
      break;
    case "completed":
      sql = "SELECT * FROM tasks WHERE status = 'completed' AND LOWER(winner) = LOWER(?) ORDER BY created_at DESC";
      params = [wallet];
      break;
    case "applied":
      sql = "SELECT t.* FROM tasks t JOIN applicants a ON t.id = a.task_id WHERE LOWER(a.agent) = LOWER(?) ORDER BY t.created_at DESC";
      params = [wallet];
      break;
    default:
      sql = "SELECT t.* FROM tasks t WHERE LOWER(t.assigned_agent) = LOWER(?1) OR LOWER(t.winner) = LOWER(?1) OR t.id IN (SELECT task_id FROM applicants WHERE LOWER(agent) = LOWER(?1)) ORDER BY t.created_at DESC";
      params = [wallet];
  }

  const result = await db.prepare(sql).bind(...params).all();
  return (result.results as Record<string, unknown>[]).map(rowToTask);
}

export async function getStats(db: D1Database) {
  const [taskStats, agentCount] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status='completed' THEN CAST(reward_wei AS INTEGER) ELSE 0 END) as total_paid_wei,
        AVG(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) as avg_score
      FROM tasks
    `).first<Record<string, number>>(),
    db.prepare("SELECT COUNT(*) as cnt FROM agents").first<{ cnt: number }>(),
  ]);
  return {
    totalTasks:      taskStats?.total ?? 0,
    openTasks:       taskStats?.open_count ?? 0,
    completedTasks:  taskStats?.completed_count ?? 0,
    totalAgents:     agentCount?.cnt ?? 0,
    totalRewardPaid: weiToOkb(String(Math.round(taskStats?.total_paid_wei ?? 0))),
    avgScore:        Math.round(taskStats?.avg_score ?? 0),
  };
}

// ─── Result Content ──────────────────────────────────────────────────────────

export async function storeResult(db: D1Database, taskId: number, content: string, agentAddress: string | null): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO results (task_id, content, agent_address, stored_at)
    VALUES (?, ?, ?, ?)
  `).bind(taskId, content, agentAddress, Date.now()).run();
}

export async function getResult(db: D1Database, taskId: number) {
  const row = await db.prepare("SELECT * FROM results WHERE task_id = ?")
    .bind(taskId).first<{ task_id: number; content: string; agent_address: string | null; stored_at: number }>();
  if (!row) return null;
  return { taskId: row.task_id, content: row.content, agentAddress: row.agent_address, storedAt: row.stored_at };
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

export async function updateHeartbeat(db: D1Database, wallet: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare("UPDATE agents SET last_seen = ? WHERE LOWER(wallet) = LOWER(?)")
    .bind(now, wallet).run();
  return (result.meta?.changes ?? 0) > 0;
}
