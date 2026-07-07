#!/usr/bin/env bash
# Start Anvil forked from Polygon mainnet. Chain id stays 137 so wallets match production.
set -euo pipefail

POLYGON_RPC_URL="${POLYGON_RPC_URL:-https://polygon-rpc.com}"
POLYGON_CHAIN_ID=137
ANVIL_PORT="${ANVIL_PORT:-8545}"

if curl -sf "http://127.0.0.1:${ANVIL_PORT}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  | grep -q "$(printf '0x%x' "$POLYGON_CHAIN_ID")"; then
  echo "Polygon fork already listening on :${ANVIL_PORT} (chainId ${POLYGON_CHAIN_ID})"
  exit 0
fi

if lsof -i ":${ANVIL_PORT}" >/dev/null 2>&1; then
  echo "Port :${ANVIL_PORT} is in use but chainId is not Polygon (137 / 0x89). Stop that node first."
  exit 1
fi

echo "Starting Anvil fork of Polygon mainnet"
echo "  RPC:      ${POLYGON_RPC_URL}"
echo "  chainId:  ${POLYGON_CHAIN_ID}"
echo "  port:     ${ANVIL_PORT}"

anvil \
  --fork-url "$POLYGON_RPC_URL" \
  --chain-id "$POLYGON_CHAIN_ID" \
  --port "$ANVIL_PORT" \
  --host 0.0.0.0
