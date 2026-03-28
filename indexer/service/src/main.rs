//! Agent Arena Indexer Service
//! 
//! High-performance chain event indexer with REST API
//! Supports SQLite (default) or PostgreSQL for production

use anyhow::Result;
use tracing::{info, warn};

mod api;
mod config;
mod db;
mod indexer;
mod models;
mod sync;

use crate::config::Settings;
use crate::db::Database;
use crate::indexer::ChainIndexer;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,indexer=debug".into()),
        )
        .init();

    info!("🏟️  Agent Arena Indexer Service starting...");

    // Load configuration
    let settings = Settings::new()?;
    info!("Configuration loaded: {:?}", settings);

    // Initialize database
    let db = Database::new(&settings.database_url).await?;
    db.migrate().await?;
    info!("Database initialized and migrated");

    // Start chain sync in background
    let indexer = ChainIndexer::new(
        settings.rpc_url.clone(),
        settings.contract_address.clone(),
        db.clone(),
    ).await?;

    let sync_handle = tokio::spawn(async move {
        if let Err(e) = indexer.start_sync().await {
            warn!("Sync error: {}", e);
        }
    });

    // Start API server
    let app = api::create_app(db);
    let listener = tokio::net::TcpListener::bind(&settings.bind_address).await?;
    
    info!("🚀 API server listening on {}", settings.bind_address);
    
    tokio::select! {
        result = axum::serve(listener, app) => {
            result?;
        }
        _ = sync_handle => {
            warn!("Sync task ended");
        }
    }

    Ok(())
}