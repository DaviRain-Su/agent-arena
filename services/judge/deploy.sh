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
echo "📤 Uploading to server..."
ssh "$DROPLET_IP" "mkdir -p ~/arena-judge"
scp /tmp/arena-judge.tar.gz "$DROPLET_IP":~/arena-judge/
scp "$JUDGE_DIR/docker-compose.yml" "$DROPLET_IP":~/arena-judge/
scp "$JUDGE_DIR/.env" "$DROPLET_IP":~/arena-judge/

# SSH and setup
echo "🔧 Setting up on server..."
ssh "$DROPLET_IP" << 'REMOTE_SCRIPT'
cd ~/arena-judge
chmod 600 .env

# Load Docker image
docker load < arena-judge.tar.gz
rm arena-judge.tar.gz

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
