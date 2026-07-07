#!/usr/bin/env bash
# Deploy ThetaSingleton + mock Azuro on a Polygon-forked Anvil (indexer dev).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC_URL="${ANVIL_RPC_URL:-http://127.0.0.1:8545}"
EXPECTED_CHAIN_HEX="0x89"

cd "$ROOT"

if ! curl -sf "$RPC_URL" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
  echo "Anvil is not running at $RPC_URL"
  echo "Start a Polygon fork first: ./script/start-anvil-fork.sh"
  exit 1
fi

CHAIN_ID=$(curl -sf "$RPC_URL" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')

if [ "$CHAIN_ID" != "$EXPECTED_CHAIN_HEX" ]; then
  echo "Expected Polygon fork chainId 137 (${EXPECTED_CHAIN_HEX}), got ${CHAIN_ID}"
  exit 1
fi

unset PRIVATE_KEY

forge script script/DeployAnvilMocks.s.sol:DeployAnvilMocks \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --unlocked \
  --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  -vvv

echo ""
echo "Run smoke flow: ./script/smoke-indexer.sh"
echo "Then indexer:  cd ../ponder && pnpm dev"
