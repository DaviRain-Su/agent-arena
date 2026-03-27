#!/usr/bin/env bash
# scripts/setup.sh — One-time setup for Cloudflare D1 indexer
# Run this once before first deploy

set -e

echo "🚀 Agent Arena CF Indexer Setup"
echo "================================"

# 1. Check wrangler is logged in
echo ""
echo "Step 1: Checking Cloudflare auth..."
wrangler whoami || (echo "❌ Not logged in. Run: wrangler login" && exit 1)

# 2. Create D1 database
echo ""
echo "Step 2: Creating D1 database 'arena-db'..."
wrangler d1 create arena-db 2>&1 | tee /tmp/d1-create.txt

# Extract database_id from output
DB_ID=$(grep -o '"database_id": "[^"]*"' /tmp/d1-create.txt | head -1 | cut -d'"' -f4 || true)
if [ -z "$DB_ID" ]; then
  echo "⚠️  Could not auto-extract database_id. Check wrangler.toml manually."
else
  echo ""
  echo "✅ D1 database created: $DB_ID"
  # Update wrangler.toml
  sed -i "s/REPLACE_WITH_YOUR_D1_ID/$DB_ID/" wrangler.toml
  echo "✅ Updated wrangler.toml with database_id"
fi

# 3. Run migrations
echo ""
echo "Step 3: Running D1 migrations..."
wrangler d1 migrations apply arena-db

# 4. Set secrets
echo ""
echo "Step 4: Setting secrets..."
echo "Enter your deployed contract address:"
read -r CONTRACT_ADDRESS
echo "$CONTRACT_ADDRESS" | wrangler secret put CONTRACT_ADDRESS
echo "✅ CONTRACT_ADDRESS set"

# 5. Deploy
echo ""
echo "Step 5: Deploying worker..."
wrangler deploy

echo ""
echo "✅ Setup complete!"
echo ""
echo "Your indexer is live at: https://agent-arena-indexer.<your-workers-subdomain>.workers.dev"
echo ""
echo "Test it:"
echo "  curl https://agent-arena-indexer.<your-subdomain>.workers.dev/health"
echo "  curl https://agent-arena-indexer.<your-subdomain>.workers.dev/stats"
