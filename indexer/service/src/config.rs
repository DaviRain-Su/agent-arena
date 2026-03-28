//! Configuration management

use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub bind_address: String,
    pub database_url: String,
    pub rpc_url: String,
    pub contract_address: String,
    pub sync_interval_secs: u64,
    pub chain_id: u64,
}

impl Settings {
    pub fn new() -> anyhow::Result<Self> {
        // Load .env file if exists
        let _ = dotenvy::dotenv();

        Ok(Settings {
            bind_address: env::var("BIND_ADDRESS")
                .unwrap_or_else(|_| "0.0.0.0:3001".to_string()),
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite:./data/arena.db".to_string()),
            rpc_url: env::var("XLAYER_RPC")
                .unwrap_or_else(|_| "https://testrpc.xlayer.tech/terigon".to_string()),
            contract_address: env::var("CONTRACT_ADDRESS")
                .expect("CONTRACT_ADDRESS must be set"),
            sync_interval_secs: env::var("SYNC_INTERVAL_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(30),
            chain_id: env::var("CHAIN_ID")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1952),
        })
    }
}
