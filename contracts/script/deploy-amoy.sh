#!/usr/bin/env bash
# Deploy ThetaSingleton on Polygon mainnet (deprecated alias — use deploy-polygon.sh).
exec "$(dirname "$0")/deploy-polygon.sh" "$@"
