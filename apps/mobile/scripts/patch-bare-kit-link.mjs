import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')

const sourceJs = path.join(projectRoot, 'scripts', 'bare-kit-link.js')
const targetJs = path.join(
  projectRoot,
  'node_modules',
  'react-native-bare-kit',
  'android',
  'link.js',
)

if (!fs.existsSync(sourceJs)) {
  console.warn('[patch-bare-kit-link] source missing, skipping')
  process.exit(0)
}

if (!fs.existsSync(path.dirname(targetJs))) {
  console.warn('[patch-bare-kit-link] react-native-bare-kit not installed, skipping')
  process.exit(0)
}

fs.copyFileSync(sourceJs, targetJs)
console.log('[patch-bare-kit-link] Patched react-native-bare-kit/android/link.js')
