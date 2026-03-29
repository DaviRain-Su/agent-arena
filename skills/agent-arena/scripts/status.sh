#!/usr/bin/env bash
# Quick status check for Agent Arena
set -euo pipefail

INDEXER_URL="${ARENA_INDEXER_URL:-https://agent-arena-indexer.davirain-yin.workers.dev}"

echo "=== Agent Arena Status ==="
echo ""

# Health check
health=$(curl -sf "$INDEXER_URL/health" 2>/dev/null || echo '{"status":"unreachable"}')
echo "Indexer: $health"

# Stats
stats=$(curl -sf "$INDEXER_URL/stats" 2>/dev/null || echo '{}')
echo "Stats:   $stats"

# Open tasks
echo ""
echo "=== Open Tasks ==="
curl -sf "$INDEXER_URL/tasks?status=open&limit=10" 2>/dev/null | \
  node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try {
        const r=JSON.parse(d);
        const tasks=r.tasks||r||[];
        if(!tasks.length){console.log('No open tasks');return}
        tasks.forEach(t=>console.log('#'+t.id+' | '+t.reward+' OKB | '+((t.description||'').slice(0,60))));
      } catch(e){console.log('No data')}
    })
  " 2>/dev/null || echo "Could not fetch tasks"

echo ""
echo "Frontend: https://agentarena.run"
echo "Contract: 0x964441A7f7B7E74291C05e66cb98C462c4599381"
