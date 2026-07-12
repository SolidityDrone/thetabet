#!/usr/bin/env node
/**
 * Patch @qvac/sdk expo RPC client so Android detects stale QVAC worklets after
 * `npm run bundle:qvac`. Metro reload updates the JS bundle string but the
 * Bare worklet keeps the old addon registry until the app process is killed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const require_ = createRequire(path.join(projectRoot, 'package.json'))
const sdkEntry = require_.resolve('@qvac/sdk')
const rpcClientPath = path.join(path.dirname(sdkEntry), 'client/rpc/expo-rpc-client.js')

const MARKER = '/* thetabet: worklet bundle id guard */'

const helper = `
${MARKER}
function readMobileWorkerBundleId() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mobileBundle = require("@qvac/sdk/worker.mobile.bundle");
        const nl = mobileBundle.indexOf("\\n");
        const jsonStart = mobileBundle.indexOf("{", nl + 1);
        if (jsonStart < 0)
            return null;
        const idMatch = mobileBundle.slice(jsonStart, jsonStart + 240).match(/"id":"([^"]+)"/);
        return idMatch?.[1] ?? null;
    }
    catch {
        return null;
    }
}
let activeWorkletBundleId = null;
function assertWorkletBundleFresh() {
    const bundleId = readMobileWorkerBundleId();
    if (!workletInstance || !bundleId)
        return bundleId;
    if (activeWorkletBundleId && activeWorkletBundleId !== bundleId) {
        throw new RPCConnectionFailedError("QVAC worker bundle changed (" +
            activeWorkletBundleId.slice(0, 8) + " -> " + bundleId.slice(0, 8) + "). " +
            "Force-close ThetaBet completely (swipe it away from recents), then reopen. " +
            "Metro reload alone cannot restart the QVAC worklet on Android.");
    }
    return bundleId;
}
`

let src = fs.readFileSync(rpcClientPath, 'utf8')
if (src.includes(MARKER)) {
  console.log('[patch-qvac-expo-rpc] Already patched')
  process.exit(0)
}

src = src.replace(
  'logger.debug("EXPO RPC Client bundle");',
  `logger.debug("EXPO RPC Client bundle");\n${helper}`,
)

src = src.replace(
  `        if (workletInstance) {
            logger.debug("🔄 Reusing existing worklet");
            rpcInstance = new RPC(workletInstance.IPC, () => { });`,
  `        if (workletInstance) {
            assertWorkletBundleFresh();
            logger.debug("🔄 Reusing existing worklet");
            rpcInstance = new RPC(workletInstance.IPC, () => { });`,
)

src = src.replace(
  `        worklet.start("worker.bundle", mobileBundle, [
            // Normalize arg number across platforms
            "react-native-bare-kit",
            "worker.js",
            JSON.stringify({
                HOME_DIR: Paths.document.uri.replace("file://", ""),
            }),
        ]);
        logger.info("Worklet started");`,
  `        worklet.start("worker.bundle", mobileBundle, [
            // Normalize arg number across platforms
            "react-native-bare-kit",
            "worker.js",
            JSON.stringify({
                HOME_DIR: Paths.document.uri.replace("file://", ""),
            }),
        ]);
        activeWorkletBundleId = readMobileWorkerBundleId();
        logger.info("Worklet started", activeWorkletBundleId ? { bundleId: activeWorkletBundleId.slice(0, 12) } : undefined);`,
)

fs.writeFileSync(rpcClientPath, src, 'utf8')
console.log('[patch-qvac-expo-rpc] Patched', rpcClientPath)
