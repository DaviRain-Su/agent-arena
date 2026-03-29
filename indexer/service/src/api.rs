//! REST API endpoints

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use tower_http::cors::CorsLayer;

use crate::db::Database;
use crate::models::{TaskFilters, TaskStatus, Stats};

pub fn create_app(db: Database) -> Router {
    Router::new()
        // Health
        .route("/health", get(health_check))
        // Tasks
        .route("/tasks", get(list_tasks))
        .route("/tasks/:id", get(get_task))
        .route("/tasks/:id/applicants", get(get_applicants))
        // Agents
        .route("/agents/:address", get(get_agent))
        .route("/agents/:address/tasks", get(get_agent_tasks))
        // Leaderboard & Stats
        .route("/leaderboard", get(get_leaderboard))
        .route("/stats", get(get_stats))
        // Heartbeat
        .route("/heartbeat", post(heartbeat))
        // State
        .with_state(db)
        .layer(CorsLayer::permissive())
}

// Health check
async fn health_check(State(db): State<Database>) -> Json<serde_json::Value> {
    let stats = db.get_stats().await.unwrap_or(Stats {
        total_tasks: 0,
        open_tasks: 0,
        total_agents: 0,
        sync_block: 0,
    });

    Json(serde_json::json!({
        "status": "healthy",
        "sync_block": stats.sync_block,
    }))
}

// Task endpoints
#[derive(Deserialize)]
struct ListTasksQuery {
    status: Option<String>,
    poster: Option<String>,
    min_reward: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    sort: Option<String>,
}

async fn list_tasks(
    State(db): State<Database>,
    Query(query): Query<ListTasksQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let filters = TaskFilters {
        status: query.status.and_then(|s| match s.as_str() {
            "open" => Some(TaskStatus::Open),
            "in_progress" => Some(TaskStatus::InProgress),
            "completed" => Some(TaskStatus::Completed),
            _ => None,
        }),
        poster: query.poster,
        min_reward: query.min_reward,
        limit: query.limit.unwrap_or(10),
        offset: query.offset.unwrap_or(0),
        sort: query.sort,
    };

    let (tasks, total) = db.get_tasks(&filters).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({
        "total": total,
        "tasks": tasks,
    })))
}

async fn get_task(
    State(db): State<Database>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let task = db.get_task(id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match task {
        Some(task) => {
            let applicants = db.get_applicants(id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            
            Ok(Json(serde_json::json!({
                "task": task,
                "applicants": applicants,
            })))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

async fn get_applicants(
    State(db): State<Database>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let applicants = db.get_applicants(id).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(serde_json::json!({
        "task_id": id,
        "applicants": applicants,
    })))
}

// Agent endpoints
async fn get_agent(
    State(db): State<Database>,
    Path(address): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let agent = db.get_agent(&address).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match agent {
        Some(agent) => Ok(Json(serde_json::json!(agent))),
        None => Err(StatusCode::NOT_FOUND),
    }
}

#[derive(Deserialize)]
struct AgentTasksQuery {
    status: Option<String>,
}

async fn get_agent_tasks(
    State(_db): State<Database>,
    Path(_address): Path<String>,
    Query(_query): Query<AgentTasksQuery>,
) -> Json<serde_json::Value> {
    // TODO: Implement agent-specific task query
    Json(serde_json::json!({
        "tasks": [],
    }))
}

// Leaderboard
#[derive(Deserialize)]
struct LeaderboardQuery {
    limit: Option<i64>,
    online: Option<String>,
}

async fn get_leaderboard(
    State(db): State<Database>,
    Query(query): Query<LeaderboardQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut agents = db.get_leaderboard(query.limit.unwrap_or(10)).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if query.online.as_deref() == Some("true") {
        agents.retain(|a| a.online);
    }

    Ok(Json(serde_json::json!({
        "agents": agents,
    })))
}

// Stats
async fn get_stats(State(db): State<Database>) -> Json<serde_json::Value> {
    let stats = db.get_stats().await.unwrap_or(Stats {
        total_tasks: 0,
        open_tasks: 0,
        total_agents: 0,
        sync_block: 0,
    });

    Json(serde_json::json!(stats))
}

// Heartbeat
#[derive(Deserialize)]
struct HeartbeatBody {
    wallet: String,
}

async fn heartbeat(
    State(db): State<Database>,
    Json(body): Json<HeartbeatBody>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let updated = db.update_heartbeat(&body.wallet).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !updated {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(serde_json::json!({
        "ok": true,
        "wallet": body.wallet,
        "timestamp": chrono::Utc::now().timestamp(),
    })))
}
