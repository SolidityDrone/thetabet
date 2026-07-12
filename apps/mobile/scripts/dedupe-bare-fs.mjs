#!/usr/bin/env node
/**
 * Nested bare-fs copies (often 4.7.x under @qvac/sdk, device-file, etc.) get
 * baked into pear/qvac bundles as linked:libbare-fs.4.7.x.so. The APK only
 * ships libbare-fs.4.4.11.so (WDK pin). Remove every nested copy so bare-pack
 * resolves to the top-level 4.4.11 install.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const topLevelBareFs = path.join(projectRoot, 'node_modules', 'bare-fs')
const targetVersion = fs.existsSync(path.join(topLevelBareFs, 'package.json'))
  ? JSON.parse(fs.readFileSync(path.join(topLevelBareFs, 'package.json'), 'utf8')).version
  : '4.4.11'

let removed = 0

function walkNm(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.bin') continue
    walkNm(path.join(dir, entry.name))
  }
  const nestedBareFs = path.join(dir, 'bare-fs')
  const pkg = path.join(nestedBareFs, 'package.json')
  if (
    nestedBareFs !== topLevelBareFs &&
    fs.existsSync(pkg)
  ) {
    const version = JSON.parse(fs.readFileSync(pkg, 'utf8')).version
    if (version !== targetVersion) {
      fs.rmSync(nestedBareFs, { recursive: true, force: true })
      removed++
      console.log(`[dedupe-bare-fs] removed ${nestedBareFs} (${version} != ${targetVersion})`)
    }
  }
}

walkNm(path.join(projectRoot, 'node_modules'))

if (removed === 0) {
  console.log(`[dedupe-bare-fs] OK — only bare-fs@${targetVersion} remains at top level`)
} else {
  console.log(`[dedupe-bare-fs] removed ${removed} nested bare-fs cop${removed === 1 ? 'y' : 'ies'}`)
}
