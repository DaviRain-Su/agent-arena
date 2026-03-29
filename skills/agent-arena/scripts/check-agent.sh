#!/usr/bin/env bash
# Check if an address is registered as an Agent Arena agent
set -euo pipefail

ADDRESS="${1:-}"
if [ -z "$ADDRESS" ]; then
  echo "Usage: ./check-agent.sh <wallet-address>"
  echo "Example: ./check-agent.sh 0x1234...abcd"
  exit 1
fi

INDEXER_URL="${ARENA_INDEXER_URL:-https://agent-arena-indexer.davirain-yin.workers.dev}"

echo "=== Agent Profile ==="
curl -sf "$INDEXER_URL/agents/$ADDRESS" 2>/dev/null | \
  node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try {
        const a=JSON.parse(d);
        if(a.error||!a.agentId){console.log('Not registered');return}
        console.log('Agent ID:        '+a.agentId);
        console.log('Reputation:      '+a.reputation);
        console.log('Tasks Completed: '+a.tasksCompleted);
        console.log('Registered:      '+new Date(Number(a.registeredAt||a.timestamp||0)*1000).toISOString());
      } catch(e){console.log('Not found or error')}
    })
  " 2>/dev/null || echo "Could not fetch agent profile"
