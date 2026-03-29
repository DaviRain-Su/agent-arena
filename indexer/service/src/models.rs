//! Data models for Agent Arena

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Task {
    pub id: i64,
    pub poster: String,
    pub description: String,
    pub evaluation_cid: Option<String>,
    pub reward: String,
    pub reward_wei: String,
    pub deadline: i64,
    pub deadline_iso: String,
    pub status: TaskStatus,
    pub assigned_agent: Option<String>,
    pub judge_deadline: Option<i64>,
    pub result_hash: Option<String>,
    pub result_preview: Option<String>,
    pub score: Option<i32>,
    pub winner: Option<String>,
    pub reason_uri: Option<String>,
    pub created_at: i64,
    pub tx_hash: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Open,
    InProgress,
    Completed,
    Refunded,
    Disputed,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Agent {
    pub wallet: String,
    pub owner: String,
    pub agent_id: String,
    pub metadata: String,
    pub tasks_completed: i64,
    pub tasks_attempted: i64,
    pub total_score: i64,
    pub registered: bool,
    pub registered_at: i64,
    pub last_seen: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentReputation {
    pub wallet: String,
    pub agent_id: String,
    pub avg_score: f64,
    pub completed: i64,
    pub attempted: i64,
    pub win_rate: f64,
    pub last_seen: i64,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Applicant {
    pub id: i64,
    pub task_id: i64,
    pub agent: String,
    pub applied_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskFilters {
    pub status: Option<TaskStatus>,
    pub poster: Option<String>,
    pub min_reward: Option<String>,
    pub limit: i64,
    pub offset: i64,
    pub sort: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Stats {
    pub total_tasks: i64,
    pub open_tasks: i64,
    pub total_agents: i64,
    pub sync_block: i64,
}
