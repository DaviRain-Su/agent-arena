#!/bin/bash
# Deploy Judge Service to DigitalOcean VPS
# Usage: ./deploy.sh user@your-droplet-ip
#
# Run from repo root or services/judge/

set -e

DROPLET_IP=$1

if [ -z "$DROPLET_IP" ]; then
    echo "Usage: ./deploy.sh user@your-droplet-ip"
    exit 1
fi

# Find repo root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
JUDGE_DIR="$SCRIPT_DIR"

echo "🚀 Deploying Judge Service to $DROPLET_IP..."
echo "   Repo root: $REPO_ROOT"

# Build sandbox first
echo "📦 Building sandbox..."
cd "$REPO_ROOT/sandbox" && npm run build

# Build judge
echo "📦 Building judge..."
cd "$JUDGE_DIR" && npm run build

# Build Docker image from repo root
echo "🐳 Building Docker image..."
cd "$REPO_ROOT"
docker build -t arena-judge:latest -f services/judge/Dockerfile .
docker save arena-judge:latest | gzip > /tmp/arena-judge.tar.gz

# Ensure remote directory exists
echo "📤 Uploading to server (image + compose only, NO .env)..."
ssh "$DROPLET_IP" "mkdir -p ~/arena-judge"
scp /tmp/arena-judge.tar.gz "$DROPLET_IP":~/arena-judge/
scp "$JUDGE_DIR/docker-compose.yml" "$DROPLET_IP":~/arena-judge/

# Check if .env exists on remote
echo "🔧 Setting up on server..."
ssh "$DROPLET_IP" << 'REMOTE_SCRIPT'
cd ~/arena-judge

# Load Docker image
docker load < arena-judge.tar.gz
rm arena-judge.tar.gz

# Check .env exists
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  No .env file found on server!"
    echo "   Create it manually with:"
    echo ""
    echo "   ssh $(hostname) 'cat > ~/arena-judge/.env << EOF"
    echo "   PRIVATE_KEY=0xYOUR_JUDGE_PRIVATE_KEY"
    echo "   CONTRACT_ADDRESS=0x964441A7f7B7E74291C05e66cb98C462c4599381"
    echo "   RPC_URL=https://rpc.xlayer.tech"
    echo "   INDEXER_URL=https://agent-arena-indexer.davirain-yin.workers.dev"
    echo "   POLL_INTERVAL_MS=30000"
    echo "   EOF'"
    echo ""
    echo "   Then run: cd ~/arena-judge && docker compose up -d"
    exit 0
fi

chmod 600 .env

# Start service
docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
docker compose up -d 2>/dev/null || docker-compose up -d

# Show status
sleep 3
docker compose ps 2>/dev/null || docker-compose ps
echo ""
echo "=== Recent logs ==="
docker compose logs --tail 20 2>/dev/null || docker-compose logs --tail 20
REMOTE_SCRIPT

# Cleanup local
rm -f /tmp/arena-judge.tar.gz

echo ""
echo "✅ Deployed successfully!"
echo ""
echo "Monitor: ssh $DROPLET_IP 'cd ~/arena-judge && docker compose logs -f'"
echo "Restart: ssh $DROPLET_IP 'cd ~/arena-judge && docker compose restart'"
