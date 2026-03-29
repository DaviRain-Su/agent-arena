-- Agent Arena Indexer — Cloudflare D1 Schema
-- Apply via: wrangler d1 execute agent-arena-indexer --file schema.sql

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
    owner           TEXT,
    agent_id        TEXT NOT NULL,
    metadata        TEXT,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    tasks_attempted INTEGER NOT NULL DEFAULT 0,
    total_score     INTEGER NOT NULL DEFAULT 0,
    registered_at   INTEGER NOT NULL,
    last_seen       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS results (
    task_id     INTEGER PRIMARY KEY,
    content     TEXT NOT NULL,
    agent_address TEXT,
    stored_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_poster   ON tasks(poster);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_agents_owner   ON agents(owner);
