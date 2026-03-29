//! Database operations

use anyhow::Result;
use sqlx::{Pool, Sqlite, Row};
use std::sync::Arc;

use crate::models::{Task, TaskStatus, Agent, AgentReputation, Applicant, TaskFilters, Stats};

#[derive(Clone)]
pub struct Database {
    pool: Arc<Pool<Sqlite>>,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self> {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;

        Ok(Self {
            pool: Arc::new(pool),
        })
    }

    pub fn pool_ref(&self) -> &Pool<Sqlite> {
        &self.pool
    }

    pub async fn migrate(&self) -> Result<()> {
        sqlx::migrate!("./migrations").run(&*self.pool).await?;
        Ok(())
    }

    // Task operations
    pub async fn upsert_task(&self, task: &Task) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO tasks (
                id, poster, description, evaluation_cid, reward, reward_wei, 
                deadline, deadline_iso, status, assigned_agent, judge_deadline,
                result_hash, result_preview, score, winner, reason_uri,
                created_at, tx_hash, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                assigned_agent = excluded.assigned_agent,
                judge_deadline = excluded.judge_deadline,
                result_hash = excluded.result_hash,
                result_preview = excluded.result_preview,
                score = excluded.score,
                winner = excluded.winner,
                reason_uri = excluded.reason_uri,
                updated_at = excluded.updated_at
            "#
        )
        .bind(task.id)
        .bind(&task.poster)
        .bind(&task.description)
        .bind(&task.evaluation_cid)
        .bind(&task.reward)
        .bind(&task.reward_wei)
        .bind(task.deadline)
        .bind(&task.deadline_iso)
        .bind(task.status)
        .bind(&task.assigned_agent)
        .bind(task.judge_deadline)
        .bind(&task.result_hash)
        .bind(&task.result_preview)
        .bind(task.score)
        .bind(&task.winner)
        .bind(&task.reason_uri)
        .bind(task.created_at)
        .bind(&task.tx_hash)
        .bind(task.updated_at)
        .execute(&*self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_tasks(&self, filters: &TaskFilters) -> Result<(Vec<Task>, i64)> {
        let mut query = "SELECT * FROM tasks WHERE 1=1".to_string();
        
        if let Some(status) = &filters.status {
            query.push_str(" AND status = ?");
        }
        if let Some(poster) = &filters.poster {
            query.push_str(" AND poster = ?");
        }
        
        // Count total
        let count_query = query.replace("SELECT *", "SELECT COUNT(*)");
        let mut count_qb = sqlx::query(&count_query);
        if let Some(status) = &filters.status {
            count_qb = count_qb.bind(status);
        }
        if let Some(poster) = &filters.poster {
            count_qb = count_qb.bind(poster);
        }
        let total: i64 = count_qb.fetch_one(&*self.pool).await?.get(0);

        // Sort
        query.push_str(match filters.sort.as_deref() {
            Some("reward_desc") => " ORDER BY reward_wei DESC",
            Some("newest") => " ORDER BY created_at DESC",
            _ => " ORDER BY created_at DESC",
        });
        
        // Pagination
        query.push_str(" LIMIT ? OFFSET ?");

        let mut qb = sqlx::query_as::<_, Task>(&query);
        if let Some(status) = &filters.status {
            qb = qb.bind(status);
        }
        if let Some(poster) = &filters.poster {
            qb = qb.bind(poster);
        }
        
        let tasks = qb
            .bind(filters.limit)
            .bind(filters.offset)
            .fetch_all(&*self.pool)
            .await?;

        Ok((tasks, total))
    }

    pub async fn get_task(&self, task_id: i64) -> Result<Option<Task>> {
        let task = sqlx::query_as::<_, Task>(
            "SELECT * FROM tasks WHERE id = ?"
        )
        .bind(task_id)
        .fetch_optional(&*self.pool)
        .await?;

        Ok(task)
    }

    // Agent operations
    pub async fn upsert_agent(&self, agent: &Agent) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO agents (wallet, owner, agent_id, metadata, tasks_completed, 
                tasks_attempted, total_score, registered, registered_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(wallet) DO UPDATE SET
                owner = excluded.owner,
                agent_id = excluded.agent_id,
                metadata = excluded.metadata,
                tasks_completed = excluded.tasks_completed,
                tasks_attempted = excluded.tasks_attempted,
                total_score = excluded.total_score,
                registered = excluded.registered,
                updated_at = excluded.updated_at
            "#
        )
        .bind(&agent.wallet)
        .bind(&agent.owner)
        .bind(&agent.agent_id)
        .bind(&agent.metadata)
        .bind(agent.tasks_completed)
        .bind(agent.tasks_attempted)
        .bind(agent.total_score)
        .bind(agent.registered)
        .bind(agent.registered_at)
        .bind(agent.updated_at)
        .execute(&*self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_agent(&self, wallet: &str) -> Result<Option<Agent>> {
        let agent = sqlx::query_as::<_, Agent>(
            "SELECT * FROM agents WHERE wallet = ?"
        )
        .bind(wallet)
        .fetch_optional(&*self.pool)
        .await?;

        Ok(agent)
    }

    pub async fn get_leaderboard(&self, limit: i64) -> Result<Vec<AgentReputation>> {
        let now = chrono::Utc::now().timestamp();
        let rows = sqlx::query_as::<_, (String, String, i64, i64, i64, i64)>(
            r#"
            SELECT wallet, agent_id, tasks_completed, tasks_attempted, total_score, last_seen
            FROM agents WHERE registered = true
            ORDER BY (CASE WHEN tasks_completed > 0 THEN total_score / tasks_completed ELSE 0 END) DESC, tasks_completed DESC
            LIMIT ?
            "#
        )
        .bind(limit)
        .fetch_all(&*self.pool)
        .await?;

        let leaderboard: Vec<AgentReputation> = rows
            .into_iter()
            .map(|(wallet, agent_id, completed, attempted, total, last_seen)| AgentReputation {
                wallet,
                agent_id,
                avg_score: if completed > 0 { total as f64 / completed as f64 } else { 0.0 },
                completed,
                attempted,
                win_rate: if attempted > 0 { completed as f64 / attempted as f64 * 100.0 } else { 0.0 },
                last_seen,
                online: last_seen > now - 300,
            })
            .collect();

        Ok(leaderboard)
    }

    pub async fn update_heartbeat(&self, wallet: &str) -> Result<bool> {
        let now = chrono::Utc::now().timestamp();
        let result = sqlx::query("UPDATE agents SET last_seen = ? WHERE LOWER(wallet) = LOWER(?)")
            .bind(now)
            .bind(wallet)
            .execute(&*self.pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    // Applicant operations
    pub async fn add_applicant(&self, task_id: i64, agent: &str, applied_at: i64) -> Result<()> {
        sqlx::query(
            "INSERT OR IGNORE INTO applicants (task_id, agent, applied_at) VALUES (?, ?, ?)"
        )
        .bind(task_id)
        .bind(agent)
        .bind(applied_at)
        .execute(&*self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_applicants(&self, task_id: i64) -> Result<Vec<String>> {
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT agent FROM applicants WHERE task_id = ? ORDER BY applied_at"
        )
        .bind(task_id)
        .fetch_all(&*self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    // Stats
    pub async fn get_stats(&self) -> Result<Stats> {
        let total_tasks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks")
            .fetch_one(&*self.pool)
            .await?;

        let open_tasks: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE status = 'open'"
        )
        .fetch_one(&*self.pool)
        .await?;

        let total_agents: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM agents WHERE registered = true"
        )
        .fetch_one(&*self.pool)
        .await?;

        let sync_block: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(block_number), 0) FROM sync_state")
            .fetch_one(&*self.pool)
            .await?;

        Ok(Stats {
            total_tasks,
            open_tasks,
            total_agents,
            sync_block,
        })
    }

    pub async fn update_sync_block(&self, block_number: i64) -> Result<()> {
        sqlx::query("INSERT INTO sync_state (id, block_number, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET block_number = excluded.block_number, updated_at = excluded.updated_at")
            .bind(block_number)
            .execute(&*self.pool)
            .await?;
        Ok(())
    }
}
