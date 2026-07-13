#!/usr/bin/env node
/**
 * USB bridge for phone → PC inference stub (adb reverse only).
 *
 * The phone must NOT listen on :39391 (Settings → Offer peer inference OFF).
 */
import { execSync } from 'node:child_process'

const PORT = 39391

function adb (args, { inherit = false } = {}) {
  return execSync(`adb ${args}`, {
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  })
}

function deviceListensOnPort () {
  try {
    const out = adb(
      `shell "ss -ltn 2>/dev/null | grep ':${PORT}' || netstat -tln 2>/dev/null | grep '${PORT}'"`,
    ).trim()
    return out.length > 0
  } catch {
    return false
  }
}

try {
  adb(`forward --remove tcp:${PORT}`, { inherit: false })
} catch (_) {}

try {
  adb(`reverse --remove tcp:${PORT}`, { inherit: false })
} catch (_) {}

if (deviceListensOnPort()) {
  console.error('')
  console.error(`Phone is listening on port ${PORT} — adb reverse cannot bind.`)
  console.error('')
  console.error('This usually means Settings → Offer peer inference is ON.')
  console.error('')
  console.error('Stub mode (phone browses PC @infer-stub):')
  console.error('  1. Phone → Settings → turn OFF "Offer peer inference"')
  console.error('  2. Reload the app (or force-stop) so the port is released')
  console.error('  3. PC → npm run pear:inference:stub   (keep running)')
  console.error('  4. PC → npm run pear:adb:inference:stub')
  console.error('  5. Phone → Match AI → Browse peers → @infer-stub')
  console.error('')
  process.exit(1)
}

try {
  adb(`reverse tcp:${PORT} tcp:${PORT}`, { inherit: true })
} catch {
  console.error('')
  console.error(`adb reverse tcp:${PORT} failed.`)
  console.error('Check: npm run pear:adb:inference:status')
  process.exit(1)
}

console.log(adb('reverse --list').trim() || '(no reverse rules)')
