// local-indexer/src/db.js — SQLite schema and queries (uses built-in node:sqlite)

import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, "../data/arena.db");

mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY,
    poster        TEXT NOT NULL,
    description   TEXT NOT NULL,
    evaluation_cid TEXT NOT NULL DEFAULT '',
    reward_wei    TEXT NOT NULL,
    deadline      INTEGER NOT NULL,
    assigned_at   INTEGER,
    judge_deadline INTEGER,
    status        TEXT NOT NULL DEFAULT 'open',
    assigned_agent TEXT,
    result_hash   TEXT,
    result_preview TEXT,
    score         INTEGER,
    winner        TEXT,
    reason_uri    TEXT,
    created_at    INTEGER NOT NULL,
    post_tx       TEXT,
    judge_tx      TEXT
  );

  CREATE TABLE IF NOT EXISTS applicants (
    task_id   INTEGER NOT NULL,
    agent     TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    PRIMARY KEY (task_id, agent)
  );

  CREATE TABLE IF NOT EXISTS agents (
    wallet          TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    metadata        TEXT,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    tasks_attempted INTEGER NOT NULL DEFAULT 0,
    total_score     INTEGER NOT NULL DEFAULT 0,
    registered_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_poster   ON tasks(poster);
  CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
  CREATE INDEX IF NOT EXISTS idx_agents_score   ON agents(tasks_completed DESC);
`);

// ─── Sync State ──────────────────────────────────────────────────────────────

export function getLastBlock() {
  const row = db.prepare("SELECT value FROM sync_state WHERE key = 'last_block'").get();
  return row ? parseInt(row.value) : 0;
}

export function setLastBlock(blockNumber) {
  db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES (:key, :value)")
    .run({ ':key': 'last_block', ':value': String(blockNumber) });
}

// ─── Task Queries ─────────────────────────────────────────────────────────────

const STATUS_MAP = { 0: "open", 1: "in_progress", 2: "completed", 3: "refunded", 4: "disputed" };

export function upsertTask(t) {
  db.prepare(`
    INSERT INTO tasks (id, poster, description, evaluation_cid, reward_wei, deadline, assigned_at,
      judge_deadline, status, assigned_agent, result_hash, score, winner, reason_uri, created_at, post_tx, judge_tx)
    VALUES (:id, :poster, :description, :evaluationCid, :rewardWei, :deadline, :assignedAt,
      :judgeDeadline, :status, :assignedAgent, :resultHash, :score, :winner, :reasonUri, :createdAt, :postTx, :judgeTx)
    ON CONFLICT(id) DO UPDATE SET
      evaluation_cid  = excluded.evaluation_cid,
      assigned_at     = excluded.assigned_at,
      judge_deadline  = excluded.judge_deadline,
      status          = excluded.status,
      assigned_agent  = excluded.assigned_agent,
      result_hash     = excluded.result_hash,
      score           = excluded.score,
      winner          = excluded.winner,
      reason_uri      = excluded.reason_uri,
      judge_tx        = excluded.judge_tx
  `).run({
    ':id': t.id,
    ':poster': t.poster,
    ':description': t.description,
    ':evaluationCid': t.evaluationCid,
    ':rewardWei': t.rewardWei,
    ':deadline': t.deadline,
    ':assignedAt': t.assignedAt,
    ':judgeDeadline': t.judgeDeadline,
    ':status': t.status,
    ':assignedAgent': t.assignedAgent,
    ':resultHash': t.resultHash,
    ':score': t.score,
    ':winner': t.winner,
    ':reasonUri': t.reasonUri,
    ':createdAt': t.createdAt,
    ':postTx': t.postTx,
    ':judgeTx': t.judgeTx,
  });
}

export function setResultPreview(taskId, preview) {
  db.prepare("UPDATE tasks SET result_preview = :preview WHERE id = :id")
    .run({ ':preview': preview, ':id': taskId });
}

function formatTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    poster: row.poster,
    description: row.description,
    evaluationCID: row.evaluation_cid,
    reward: String(Number(BigInt(row.reward_wei)) / 1e18),
    rewardWei: row.reward_wei,
    deadline: row.deadline,
    deadlineISO: new Date(row.deadline * 1000).toISOString(),
    status: row.status,
    assignedAgent: row.assigned_agent || null,
    judgeDeadline: row.judge_deadline || null,
    createdAt: row.created_at,
    txHash: row.post_tx || null,
  };
}

function formatTaskDetail(row) {
  const base = formatTask(row);
  if (!base) return null;
  return {
    ...base,
    resultHash: row.result_hash || null,
    resultPreview: row.result_preview || null,
    score: row.score ?? null,
    winner: row.winner || null,
    reasonURI: row.reason_uri || null,
    judgeTxHash: row.judge_tx || null,
    applicantCount: 0,
  };
}

export function getTaskById(id) {
  const row = db.prepare("SELECT * FROM tasks WHERE id = :id").get({ ':id': id });
  return formatTaskDetail(row);
}

export function getTasks({ status = "open", poster, limit = 20, offset = 0, sort = "newest", minReward } = {}) {
  let where = [];
  let params = {};
  let paramIdx = 0;

  if (status !== "all") {
    where.push("status = :status");
    params[':status'] = status.replace("-", "_");
  }
  if (poster) {
    where.push("LOWER(poster) = LOWER(:poster)");
    params[':poster'] = poster;
  }
  if (minReward) {
    const minWei = BigInt(Math.round(parseFloat(minReward) * 1e18)).toString();
    where.push("CAST(reward_wei AS INTEGER) >= :minWei");
    params[':minWei'] = minWei;
  }

  const orderMap = {
    newest: "created_at DESC",
    reward_desc: "CAST(reward_wei AS INTEGER) DESC",
    reward_asc: "CAST(reward_wei AS INTEGER) ASC",
    deadline_asc: "deadline ASC",
  };

  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
  const orderClause = `ORDER BY ${orderMap[sort] || "created_at DESC"}`;

  const rows = db.prepare(`SELECT * FROM tasks ${whereClause} ${orderClause} LIMIT :limit OFFSET :offset`)
    .all({ ...params, ':limit': limit, ':offset': offset });

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM tasks ${whereClause}`)
    .get(params);

  return {
    total: countRow.cnt,
    tasks: rows.map(formatTask),
  };
}

export function getApplicants(taskId) {
  return db.prepare(`
    SELECT a.*, ag.agent_id, ag.tasks_completed, ag.total_score, ag.tasks_attempted
    FROM applicants a
    LEFT JOIN agents ag ON LOWER(a.agent) = LOWER(ag.wallet)
    WHERE a.task_id = :taskId
    ORDER BY a.applied_at ASC
  `).all({ ':taskId': taskId });
}

export function addApplicant(taskId, agent, timestamp) {
  db.prepare(`INSERT OR IGNORE INTO applicants (task_id, agent, applied_at) VALUES (:taskId, :agent, :ts)`)
    .run({ ':taskId': taskId, ':agent': agent, ':ts': timestamp });
}

// ─── Agent Queries ────────────────────────────────────────────────────────────

export function upsertAgent(a) {
  db.prepare(`
    INSERT INTO agents (wallet, agent_id, metadata, tasks_completed, tasks_attempted, total_score, registered_at)
    VALUES (:wallet, :agentId, :metadata, :tasksCompleted, :tasksAttempted, :totalScore, :registeredAt)
    ON CONFLICT(wallet) DO UPDATE SET
      tasks_completed = excluded.tasks_completed,
      tasks_attempted = excluded.tasks_attempted,
      total_score     = excluded.total_score
  `).run({
    ':wallet': a.wallet,
    ':agentId': a.agentId,
    ':metadata': a.metadata,
    ':tasksCompleted': a.tasksCompleted,
    ':tasksAttempted': a.tasksAttempted,
    ':totalScore': a.totalScore,
    ':registeredAt': a.registeredAt,
  });
}

function formatAgent(row) {
  if (!row) return null;
  return {
    wallet: row.wallet,
    agentId: row.agent_id,
    metadata: row.metadata,
    tasksCompleted: row.tasks_completed,
    tasksAttempted: row.tasks_attempted,
    totalScore: row.total_score,
    avgScore: row.tasks_completed > 0 ? Math.round(row.total_score / row.tasks_completed) : 0,
    winRate: row.tasks_attempted > 0 ? Math.round((row.tasks_completed / row.tasks_attempted) * 100) : 0,
    registeredAt: row.registered_at,
  };
}

export function getAgent(wallet) {
  const row = db.prepare("SELECT * FROM agents WHERE LOWER(wallet) = LOWER(:wallet)").get({ ':wallet': wallet });
  return formatAgent(row);
}

export function getLeaderboard({ limit = 10, sort = "avg_score" } = {}) {
  const orderMap = {
    avg_score: "(CASE WHEN tasks_completed > 0 THEN total_score / tasks_completed ELSE 0 END) DESC",
    win_rate: "(CASE WHEN tasks_attempted > 0 THEN tasks_completed * 100 / tasks_attempted ELSE 0 END) DESC",
    completed: "tasks_completed DESC",
    newest: "registered_at DESC",
  };
  const rows = db.prepare(
    `SELECT * FROM agents ORDER BY ${orderMap[sort] || orderMap.avg_score} LIMIT :limit`
  ).all({ ':limit': limit });
  return rows.map(formatAgent);
}

export function getAgentTasks(wallet, status = "assigned") {
  const filters = {
    assigned:  "status = 'in_progress' AND LOWER(assigned_agent) = LOWER(:wallet)",
    completed: "status = 'completed' AND LOWER(winner) = LOWER(:wallet)",
    applied:   "id IN (SELECT task_id FROM applicants WHERE LOWER(agent) = LOWER(:wallet))",
    all:       "id IN (SELECT task_id FROM applicants WHERE LOWER(agent) = LOWER(:wallet)) OR LOWER(assigned_agent) = LOWER(:wallet) OR LOWER(winner) = LOWER(:wallet)",
  };
  const filter = filters[status] || filters.assigned;
  const rows = db.prepare(`SELECT * FROM tasks WHERE ${filter} ORDER BY created_at DESC`)
    .all({ ':wallet': wallet });
  return rows.map(formatTask);
}

export function getStats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status='completed' THEN CAST(reward_wei AS INTEGER) ELSE 0 END) as total_paid_wei,
      AVG(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) as avg_score
    FROM tasks
  `).get();
  const agentRow = db.prepare("SELECT COUNT(*) as cnt FROM agents").get();
  return {
    totalTasks: row.total,
    openTasks: row.open,
    completedTasks: row.completed,
    totalAgents: agentRow.cnt,
    totalRewardPaid: String(Number(BigInt(Math.round(row.total_paid_wei || 0))) / 1e18),
    avgScore: Math.round(row.avg_score || 0),
  };
}

export default db;
