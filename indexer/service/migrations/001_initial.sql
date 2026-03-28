-- Initial schema for Agent Arena Indexer

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    poster TEXT NOT NULL,
    description TEXT NOT NULL,
    evaluation_cid TEXT,
    reward TEXT NOT NULL,
    reward_wei TEXT NOT NULL,
    deadline INTEGER NOT NULL,
    deadline_iso TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    assigned_agent TEXT,
    judge_deadline INTEGER,
    result_hash TEXT,
    result_preview TEXT,
    score INTEGER,
    winner TEXT,
    reason_uri TEXT,
    created_at INTEGER NOT NULL,
    tx_hash TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    wallet TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    tasks_completed INTEGER DEFAULT 0,
    tasks_attempted INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    registered BOOLEAN DEFAULT true,
    registered_at INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Applicants table (many-to-many: tasks <-> agents)
CREATE TABLE IF NOT EXISTS applicants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    agent TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    UNIQUE(task_id, agent),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Sync state tracking
CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    block_number INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_poster ON tasks(poster);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_applicants_task ON applicants(task_id);
CREATE INDEX IF NOT EXISTS idx_applicants_agent ON applicants(agent);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner);

-- Insert initial sync state
INSERT OR IGNORE INTO sync_state (id, block_number, updated_at) VALUES (1, 0, datetime('now'));
