#!/usr/bin/env bash
# Deploy ThetaSingleton on Polygon mainnet with Foundry keystore, then sync app + ponder constants.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
RPC_URL="${POLYGON_RPC_URL:-https://polygon-bor-rpc.publicnode.com}"
FOUNDRY_ACCOUNT="${FOUNDRY_ACCOUNT:-kondor}"
EXPECTED_DEPLOYER="0xDD7D64BFd13EF3b733374Fc8DE9B9C651487a15D"

cd "$ROOT"

if ! command -v forge >/dev/null 2>&1; then
  echo "forge not found"
  exit 1
fi

if [ ! -f "$HOME/.foundry/keystores/${FOUNDRY_ACCOUNT}" ]; then
  echo "Keystore not found: ~/.foundry/keystores/${FOUNDRY_ACCOUNT}"
  exit 1
fi

ACTUAL_DEPLOYER="$(cast wallet address --account "$FOUNDRY_ACCOUNT" 2>/dev/null || true)"
if [ -n "$ACTUAL_DEPLOYER" ] && [ "$(echo "$ACTUAL_DEPLOYER" | tr '[:upper:]' '[:lower:]')" != "$(echo "$EXPECTED_DEPLOYER" | tr '[:upper:]' '[:lower:]')" ]; then
  echo "Warning: keystore ${FOUNDRY_ACCOUNT} is ${ACTUAL_DEPLOYER}, expected ${EXPECTED_DEPLOYER}"
fi

echo "Deploying ThetaSingleton on Polygon mainnet as ${FOUNDRY_ACCOUNT} (${EXPECTED_DEPLOYER}) ..."
echo "RPC: ${RPC_URL}"
if [ -z "${FOUNDRY_PASSWORD:-}" ]; then
  echo "Tip: set FOUNDRY_PASSWORD in the environment to skip the keystore password prompt."
fi

unset PRIVATE_KEY

FORGE_ARGS=(
  script script/DeployPolygon.s.sol:DeployPolygon
  --rpc-url "$RPC_URL"
  --account "$FOUNDRY_ACCOUNT"
  --broadcast
  --slow
  -vvv
)

if [ -n "${FOUNDRY_PASSWORD:-}" ]; then
  FORGE_ARGS+=(--password "$FOUNDRY_PASSWORD")
fi

BALANCE_WEI=$(cast balance "$EXPECTED_DEPLOYER" --rpc-url "$RPC_URL")
MIN_WEI=5000000000000000000 # ~5 POL buffer for singleton deploy on mainnet
if [ "$BALANCE_WEI" -lt "$MIN_WEI" ]; then
  echo "Deployer balance too low: $(cast from-wei "$BALANCE_WEI") POL (need ~5 POL on mainnet)"
  exit 1
fi

forge "${FORGE_ARGS[@]}"

echo ""
echo "Syncing deployment into mobile app constants + ponder/deployments/polygon.json ..."
node "$REPO_ROOT/tools/scripts/sync-deployment.mjs" polygon

if ! grep -q '"thetaSingleton": "0x[^0]' "$REPO_ROOT/ponder/deployments/polygon.json" 2>/dev/null; then
  echo "Warning: polygon.json may not have a deployed singleton address — check broadcast output."
  exit 1
fi

echo ""
echo "Done."
echo "  App:    apps/mobile/src/config/contracts.generated.ts"
echo "  Ponder: ponder/deployments/polygon.json (used by ponder.config.ts)"
echo "  Start:  pnpm dev:stack  or  pnpm dev:stack:tunnel"
