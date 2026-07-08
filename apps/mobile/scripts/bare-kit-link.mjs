/**
 * Bare-kit Android linker used by Gradle `:react-native-bare-kit:link`.
 * QVAC's default link.mjs resolves projectRoot to node_modules/ (wrong) and
 * links all ABIs + all installed addons. This version:
 *  - finds apps/mobile by walking up to qvac/addons.manifest.json
 *  - links only manifest addons (LLM + Pear deps)
 *  - links android-arm64 only (QVAC prebuilds are arm64-only)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const link = require('bare-link')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir)
  const root = path.parse(dir).root
  while (true) {
    if (fs.existsSync(path.join(dir, 'qvac', 'addons.manifest.json'))) return dir
    if (fs.existsSync(path.join(dir, 'app.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir || dir === root) break
    dir = parent
  }
  return process.cwd()
}

const projectRoot = findProjectRoot(process.cwd())
const addonsDir = path.join(__dirname, 'src', 'main', 'addons')

if (fs.existsSync(addonsDir)) {
  fs.rmSync(addonsDir, { recursive: true, force: true })
}

const manifestPath = path.join(projectRoot, 'qvac', 'addons.manifest.json')
let pkg = null

if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const addons = Array.isArray(manifest.addons) ? manifest.addons : []
    if (addons.length > 0) {
      console.log(`[ThetaBet] Linking ${addons.length} addons from manifest (arm64 only)`)
      pkg = {
        name: 'thetabet-bare-linker',
        version: '0.0.0',
        dependencies: Object.fromEntries(addons.map((name) => [name, '*'])),
      }
    }
  } catch (err) {
    console.warn('[ThetaBet] Failed to parse addons manifest:', err.message)
  }
} else {
  console.warn('[ThetaBet] No qvac/addons.manifest.json — linking all addons (arm64 only)')
}

await link(
  projectRoot,
  {
    target: ['android-arm64'],
    needs: ['libbare-kit.so'],
    out: addonsDir,
  },
  pkg,
)
console.log('[ThetaBet] Bare addons linked to', addonsDir)
