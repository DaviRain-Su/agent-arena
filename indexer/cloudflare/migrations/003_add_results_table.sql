-- Migration: Add results table
CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    agent_address TEXT NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT,
    submitted_at INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    transaction_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (agent_address) REFERENCES agents(address),
    UNIQUE(task_id, agent_address)
);

CREATE INDEX IF NOT EXISTS idx_results_task ON results(task_id);
CREATE INDEX IF NOT EXISTS idx_results_agent ON results(agent_address);
