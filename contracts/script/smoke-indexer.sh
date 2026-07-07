#!/usr/bin/env bash
# Broadcast vault + deposit + mocked winning bet for Ponder indexer verification.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC_URL="${ANVIL_RPC_URL:-http://127.0.0.1:8545}"

cd "$ROOT"

if ! grep -q '"useMocks": true' ../ponder/deployments/anvil.json 2>/dev/null; then
  echo "Mock deployment required. Run: ./script/deploy-anvil-mocks.sh"
  exit 1
fi

unset PRIVATE_KEY

forge script script/SmokeIndexer.s.sol:SmokeIndexer \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --unlocked \
  -vvv

echo ""
echo "Query Ponder GraphQL: http://localhost:42069/graphql"
