import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import fs from 'node:fs'

// bare-link is used by react-native-bare-kit, but we keep our own wrapper so we can
// control which Android ABIs we link. Some deps (like QVAC) ship only 64-bit builds.
const require = createRequire(import.meta.url)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.join(__dirname, '..')

// Some packages (e.g. bare-posix via @qvac/registry-client) are declared as
// addons but ship no Android prebuilds. Patch bare-link to skip them instead
// of aborting the whole link step.
const androidJs = path.join(
  projectRoot,
  'node_modules',
  'react-native-bare-kit',
  'node_modules',
  'bare-link',
  'lib',
  'platform',
  'android.js',
)
if (fs.existsSync(androidJs)) {
  const marker = '/* patched: skip missing prebuilds */'
  let src = fs.readFileSync(androidJs, 'utf8')
  if (!src.includes(marker)) {
    src = src.replace(
      "  for (const [arch, host] of archs) {\n    const dir = path.join(out, arch)",
      `  for (const [arch, host] of archs) {\n    ${marker}\n    if (!require('fs').existsSync(path.join(base, 'prebuilds', host, \`\${name}.bare\`))) {\n      console.warn(\`[bare-link] skipping \${name}@\${version}: no prebuild for \${host}\`)\n      continue\n    }\n    const dir = path.join(out, arch)`,
    )
    if (!src.includes(marker)) {
      throw new Error('failed to patch bare-link android.js (source changed?)')
    }
    fs.writeFileSync(androidJs, src)
  }
}

// Load after patching so the patched android.js is what gets compiled.
const link = require('react-native-bare-kit/node_modules/bare-link')

const out = path.join(
  projectRoot,
  'node_modules',
  'react-native-bare-kit',
  'android',
  'src',
  'main',
  'addons',
)

// Ensure we don't keep stale addons from previous links.
if (fs.existsSync(out)) {
  fs.rmSync(out, { recursive: true, force: true })
}

// If present, use QVAC's addons manifest to avoid linking every installed addon.
// Linking too many native addons increases APK size and can crash the app when
// the worklet boots (dlopen pressure / missing transitive native deps).
const manifestPath = path.join(projectRoot, 'qvac', 'addons.manifest.json')
let pkg = null
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const addons = Array.isArray(manifest.addons) ? manifest.addons : []
    if (addons.length > 0) {
      pkg = {
        name: 'qvac-addon-linker',
        version: '0.0.0',
        dependencies: Object.fromEntries(addons.map((name) => [name, '*'])),
      }
    }
  } catch {
    // fall back to linking everything
    pkg = null
  }
}

await link(
  projectRoot,
  {
    target: ['android-arm64'],
    needs: ['libbare-kit.so'],
    out,
  },
  pkg,
)

