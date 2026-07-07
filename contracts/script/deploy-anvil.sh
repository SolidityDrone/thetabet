#!/usr/bin/env bash
# Deploy ThetaSingleton on a Polygon-forked Anvil and write ponder/deployments/anvil.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC_URL="${ANVIL_RPC_URL:-http://127.0.0.1:8545}"
EXPECTED_CHAIN_HEX="0x89" # Polygon mainnet = 137

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
  echo "Restart Anvil with: ./script/start-anvil-fork.sh"
  exit 1
fi

unset PRIVATE_KEY

ANVIL_DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

forge script script/DeployAnvil.s.sol:DeployAnvil \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --unlocked \
  --sender "$ANVIL_DEPLOYER" \
  -vvv

echo ""
echo "Syncing deployment into app constants ..."
node "$(cd "$(dirname "$0")/../.." && pwd)/tools/scripts/sync-deployment.mjs" anvil

echo ""
echo "Indexer: PONDER_NETWORK=anvil pnpm ponder:dev"
