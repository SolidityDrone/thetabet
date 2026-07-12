const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// WDK worklets are bundled against these pinned npm aliases. Linking newer
// bare-crypto/bare-buffer/etc from QVAC deps breaks startup (ADDON_NOT_FOUND).
const WDK_ALIASES = {
  'bare-buffer': 'wdk-linked-bare-buffer',
  'bare-crypto': 'wdk-linked-bare-crypto',
  'bare-fs': 'wdk-linked-bare-fs',
  'bare-hrtime': 'wdk-linked-bare-hrtime',
  'bare-os': ['wdk-linked-bare-os-361', 'wdk-linked-bare-os-362'],
  'bare-pipe': 'wdk-linked-bare-pipe',
  'bare-signals': 'wdk-linked-bare-signals',
  'bare-tcp': 'wdk-linked-bare-tcp',
  'bare-tls': 'wdk-linked-bare-tls',
  'bare-tty': 'wdk-linked-bare-tty',
  'bare-type': 'wdk-linked-bare-type',
  'bare-url': 'wdk-linked-bare-url',
}

const QVAC_ALIASES = {
  'bare-crypto': 'qvac-linked-bare-crypto',
  'bare-signals': 'qvac-linked-bare-signals',
  'bare-tls': 'qvac-linked-bare-tls',
}

function resolveAddonDependencies(projectRoot, addonNames) {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  const deps = {}

  const requiredNames = new Set([...addonNames, ...Object.keys(WDK_ALIASES)])
  for (const name of requiredNames) {
    const aliases = [WDK_ALIASES[name]].flat().filter(Boolean)
    let addedWdkAlias = false
    for (const alias of aliases) {
      if (!pkg.dependencies?.[alias]) continue
      deps[alias] = pkg.dependencies[alias]
      addedWdkAlias = true
    }
    if (addedWdkAlias) {
      const qvacAlias = QVAC_ALIASES[name]
      if (qvacAlias && pkg.dependencies?.[qvacAlias]) {
        deps[qvacAlias] = pkg.dependencies[qvacAlias]
      }
      continue
    }
    const qvacAlias = QVAC_ALIASES[name]
    if (qvacAlias && pkg.dependencies?.[qvacAlias]) {
      deps[qvacAlias] = pkg.dependencies[qvacAlias]
      continue
    }
    deps[name] = '*'
  }

  return deps
}

/** Relink @qvac/* plugins without libbare-kit.so, without touching bare/WDK addons. */
async function relinkQvacPlugins(projectRoot, outDir, link, qvacPackageNames) {
  if (!qvacPackageNames.length) return

  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'qvac-plugin-link-'))
  try {
    await link(
      projectRoot,
      {
        target: ['android-arm64'],
        out: tmpOut,
      },
      {
        name: 'qvac-native-plugin-linker',
        version: '0.0.0',
        dependencies: Object.fromEntries(qvacPackageNames.map((name) => [name, '*'])),
      },
    )

    const srcDir = path.join(tmpOut, 'arm64-v8a')
    const dstDir = path.join(outDir, 'arm64-v8a')
    if (!fs.existsSync(srcDir) || !fs.existsSync(dstDir)) return

    for (const file of fs.readdirSync(srcDir)) {
      if (file.startsWith('libqvac')) {
        fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file))
      }
    }
  } finally {
    fs.rmSync(tmpOut, { recursive: true, force: true })
  }
}

module.exports = { WDK_ALIASES, QVAC_ALIASES, resolveAddonDependencies, relinkQvacPlugins }
