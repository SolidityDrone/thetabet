/**
 * Bare-kit Android linker invoked by Gradle `:react-native-bare-kit:link` via `node link`.
 * Gradle resolves `link.js` (not link.mjs). Must stay CommonJS.
 */
const path = require('path')
const fs = require('fs')
const link = require('bare-link')

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
const { resolveAddonDependencies } = require(path.join(projectRoot, 'scripts', 'bare-addon-deps.cjs'))
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
        dependencies: resolveAddonDependencies(projectRoot, addons),
      }
    }
  } catch (err) {
    console.warn('[ThetaBet] Failed to parse addons manifest:', err.message)
  }
} else {
  console.warn('[ThetaBet] No qvac/addons.manifest.json — linking all addons (arm64 only)')
}

link(
  projectRoot,
  {
    target: ['android-arm64'],
    needs: ['libbare-kit.so'],
    out: addonsDir,
  },
  pkg,
)
  .then(() => {
    console.log('[ThetaBet] Bare addons linked to', addonsDir)
  })
  .catch((err) => {
    console.error('[ThetaBet] Bare link failed:', err)
    process.exit(1)
  })
