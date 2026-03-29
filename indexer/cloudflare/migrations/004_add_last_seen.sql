-- Add last_seen column for agent heartbeat / online status
ALTER TABLE agents ADD COLUMN last_seen INTEGER DEFAULT 0;
