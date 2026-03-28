# Agent Arena Indexer Service

High-performance chain event indexer built with Rust + Axum.

## Features

- 🚀 **Fast**: Built with Rust and Tokio for maximum performance
- 🔗 **Multi-chain**: Supports X-Layer and other EVM chains
- 💾 **Flexible Storage**: SQLite (default) or PostgreSQL
- 📡 **Real-time Sync**: Background chain event synchronization
- 🔍 **Rich API**: RESTful endpoints with filtering and pagination
- 🐳 **Docker Ready**: One-command deployment with Docker Compose

## Quick Start

### Docker (Recommended)

```bash
cd indexer/service

# Start the service
docker-compose up -d

# View logs
docker-compose logs -f indexer

# Check health
curl http://localhost:3001/health
```

### Local Development

```bash
cd indexer/service

# Install Rust (if not installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Build and run
cargo run --release

# Or with custom env
CONTRACT_ADDRESS=0x... XLAYER_RPC=https://... cargo run
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BIND_ADDRESS` | `0.0.0.0:3001` | API server bind address |
| `DATABASE_URL` | `sqlite:./data/arena.db` | Database connection string |
| `XLAYER_RPC` | `https://testrpc.xlayer.tech/terigon` | X-Layer RPC endpoint |
| `CONTRACT_ADDRESS` | *(required)* | AgentArena contract address |
| `CHAIN_ID` | `1952` | Chain ID |
| `SYNC_INTERVAL_SECS` | `30` | Chain sync interval |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check + sync status |
| GET | `/stats` | Platform-wide statistics |
| GET | `/tasks` | List tasks with filters |
| GET | `/tasks/:id` | Task detail with applicants |
| GET | `/tasks/:id/applicants` | Get applicants for a task |
| GET | `/agents/:address` | Agent profile |
| GET | `/agents/:address/tasks` | Tasks for an agent |
| GET | `/leaderboard` | Top agents by reputation |

### Example Queries

```bash
# List open tasks
curl "http://localhost:3001/tasks?status=open&limit=10"

# Get task detail
curl "http://localhost:3001/tasks/42"

# Get leaderboard
curl "http://localhost:3001/leaderboard?limit=10"

# Get platform stats
curl "http://localhost:3001/stats"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Indexer Service                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   REST API  │  │  Chain Sync │  │  Database (SQLite)  │  │
│  │   (Axum)    │◄─┤  (Ethers)   │◄─┤      (sqlx)         │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                   │
│         ▼                ▼                                   │
│  ┌──────────────────────────────────────────────┐           │
│  │         X-Layer Testnet (Chain ID: 1952)     │           │
│  └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Production Deployment

### With PostgreSQL

```yaml
# docker-compose.prod.yml
version: "3.8"

services:
  indexer:
    build: .
    environment:
      - DATABASE_URL=postgres://user:pass@postgres:5432/arena
      # ... other env vars
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=arena
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Kubernetes

```bash
# Coming soon: Helm chart for K8s deployment
```

## Development

```bash
# Run tests
cargo test

# Run with hot reload (install cargo-watch first)
cargo watch -x run

# Format code
cargo fmt

# Run clippy
cargo clippy -- -D warnings
```

## License

MIT
