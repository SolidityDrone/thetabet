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

// ---- Step 1: No-plugins bundle (for download) ----
// Uses low-level APIs to bypass bundleSdk's "empty plugins = ALL builtins" fallback.
console.log('Bundling QVAC worker (no plugins — for download)…')

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

// Capture no-plugins bundle content in memory for restoration later
const noPluginsContent = fs.readFileSync(generatedBundle)

// Verify
const verify = await verifyBundle({ projectRoot, addonsSource: generatedBundle, hosts, configPath })
if (hasErrors(verify)) {
  console.error(formatVerifyBundleResult(verify))
  process.exit(1)
}

fs.copyFileSync(generatedBundle, sdkBundle)
console.log(`Copied no-plugins bundle (${(noPluginsContent.length / 1024).toFixed(0)} KB) to @qvac/sdk/dist/worker.mobile.bundle.js`)

// Generate no-plugins manifest (for reference only — full manifest overwrites it)
await generateAddonsManifest({ bundlePath: generatedBundle, outputDir: qvacDir, projectRoot, logger })

// ---- Step 2: Full bundle (with LLM plugin, for inference) ----
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
    2
  ),
  'utf8'
)

console.log('\nBundling QVAC worker (with LLM plugin — for inference)…')
await bundleSdk({ projectRoot, hosts, quiet: false, configPath: fullConfigPath })

// Move full bundle aside
fs.renameSync(generatedBundle, fullBundle)

const verifyFull = await verifyBundle({ projectRoot, addonsSource: fullBundle, hosts, configPath: fullConfigPath })
if (hasErrors(verifyFull)) {
  console.error('Full bundle verification failed:', formatVerifyBundleResult(verifyFull))
  process.exit(1)
}

// Read full manifest
const fullManifest = JSON.parse(fs.readFileSync(path.join(qvacDir, 'addons.manifest.json'), 'utf8'))
fs.unlinkSync(fullConfigPath)

// ---- Step 3: Restore the no-plugins bundle as default ----
fs.writeFileSync(generatedBundle, noPluginsContent)
fs.copyFileSync(generatedBundle, sdkBundle)
console.log('Restored no-plugins bundle as default (qvac/worker.bundle.js + SDK dist)')

// ---- Step 4: Apply FULL manifest (native libs for both bundles are linked in APK) ----
fs.writeFileSync(path.join(qvacDir, 'addons.manifest.json'), JSON.stringify(fullManifest, null, 2), 'utf8')
console.log('Applied full addons manifest — LLM + translation native libraries linked in APK')

console.log('\nDone! Bundles:\n  - qvac/worker.bundle.js        (%d KB, no plugins — for download)\n  - qvac/worker.full.bundle.js    (%d KB, with LLM plugin — for inference)',
  Math.round(fs.statSync(generatedBundle).size / 1024),
  Math.round(fs.statSync(fullBundle).size / 1024))
console.log('\nInference: cp qvac/worker.full.bundle.js node_modules/@qvac/sdk/dist/worker.mobile.bundle.js && restart app')
