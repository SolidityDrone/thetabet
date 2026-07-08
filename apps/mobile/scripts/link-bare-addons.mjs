import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import fs from 'node:fs'

// bare-link is used by react-native-bare-kit, but we keep our own wrapper so we can
// control which Android ABIs we link. Some deps (like QVAC) ship only 64-bit builds.
const require = createRequire(import.meta.url)
const link = require('react-native-bare-kit/node_modules/bare-link')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.join(__dirname, '..')
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

