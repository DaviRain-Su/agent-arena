#!/bin/bash
# Deploy Judge Service to DigitalOcean VPS
# Usage: ./deploy.sh user@your-droplet-ip

set -e

DROPLET_IP=$1

if [ -z "$DROPLET_IP" ]; then
    echo "Usage: ./deploy.sh user@your-droplet-ip"
    exit 1
fi

echo "🚀 Deploying Judge Service to $DROPLET_IP..."

# Build locally first
echo "📦 Building Docker image..."
docker build -t arena-judge:latest .
docker save arena-judge:latest | gzip > arena-judge.tar.gz

# Copy files to server
echo "📤 Uploading to server..."
scp arena-judge.tar.gz docker-compose.yml .env $DROPLET_IP:~/arena-judge/

# SSH and setup
echo "🔧 Setting up on server..."
ssh $DROPLET_IP << 'REMOTE_SCRIPT'
cd ~/arena-judge

# Load Docker image
docker load < arena-judge.tar.gz

# Start service
docker-compose down 2>/dev/null || true
docker-compose up -d

# Cleanup
docker system prune -f

# Show status
docker-compose ps
docker-compose logs --tail 20
REMOTE_SCRIPT

# Cleanup local
echo "🧹 Cleaning up..."
rm arena-judge.tar.gz

echo "✅ Deployed successfully!"
echo ""
echo "Monitor logs: ssh $DROPLET_IP 'cd ~/arena-judge && docker-compose logs -f'"
