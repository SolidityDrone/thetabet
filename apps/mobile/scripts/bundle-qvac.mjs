#!/usr/bin/env node
import { bundleSdk, verifyBundle, hasErrors, formatVerifyBundleResult } from '@qvac/sdk/commands'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const hosts = ['android-arm64']
const qvacDir = path.join(projectRoot, 'qvac')

const generatedBundle = path.join(qvacDir, 'worker.bundle.js')
const fullBundle = path.join(qvacDir, 'worker.full.bundle.js')
const fullConfigPath = path.join(projectRoot, 'qvac.config.full.json')

// Resolve SDK path (handles pnpm hoisting)
const require_ = createRequire(import.meta.url)
const sdkPkgPath = require_.resolve('@qvac/sdk/package', { paths: [projectRoot] })
const sdkPath = path.dirname(sdkPkgPath)
const sdkBundle = path.join(sdkPath, 'dist', 'worker.mobile.bundle.js')
const sdkName = JSON.parse(fs.readFileSync(sdkPkgPath, 'utf8')).name || '@qvac/sdk'

// Dynamically import internal SDK modules (file:// URL bypasses exports map)
const { runBarePack } = await import(
  pathToFileURL(path.join(sdkPath, 'dist/commands/bundle/bare-pack.js')).href
)
const { generateWorkerEntry } = await import(
  pathToFileURL(path.join(sdkPath, 'dist/commands/bundle/entry-gen.js')).href
)
const { generateAddonsManifest } = await import(
  pathToFileURL(path.join(sdkPath, 'dist/commands/bundle/manifest.js')).href
)
const { createSdkImportResolver } = await import(
  pathToFileURL(path.join(sdkPath, 'dist/commands/bundle/resolve-sdk-import.js')).href
)
const { getClientLogger } = await import(
  pathToFileURL(path.join(sdkPath, 'dist/logging/index.js')).href
)

const logger = getClientLogger()
const importsMapPath = path.join(sdkPath, 'bare-imports.json')
const resolveSdkImport = createSdkImportResolver(sdkPath, sdkName)
const configPath = path.join(projectRoot, 'qvac.config.json')

// ---- Step 1: No-plugins bundle (reference + download-safe manifest baseline) ----
console.log('Bundling QVAC worker (no plugins — reference)…')
const { execSync } = await import('node:child_process')
execSync('node scripts/dedupe-bare-fs.mjs', { cwd: projectRoot, stdio: 'inherit' })

const noPluginsEntryPath = path.join(qvacDir, 'worker.no-plugins.entry.mjs')
const noPluginsEntry = generateWorkerEntry([], sdkName, resolveSdkImport)
fs.mkdirSync(qvacDir, { recursive: true })
fs.writeFileSync(noPluginsEntryPath, noPluginsEntry, 'utf8')

await runBarePack({
  entryPath: noPluginsEntryPath,
  outputPath: generatedBundle,
  hosts,
  importsMapPath,
  deferModules: [],
  quiet: false,
  logger,
})

const noPluginsContent = fs.readFileSync(generatedBundle)

const verify = await verifyBundle({ projectRoot, addonsSource: generatedBundle, hosts, configPath })
if (hasErrors(verify)) {
  console.error(formatVerifyBundleResult(verify))
  process.exit(1)
}

console.log(`No-plugins bundle ready (${(noPluginsContent.length / 1024).toFixed(0)} KB)`)

// ---- Step 2: Full eager bundle (LLM + translation — matches 65cee50 working setup) ----
fs.writeFileSync(
  fullConfigPath,
  JSON.stringify(
    {
      plugins: [
        '@qvac/sdk/llamacpp-completion/plugin',
        '@qvac/sdk/nmtcpp-translation/plugin',
      ],
    },
    null,
    2,
  ),
  'utf8',
)

console.log('\nBundling QVAC worker (eager LLM + translation plugins — for inference)…')
await bundleSdk({ projectRoot, hosts, quiet: false, configPath: fullConfigPath })

fs.renameSync(generatedBundle, fullBundle)

const verifyFull = await verifyBundle({
  projectRoot,
  addonsSource: fullBundle,
  hosts,
  configPath: fullConfigPath,
})
if (hasErrors(verifyFull)) {
  console.error('Full bundle verification failed:', formatVerifyBundleResult(verifyFull))
  process.exit(1)
}

await generateAddonsManifest({ bundlePath: fullBundle, outputDir: qvacDir, projectRoot, logger })
const fullManifest = JSON.parse(fs.readFileSync(path.join(qvacDir, 'addons.manifest.json'), 'utf8'))
fs.unlinkSync(fullConfigPath)

// ---- Step 3: Activate EAGER full worker in SDK dist (was manual cp in 65cee50) ----
fs.writeFileSync(generatedBundle, noPluginsContent)
fs.copyFileSync(fullBundle, sdkBundle)
console.log('Activated EAGER full worker in SDK dist; qvac/worker.bundle.js kept as no-plugins reference')

// ---- Step 4: Full manifest drives native linking in APK ----
fs.writeFileSync(path.join(qvacDir, 'addons.manifest.json'), JSON.stringify(fullManifest, null, 2), 'utf8')
console.log('Applied full addons manifest — LLM + translation native libraries linked in APK')

// ---- Step 5: Patch Expo RPC client (detect stale Android worklet after rebundle) ----
execSync('node scripts/patch-qvac-expo-rpc.mjs', { cwd: projectRoot, stdio: 'inherit' })

console.log(
  '\nDone! Bundles:\n  - qvac/worker.bundle.js        (%d KB, no plugins — reference)\n  - qvac/worker.full.bundle.js    (%d KB, eager plugins — ACTIVE in SDK)',
  Math.round(fs.statSync(generatedBundle).size / 1024),
  Math.round(fs.statSync(fullBundle).size / 1024),
)
console.log('\nEager full worker active — force-close app, reopen Metro, then try inference')
