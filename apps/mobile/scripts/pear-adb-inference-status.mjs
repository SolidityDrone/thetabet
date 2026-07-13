#!/usr/bin/env node
/** Quick USB inference bridge diagnostics. */
import { execSync } from 'node:child_process'

const PORT = 39391

function run (cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim()
  } catch (e) {
    return (e.stdout?.toString() || e.stderr?.toString() || String(e)).trim()
  }
}

console.log('=== adb devices ===')
console.log(run('adb devices') || '(none)')

console.log('\n=== adb forward (PC → phone provider) ===')
console.log(run('adb forward --list') || '(none)')

console.log('\n=== adb reverse (phone → PC stub) ===')
console.log(run('adb reverse --list') || '(none)')

console.log(`\n=== phone listening on :${PORT}? ===`)
const phoneListen = run(
  `adb shell "ss -ltn 2>/dev/null | grep ':${PORT}' || netstat -tln 2>/dev/null | grep '${PORT}'"`,
)
console.log(phoneListen || '(not listening — good for stub / reverse mode)')

console.log(`\n=== host listening on :${PORT}? ===`)
const hostListen = run(`ss -ltn 2>/dev/null | grep ':${PORT}' || true`)
console.log(hostListen || '(not listening — run npm run pear:inference:stub for stub mode)')

if (phoneListen) {
  console.log('\n→ Phone holds :39391. Turn OFF Offer peer inference, reload app, then pear:adb:inference:stub.')
} else if (!hostListen.includes(String(PORT))) {
  console.log('\n→ For stub browse: npm run pear:inference:stub then npm run pear:adb:inference:stub.')
} else if (!run('adb reverse --list').includes(String(PORT))) {
  console.log('\n→ Stub is up but reverse missing. Run: npm run pear:adb:inference:stub')
} else {
  console.log('\n→ Stub reverse path looks ready. Browse peers on phone.')
}
