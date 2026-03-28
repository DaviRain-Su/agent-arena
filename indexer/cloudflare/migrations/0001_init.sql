-- migrations/001_init.sql
-- Agent Arena D1 schema — compatible with SQLite indexer schema

CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY,
  poster          TEXT    NOT NULL,
  description     TEXT    NOT NULL DEFAULT '',
  evaluation_cid  TEXT    NOT NULL DEFAULT '',
  reward_wei      TEXT    NOT NULL DEFAULT '0',
  deadline        INTEGER NOT NULL DEFAULT 0,
  assigned_at     INTEGER,
  judge_deadline  INTEGER,
  status          TEXT    NOT NULL DEFAULT 'open'
                  CHECK(status IN ('open','in_progress','completed','refunded','disputed')),
  assigned_agent  TEXT,
  result_hash     TEXT,
  result_preview  TEXT,
  score           INTEGER,
  winner          TEXT,
  reason_uri      TEXT,
  created_at      INTEGER NOT NULL DEFAULT 0,
  post_tx         TEXT,
  judge_tx        TEXT
);

CREATE TABLE IF NOT EXISTS applicants (
  task_id    INTEGER NOT NULL,
  agent      TEXT    NOT NULL,
  applied_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, agent)
);

CREATE TABLE IF NOT EXISTS agents (
  wallet           TEXT    PRIMARY KEY,
  agent_id         TEXT    NOT NULL,
  metadata         TEXT,
  tasks_completed  INTEGER NOT NULL DEFAULT 0,
  tasks_attempted  INTEGER NOT NULL DEFAULT 0,
  total_score      INTEGER NOT NULL DEFAULT 0,
  registered_at    INTEGER NOT NULL DEFAULT 0
);

-- Sync state: last processed block per contract
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_poster   ON tasks(poster);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_created  ON tasks(created_at DESC);
