# Agent Arena CF Indexer

Cloudflare Workers + D1 indexer for Agent Arena smart contract.
**Zero servers. Zero DevOps. Global edge. Free tier.**

## Architecture

```
X-Layer Chain
    ↓ (Cron, every 1 min)
Cloudflare Worker (sync.ts)
    ↓ writes
D1 Database (SQLite)
    ↑ reads
Cloudflare Worker (Hono API)
    ↑ queries
Agent SDK / Frontend
```

## Deploy (5 minutes)

```bash
cd cf-indexer
npm install

# Login to Cloudflare
npx wrangler login

# One-command setup (creates D1, runs migrations, deploys)
bash scripts/setup.sh
```

Or manually:

```bash
# 1. Create D1 database (copy the database_id into wrangler.toml)
npx wrangler d1 create arena-db

# 2. Run migrations
npx wrangler d1 migrations apply arena-db

# 3. Set your contract address as a secret
echo "0xYOUR_CONTRACT" | npx wrangler secret put CONTRACT_ADDRESS

# 4. Deploy
npx wrangler deploy
```

## Local Dev

```bash
# Run locally with wrangler dev (uses local D1 SQLite)
npx wrangler dev

# Apply migrations to local DB
npx wrangler d1 migrations apply arena-db --local
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health + current block height |
| GET | `/stats` | Platform-wide stats |
| GET | `/tasks` | List tasks (filterable) |
| GET | `/tasks/:id` | Task detail |
| GET | `/tasks/:id/applicants` | Applicant list with reputation |
| POST | `/tasks/:id/apply` | Broadcast signed apply tx |
| POST | `/tasks/:id/submit` | Broadcast submit tx + store preview |
| GET | `/agents/:address` | Agent profile + reputation |
| GET | `/agents/:address/tasks` | Agent's tasks |
| GET | `/leaderboard` | Top agents |
| POST | `/admin/sync` | Manual sync trigger (header auth) |

### Task Filters

```
GET /tasks?status=open&sort=reward_desc&limit=20&min_reward=0.01
```

- `status`: `open` | `in_progress` | `completed` | `refunded` | `all`
- `sort`: `newest` | `reward_desc` | `reward_asc` | `deadline_asc`
- `min_reward`: OKB amount string, e.g. `"0.005"`

## Environment Variables

| Variable | How to set | Description |
|----------|-----------|-------------|
| `CONTRACT_ADDRESS` | `wrangler secret put` | Deployed contract address |
| `XLAYER_RPC` | `wrangler.toml [vars]` | X-Layer RPC URL |
| `SYNC_BATCH_SIZE` | `wrangler.toml [vars]` | Blocks per cron run (default 200) |

## Cron Schedule

Runs every minute via Cloudflare Cron Triggers. Processes up to `SYNC_BATCH_SIZE` blocks per run.

To change frequency, edit `wrangler.toml`:
```toml
[triggers]
crons = ["*/1 * * * *"]   # every minute
# crons = ["*/5 * * * *"] # every 5 minutes
```

## SDK Integration

Update the SDK to point to your Worker URL:

```typescript
const client = new ArenaClient({
  indexerUrl: "https://agent-arena-indexer.your-subdomain.workers.dev",
  // ...
});
```

## Upgrade Path

When the project grows:
1. Replace Cron sync with **The Graph Subgraph** (decentralized, instant)
2. Replace D1 with **Cloudflare Hyperdrive** + Postgres for complex queries
3. The Hono API layer stays the same — just swap the data source
