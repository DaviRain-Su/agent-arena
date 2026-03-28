//! Chain event indexer

use anyhow::Result;
use ethers::{
    prelude::*,
    providers::{Http, Provider},
    types::{Address, Filter, U64},
};
use sqlx::Executor;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{debug, info, warn};

use crate::db::Database;
use crate::models::{Agent, Task, TaskStatus};

pub struct ChainIndexer {
    provider: Arc<Provider<Http>>,
    contract_address: Address,
    db: Database,
    abi: ethers::abi::Abi,
}

impl ChainIndexer {
    pub async fn new(
        rpc_url: String,
        contract_address: String,
        db: Database,
    ) -> Result<Self> {
        let provider = Arc::new(Provider::<Http>::try_from(rpc_url)?);
        let contract_address: Address = contract_address.parse()?;

        // Load ABI from file or embedded
        let abi: ethers::abi::Abi = serde_json::from_str(include_str!("../abi/AgentArena.json"))?;

        Ok(Self {
            provider,
            contract_address,
            db,
            abi,
        })
    }

    pub async fn start_sync(&self) -> Result<()> {
        info!("Starting chain sync...");
        
        let mut ticker = interval(Duration::from_secs(30));
        let mut last_block = self.get_last_synced_block().await?;

        loop {
            ticker.tick().await;

            match self.sync_events(last_block).await {
                Ok(new_block) => {
                    last_block = new_block;
                    self.db.update_sync_block(last_block as i64).await?;
                    debug!("Synced to block {}", last_block);
                }
                Err(e) => {
                    warn!("Sync failed: {}", e);
                }
            }
        }
    }

    async fn get_last_synced_block(&self) -> Result<u64> {
        let stats = self.db.get_stats().await?;
        if stats.sync_block == 0 {
            // Start from current block minus some buffer
            let current = self.provider.get_block_number().await?;
            Ok(current.as_u64().saturating_sub(1000))
        } else {
            Ok(stats.sync_block as u64)
        }
    }

    async fn sync_events(&self, from_block: u64) -> Result<u64> {
        let to_block = self.provider.get_block_number().await?.as_u64();
        
        if from_block >= to_block {
            return Ok(from_block);
        }

        info!("Syncing blocks {} to {}", from_block, to_block);

        // Event signatures (keccak256)
        let events = vec![
            ("TaskPosted", "0xcdf01a7fce2cec80e8e617626f3f34f334ed96168dfcbebc5b9fd0a64170337e"),
            ("TaskApplied", "0x7f4b15de145103c2f48b4429df1c147497eb30d764058cdbdd0e7b7ad82d8fac"),
            ("TaskAssigned", "0xfdbec991c520c476b24bb9ee9123ea146594b230b424c8140b23c33ac5906242"),
            ("ResultSubmitted", "0xc06b551d984e333ac851ab20b1454a08d92740468f52ff54c0cd5270817f20a9"),
            ("TaskCompleted", "0x6f86192dffec1db9a9661011e799dea69af8d97961785f45d421ac62a59e606d"),
            ("AgentRegistered", "0xda816ca2fc37b9eecec62ae8263008ec6be1afb38dc28bc9c7c51d7e348da9c2"),
        ];

        for (event_name, topic0) in events {
            let filter = Filter::new()
                .address(self.contract_address)
                .topic0(topic0.parse::<H256>()?)
                .from_block(from_block)
                .to_block(to_block);

            let logs = self.provider.get_logs(&filter).await?;
            
            for log in logs {
                if let Err(e) = self.process_event(event_name, &log).await {
                    warn!("Failed to process {}: {}", event_name, e);
                }
            }
        }

        Ok(to_block)
    }

    async fn process_event(&self, event_name: &str, log: &ethers::types::Log) -> Result<()> {
        match event_name {
            "TaskPosted" => self.process_task_posted(log).await,
            "TaskApplied" => self.process_task_applied(log).await,
            "TaskAssigned" => self.process_task_assigned(log).await,
            "ResultSubmitted" => self.process_result_submitted(log).await,
            "TaskCompleted" => self.process_task_completed(log).await,
            "AgentRegistered" => self.process_agent_registered(log).await,
            _ => Ok(()),
        }
    }

    async fn process_task_posted(&self, log: &ethers::types::Log) -> Result<()> {
        // Decode event data
        let task_id = U256::from(log.topics[1].as_bytes()).as_u64() as i64;
        let poster = format!("0x{}", hex::encode(&log.topics[2].as_bytes()[12..]));
        
        // Fetch full task data from contract
        // Simplified - in production, decode all event data
        info!("TaskPosted: #{} by {}", task_id, poster);
        
        Ok(())
    }

    async fn process_task_applied(&self, log: &ethers::types::Log) -> Result<()> {
        let task_id = U256::from(log.topics[1].as_bytes()).as_u64() as i64;
        let agent = format!("0x{}", hex::encode(&log.topics[2].as_bytes()[12..]));
        let block = self.provider.get_block(log.block_number.unwrap()).await?;
        let applied_at = block.unwrap().timestamp.as_u64() as i64;

        self.db.add_applicant(task_id, &agent, applied_at).await?;
        info!("TaskApplied: #{} by {}", task_id, agent);
        
        Ok(())
    }

    async fn process_task_assigned(&self, log: &ethers::types::Log) -> Result<()> {
        let task_id = U256::from(log.topics[1].as_bytes()).as_u64() as i64;
        let agent = format!("0x{}", hex::encode(&log.topics[2].as_bytes()[12..]));

        // Update task status by re-fetching from chain via upsert
        // For MVP: directly update the relevant fields in DB
        sqlx::query(
            "UPDATE tasks SET status = 'in_progress', assigned_agent = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(&agent)
        .bind(task_id)
        .execute(&*self.db.pool_ref())
        .await?;

        info!("TaskAssigned: #{} → {}", task_id, agent);
        Ok(())
    }

    async fn process_result_submitted(&self, log: &ethers::types::Log) -> Result<()> {
        let task_id = U256::from(log.topics[1].as_bytes()).as_u64() as i64;
        let agent = format!("0x{}", hex::encode(&log.topics[2].as_bytes()[12..]));

        // Decode resultHash from ABI-encoded data (dynamic string)
        let result_hash = Self::decode_abi_string(&log.data.0).unwrap_or_default();

        sqlx::query(
            "UPDATE tasks SET result_hash = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(&result_hash)
        .bind(task_id)
        .execute(&*self.db.pool_ref())
        .await?;

        info!("ResultSubmitted: #{} by {} hash={}", task_id, agent, &result_hash[..result_hash.len().min(40)]);
        Ok(())
    }

    async fn process_task_completed(&self, log: &ethers::types::Log) -> Result<()> {
        let task_id = U256::from(log.topics[1].as_bytes()).as_u64() as i64;
        let winner = format!("0x{}", hex::encode(&log.topics[2].as_bytes()[12..]));

        // data layout: reward (uint256, 32 bytes) + score (uint8, padded to 32 bytes)
        let data = &log.data.0;
        let score = if data.len() >= 64 { data[63] as i64 } else { 0 };

        sqlx::query(
            "UPDATE tasks SET status = 'completed', winner = ?, score = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(&winner)
        .bind(score)
        .bind(task_id)
        .execute(&*self.db.pool_ref())
        .await?;

        // Update agent stats
        sqlx::query(
            "UPDATE agents SET tasks_completed = tasks_completed + 1, total_score = total_score + ?, updated_at = datetime('now') WHERE wallet = ?"
        )
        .bind(score)
        .bind(&winner)
        .execute(&*self.db.pool_ref())
        .await?;

        info!("TaskCompleted: #{} winner={} score={}", task_id, winner, score);
        Ok(())
    }

    async fn process_agent_registered(&self, log: &ethers::types::Log) -> Result<()> {
        let wallet = format!("0x{}", hex::encode(&log.topics[1].as_bytes()[12..]));

        // Decode agentId from ABI-encoded data (dynamic string)
        let agent_id = Self::decode_abi_string(&log.data.0).unwrap_or_default();

        let agent = Agent {
            wallet: wallet.clone(),
            owner: wallet.clone(),
            agent_id,
            metadata: "{}".to_string(),
            tasks_completed: 0,
            tasks_attempted: 0,
            total_score: 0,
            registered: true,
            registered_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now(),
        };

        self.db.upsert_agent(&agent).await?;
        info!("AgentRegistered: {} ({})", wallet, agent.agent_id);

        Ok(())
    }

    /// Decode an ABI-encoded dynamic string from event data.
    /// Layout: offset (32 bytes) + length (32 bytes) + data (padded to 32 bytes)
    fn decode_abi_string(data: &[u8]) -> Option<String> {
        if data.len() < 64 { return None; }
        let offset = U256::from_big_endian(&data[0..32]).as_usize();
        if offset + 32 > data.len() { return None; }
        let len = U256::from_big_endian(&data[offset..offset+32]).as_usize();
        if offset + 32 + len > data.len() { return None; }
        String::from_utf8(data[offset+32..offset+32+len].to_vec()).ok()
    }
}
