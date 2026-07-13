#!/usr/bin/env node
/**
 * Patch @qvac/sdk expo RPC client:
 * 1. Detect stale QVAC worklets after `npm run bundle:qvac`
 * 2. Use static requires so peer inference does not trigger Metro split-bundle
 *    fetches ("Could not load bundle") when the QVAC worklet starts lazily.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const require_ = createRequire(path.join(projectRoot, 'package.json'))
const sdkEntry = require_.resolve('@qvac/sdk')
const sdkDist = path.dirname(sdkEntry)
const rpcClientPath = path.join(sdkDist, 'client/rpc/expo-rpc-client.js')
const deviceInfoPath = path.join(sdkDist, 'client/rpc/expo-device-info.js')

const BUNDLE_GUARD_MARKER = '/* thetabet: worklet bundle id guard */'
const STATIC_REQUIRES_MARKER = '/* thetabet: static expo requires */'

const bundleGuardHelper = `
${BUNDLE_GUARD_MARKER}
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

function patchRpcClient() {
  let src = fs.readFileSync(rpcClientPath, 'utf8')
  let changed = false

  if (!src.includes(BUNDLE_GUARD_MARKER)) {
    src = src.replace(
      'logger.debug("EXPO RPC Client bundle");',
      `logger.debug("EXPO RPC Client bundle");\n${bundleGuardHelper}`,
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
    const workletStartedOld = `        worklet.start("worker.bundle", mobileBundle, [
            // Normalize arg number across platforms
            "react-native-bare-kit",
            "worker.js",
            JSON.stringify({
                HOME_DIR: Paths.document.uri.replace("file://", ""),
            }),
        ]);
        logger.info("Worklet started");`
    const workletStartedPatched = `        worklet.start("worker.bundle", mobileBundle, [
            // Normalize arg number across platforms
            "react-native-bare-kit",
            "worker.js",
            JSON.stringify({
                HOME_DIR: Paths.document.uri.replace("file://", ""),
            }),
        ]);
        activeWorkletBundleId = readMobileWorkerBundleId();
        logger.info("Worklet started", activeWorkletBundleId ? { bundleId: activeWorkletBundleId.slice(0, 12) } : undefined);`
    if (src.includes(workletStartedOld)) {
      src = src.replace(workletStartedOld, workletStartedPatched)
    }
    changed = true
  }

  if (!src.includes(STATIC_REQUIRES_MARKER)) {
    const dynamicImports = `        const { Paths } = await import("expo-file-system");
        const bareKitModule = await import("react-native-bare-kit");`
    const staticRequires = `        ${STATIC_REQUIRES_MARKER}
        const { Paths } = require("expo-file-system");
        const bareKitModule = require("react-native-bare-kit");`
    if (src.includes(dynamicImports)) {
      src = src.replace(dynamicImports, staticRequires)
      changed = true
    }
  }

  if (changed) {
    fs.writeFileSync(rpcClientPath, src, 'utf8')
    console.log('[patch-qvac-expo-rpc] Patched', rpcClientPath)
  } else {
    console.log('[patch-qvac-expo-rpc] RPC client already patched')
  }
}

function patchDeviceInfo() {
  let src = fs.readFileSync(deviceInfoPath, 'utf8')
  if (src.includes(STATIC_REQUIRES_MARKER)) {
    console.log('[patch-qvac-expo-rpc] Device info already patched')
    return
  }

  src = src.replace(
    '        const expoModulesCore = await import("expo-modules-core");',
    `        ${STATIC_REQUIRES_MARKER}
        const expoModulesCore = require("expo-modules-core");`,
  )
  src = src.replace(
    '            const Device = await import("expo-device");',
    '            const Device = require("expo-device");',
  )
  fs.writeFileSync(deviceInfoPath, src, 'utf8')
  console.log('[patch-qvac-expo-rpc] Patched', deviceInfoPath)
}

patchRpcClient()
patchDeviceInfo()
