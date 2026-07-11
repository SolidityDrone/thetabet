#!/usr/bin/env node
/**
 * Pear Chat Console Demo — interactive P2P peer for Pear Chat.
 *
 * Connects to a Pear Chat channel via Hyperswarm and opens the exact
 * hypercore, so messages typed in the terminal appear on the mobile app
 * and vice‑versa.
 *
 * Usage:
 *   bare scripts/pear-chat-demo.mjs <topicKey> <coreKey>
 *
 * Get topicKey + coreKey from the mobile app's channel toolbar:
 *   1. Tap "Copy topic"   → paste as <topicKey>
 *   2. Tap "Copy core key" → paste as <coreKey>
 *
 * Example:
 *   bare scripts/pear-chat-demo.mjs \
 *     a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2 \
 *     '{"publicKey":"0123...","secretKey":"4567..."}'
 */
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'
import process from 'bare-process'

const topicKey = (process.argv[2] || '').trim().toLowerCase()
const coreKeyRaw = (process.argv[3] || '').trim()

if (!topicKey || !coreKeyRaw) {
  console.error('')
  console.error('  Pear Chat Console Demo')
  console.error('')
  console.error('  bare scripts/pear-chat-demo.mjs <topicKey> <coreKey>')
  console.error('')
  console.error('  <topicKey>  64 hex chars  — tap "Copy topic" in Pear Chat')
  console.error('  <coreKey>   JSON blob      — tap "Copy core key" in Pear Chat')
  console.error('')
  process.exit(1)
}

if (!/^[0-9a-f]{64}$/.test(topicKey)) {
  console.error('Error: topicKey must be a 64-char hex string')
  console.error('Got length', topicKey.length, ':', topicKey)
  process.exit(1)
}

// Parse core key pair JSON
let corePair
try {
  corePair = JSON.parse(coreKeyRaw)
} catch {
  console.error('Error: coreKey must be valid JSON: {"publicKey":"...","secretKey":"..."}')
  process.exit(1)
}
if (!corePair.publicKey || !corePair.secretKey) {
  console.error('Error: coreKey must have publicKey and secretKey fields')
  process.exit(1)
}

const channelId = topicKey.slice(0, 16)

// Generate a temp identity for this session
const keyPair = crypto.keyPair()
const pubkeyHex = b4a.toString(keyPair.publicKey, 'hex')
const handle = 'console:' + pubkeyHex.slice(0, 8)

console.log('')
console.log('  Pear Chat Console Demo')
console.log('  ─────────────────────')
console.log('  Identity  ' + handle)
console.log('  Channel   ' + channelId)
console.log('')

// Strip 0x prefix if present
const pubKeyHex = corePair.publicKey.replace(/^0x/, '')
const secKeyHex = corePair.secretKey.replace(/^0x/, '')

// ── Corestore ────────────────────────────────────────────────────────
const store = new Corestore('./.pear-chat-demo-data')
await store.ready()

// Open the exact core using the SAME key pair as the mobile app
const core = store.get({
  keyPair: {
    publicKey: b4a.from(pubKeyHex, 'hex'),
    secretKey: b4a.from(secKeyHex, 'hex'),
  },
})
await core.ready()

console.log('  Core length ' + core.length + ' messages')

// Print existing history
for (let i = 0; i < core.length; i++) {
  try {
    const msg = JSON.parse(b4a.toString(core.get(i)))
    if (!msg.text || msg.text.startsWith('__KEY_SHARE__:')) continue
    const prefix = msg.authorPubkey === pubkeyHex ? 'mine' : 'them'
    console.log('  [' + prefix + '] ' + msg.author + ': ' + msg.text)
  } catch (_) {}
}

// ── Hyperswarm ───────────────────────────────────────────────────────
const swarm = new Hyperswarm()
swarm.on('connection', (socket) => {
  store.replicate(socket, { live: true })
})

const discovery = swarm.join(b4a.from(topicKey, 'hex'), {
  server: true,
  client: true,
})

console.log('')
console.log('  Joining P2P network…')
try {
  await discovery.flushed()
} catch (e) {
  console.log('  (discovery timed out, continuing anyway)')
}
console.log('  Connected! Type messages below, /quit to exit.')
console.log('')

// ── Listen for new messages ──────────────────────────────────────────
core.on('append', () => {
  const raw = core.get(core.length - 1)
  try {
    const msg = JSON.parse(b4a.toString(raw))
    if (!msg.text || msg.text.startsWith('__KEY_SHARE__:')) return
    if (msg.authorPubkey === pubkeyHex) return
    const line = msg.author + ': ' + msg.text
    if (buf.length > 0) {
      console.log('                     \r' + line)
    } else {
      console.log(line)
      process.stdout.write('> ')
    }
  } catch (_) {}
})

// ── Stdin line reader ────────────────────────────────────────────────
let buf = ''
const stdin = process.stdin

stdin.on('data', (chunk) => {
  buf += chunk.toString()
  const lines = buf.split('\n')
  buf = lines.pop()

  for (const line of lines) {
    const text = line.trim()
    if (!text) {
      process.stdout.write('> ')
      continue
    }

    if (text === '/quit' || text === '/exit') {
      console.log('Goodbye!')
      cleanup()
      process.exit(0)
    }

    const message = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2, 8),
      channelId,
      author: handle,
      authorPubkey: pubkeyHex,
      text,
      timestamp: Date.now(),
    }

    core.append(b4a.from(JSON.stringify(message))).catch((err) => {
      console.log('Send error: ' + err.message)
    })
    process.stdout.write('> ')
  }
})

stdin.on('end', () => {
  console.log('')
  cleanup()
  process.exit(0)
})

function cleanup() {
  try { swarm.destroy() } catch (_) {}
  try { store.close() } catch (_) {}
}

process.on('SIGINT', () => {
  console.log('')
  cleanup()
  process.exit(0)
})

// Initial prompt
process.stdout.write('> ')
