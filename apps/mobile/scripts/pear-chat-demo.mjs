#!/usr/bin/env node
/**
 * Pear Chat Console Demo — interactive P2P peer for Pear Chat.
 *
 * Modes:
 *   1) Legacy channel (topic + core key from mobile toolbar)
 *      bare scripts/pear-chat-demo.mjs <topicKey> <coreKey>
 *
 *   2) Vault channel (deterministic topic + per-device outbox)
 *      bare scripts/pear-chat-demo.mjs --vault <vaultAddress> --bypass-tag <tag>
 */
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'
import fs from 'bare-fs'
import path from 'bare-path'
import process from 'bare-process'
import { vaultChannelKeys, vaultChannelId, vaultOutboxKeyPair, vaultDevWriterId } from '../pear-end/vault-channel.mjs'
import { attachVaultPeerHandshake } from '../pear-end/vault-peer-handshake.mjs'

const IDENTITY_FILE = 'identity.json'
const DATA_DIR = './.pear-chat-demo-data'

function loadOrCreateIdentity () {
  const identityPath = path.join(DATA_DIR, IDENTITY_FILE)
  if (fs.existsSync(identityPath)) {
    const raw = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    return {
      publicKey: b4a.from(raw.publicKey, 'hex'),
      secretKey: b4a.from(raw.secretKey, 'hex'),
      handle: raw.handle,
    }
  }

  const keyPair = crypto.keyPair()
  const handle = b4a.toString(keyPair.publicKey, 'hex').slice(0, 8)
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(
    identityPath,
    JSON.stringify({
      publicKey: b4a.toString(keyPair.publicKey, 'hex'),
      secretKey: b4a.toString(keyPair.secretKey, 'hex'),
      handle,
    })
  )
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    handle,
  }
}

function parseArgs(argv) {
  const args = [...argv]
  const opts = {
    vault: null,
    bypassTag: null,
    topicKey: null,
    coreKeyRaw: null,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--vault') {
      opts.vault = (args[++i] || '').trim().toLowerCase()
    } else if (arg === '--bypass-tag') {
      opts.bypassTag = (args[++i] || '').trim()
    } else if (!opts.topicKey && /^[0-9a-f]{64}$/i.test(arg)) {
      opts.topicKey = arg.trim().toLowerCase()
    } else if (!opts.coreKeyRaw && arg.startsWith('{')) {
      opts.coreKeyRaw = arg.trim()
    }
  }

  return opts
}

const opts = parseArgs(process.argv.slice(2))

let topicKey
let corePair
let channelId
let vaultAddress = null
let vaultMode = false

if (opts.vault) {
  vaultMode = true
  const keys = vaultChannelKeys(opts.vault)
  topicKey = keys.topicKey
  channelId = vaultChannelId(opts.vault)
  vaultAddress = keys.vaultAddress
} else if (opts.topicKey && opts.coreKeyRaw) {
  topicKey = opts.topicKey
  channelId = topicKey.slice(0, 16)
  try {
    corePair = JSON.parse(opts.coreKeyRaw)
  } catch {
    console.error('Error: coreKey must be valid JSON: {"publicKey":"...","secretKey":"..."}')
    process.exit(1)
  }
} else {
  console.error('')
  console.error('  Pear Chat Console Demo')
  console.error('')
  console.error('  Vault mode (recommended):')
  console.error('    bare scripts/pear-chat-demo.mjs --vault <0xVaultAddress> --bypass-tag <tag>')
  console.error('')
  console.error('  Legacy mode:')
  console.error('    bare scripts/pear-chat-demo.mjs <topicKey> <coreKey>')
  console.error('')
  process.exit(1)
}

if (!vaultMode && (!corePair?.publicKey || !corePair?.secretKey)) {
  console.error('Error: core key pair must have publicKey and secretKey fields')
  process.exit(1)
}

const identity = loadOrCreateIdentity()
const pubkeyHex = b4a.toString(identity.publicKey, 'hex')
const writerId = opts.bypassTag ? vaultDevWriterId(opts.bypassTag) : pubkeyHex
const handle = opts.bypassTag ? 'console:dev' : 'console:' + pubkeyHex.slice(0, 8)

console.log('')
console.log('  Pear Chat Console Demo')
console.log('  ─────────────────────')
console.log('  Identity  ' + handle)
console.log('  Writer    ' + writerId.slice(0, 24) + (writerId.length > 24 ? '…' : ''))
console.log('  Channel   ' + channelId)
console.log('  Topic     ' + topicKey.slice(0, 16) + '…')
if (vaultAddress) console.log('  Vault     ' + vaultAddress)
if (opts.bypassTag) console.log('  Bypass    enabled')
console.log('')

const store = new Corestore(DATA_DIR)
await store.ready()

async function openOutbox (vault, writerPubkeyHex) {
  const pair = vaultOutboxKeyPair(vault, writerPubkeyHex)
  const core = store.get({ keyPair: pair })
  await core.ready()
  return core
}

async function collectVaultFeeds (vault, myWriterId, knownWriters) {
  const feeds = new Map()
  const authors = new Set([myWriterId])
  if (knownWriters) {
    for (const pk of knownWriters) authors.add(pk)
  }
  // Pre-open the phone-side dev writer when we only have bypass (tipster copies tag into app).
  if (opts.bypassTag) {
    try {
      authors.add(vaultDevWriterId(opts.bypassTag))
    } catch (_) {}
  }

  const outbox = await openOutbox(vault, myWriterId)
  feeds.set(b4a.toString(outbox.discoveryKey, 'hex'), outbox)

  try {
    const legacyPair = vaultChannelKeys(vault).coreKeyPair
    const legacy = store.get({ keyPair: legacyPair })
    await legacy.ready()
    if (legacy.length > 0) feeds.set('legacy', legacy)
  } catch (_) {}

  for (const author of authors) {
    const feed = await openOutbox(vault, author)
    const dk = b4a.toString(feed.discoveryKey, 'hex')
    if (!feeds.has(dk)) feeds.set(dk, feed)
    try { await feed.update({ wait: true }) } catch (_) {}
    for (let i = 0; i < feed.length; i++) {
      try {
        const raw = await feed.get(i)
        if (!raw) continue
        const msg = JSON.parse(b4a.toString(raw))
        if (msg.authorPubkey) authors.add(msg.authorPubkey)
      } catch (_) {}
    }
  }

  for (const author of authors) {
    const feed = await openOutbox(vault, author)
    const dk = b4a.toString(feed.discoveryKey, 'hex')
    if (!feeds.has(dk)) feeds.set(dk, feed)
    try { await feed.update({ wait: true }) } catch (_) {}
  }

  return { outbox, feeds }
}

let core
let vaultFeeds = null
let peerHandshake = null
const pendingDirectMessages = []
const directMessageIds = new Set()

async function acceptDirectMessage (message) {
  if (!message || !message.id || !message.text) return
  if (message.authorPubkey === writerId || directMessageIds.has(message.id)) return
  if (String(message.channelId || '').toLowerCase() !== channelId.toLowerCase()) return
  if (!core) {
    pendingDirectMessages.push(message)
    return
  }
  directMessageIds.add(message.id)
  await core.append(b4a.from(JSON.stringify(message)))
}

if (vaultMode) {
  peerHandshake = attachVaultPeerHandshake({
    vaultAddress,
    writerId,
    onRemoteWriter: async (remotePk) => {
      console.log('  [p2p] remote writer ' + remotePk.slice(0, 20) + (remotePk.length > 20 ? '…' : ''))
      if (!vaultFeeds) return
      const feed = await openOutbox(vaultAddress, remotePk)
      const dk = b4a.toString(feed.discoveryKey, 'hex')
      if (!vaultFeeds.has(dk)) {
        vaultFeeds.set(dk, feed)
        onRemoteAppend(feed)
        try { await feed.update({ wait: true }) } catch (_) {}
        await printHistory()
      }
    },
    onMessage: (message) => {
      acceptDirectMessage(message).catch((error) => {
        console.log('  [direct] receive failed: ' + error.message)
      })
    },
    onPeerCount: (count) => {
      console.log('  [p2p] live vault peers ' + (count + 1))
    },
  })
  await peerHandshake.flushed()

  const collected = await collectVaultFeeds(vaultAddress, writerId, peerHandshake.known)
  core = collected.outbox
  vaultFeeds = collected.feeds
  console.log('  Outbox feeds ' + vaultFeeds.size)
  for (const message of pendingDirectMessages.splice(0)) {
    await acceptDirectMessage(message)
  }
} else {
  const pubKeyHex = corePair.publicKey.replace(/^0x/, '')
  const secKeyHex = corePair.secretKey.replace(/^0x/, '')
  core = store.get({
    keyPair: {
      publicKey: b4a.from(pubKeyHex, 'hex'),
      secretKey: b4a.from(secKeyHex, 'hex'),
    },
  })
  await core.ready()
}

function isSystemMessage (text) {
  return !text || text.startsWith('__KEY_SHARE__:') || text.startsWith('__PRESENCE__:')
}

async function printHistory () {
  const messages = []
  const feeds = vaultMode && vaultFeeds ? vaultFeeds.values() : [core]
  for (const feed of feeds) {
    for (let i = 0; i < feed.length; i++) {
      try {
        const raw = await feed.get(i)
        if (!raw) continue
        const msg = JSON.parse(b4a.toString(raw))
        if (!msg.text || isSystemMessage(msg.text)) continue
        messages.push(msg)
      } catch (_) {}
    }
  }
  messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  for (const msg of messages) {
    const prefix = msg.authorPubkey === writerId ? 'mine' : 'them'
    const wallet = msg.wallet ? ` [${msg.wallet.slice(0, 8)}]` : msg.gateBypass ? ' [dev]' : ''
    console.log('  [' + prefix + wallet + '] ' + msg.author + ': ' + msg.text)
  }
}

await printHistory()

const swarm = new Hyperswarm()
swarm.on('connection', (socket) => {
  socket.on('error', () => {})
  console.log('  [p2p] replication peer connected')
  store.replicate(socket, { live: true })
  void resyncVaultFeeds()
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

function onRemoteAppend (feed) {
  let replayed = 0
  const replay = async () => {
    for (let i = replayed; i < feed.length; i++) {
      try {
        const raw = await feed.get(i)
        if (!raw) continue
        const msg = JSON.parse(b4a.toString(raw))
        if (!msg.text || isSystemMessage(msg.text)) continue
        if (msg.authorPubkey === writerId) continue
        const wallet = msg.wallet ? ` [${msg.wallet.slice(0, 8)}]` : msg.gateBypass ? ' [dev]' : ''
        const line = msg.author + wallet + ': ' + msg.text
        console.log('  [them]' + line)
      } catch (_) {}
    }
    replayed = feed.length
  }
  feed.on('append', () => {
    replay().catch(() => {})
  })
  replay().catch(() => {})
}

async function resyncVaultFeeds () {
  if (!vaultMode || !vaultFeeds) return
  try {
    const known = peerHandshake?.known
    const collected = await collectVaultFeeds(vaultAddress, writerId, known)
    let added = false
    for (const [dk, feed] of collected.feeds) {
      if (!vaultFeeds.has(dk)) {
        vaultFeeds.set(dk, feed)
        onRemoteAppend(feed)
        added = true
      }
      try { await feed.update({ wait: true }) } catch (_) {}
    }
    if (added) {
      console.log('  [sync] outbox feeds now ' + vaultFeeds.size)
    }
    await printHistory()
  } catch (_) {}
}

if (vaultMode && vaultFeeds) {
  for (const feed of vaultFeeds.values()) onRemoteAppend(feed)
} else {
  onRemoteAppend(core)
}

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
      authorPubkey: writerId,
      text,
      timestamp: Date.now(),
    }

    if (vaultAddress) message.vaultAddress = vaultAddress
    if (opts.bypassTag) message.gateBypass = opts.bypassTag

    core.append(b4a.from(JSON.stringify(message))).then(() => {
      const sent = peerHandshake?.broadcastMessage(message) || 0
      console.log('  [direct] sent to ' + sent + ' peer(s)')
    }).catch((err) => {
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
  try { peerHandshake?.destroy() } catch (_) {}
  try { swarm.destroy() } catch (_) {}
  try { store.close() } catch (_) {}
}

process.on('SIGINT', () => {
  console.log('')
  cleanup()
  process.exit(0)
})

process.stdout.write('> ')

if (vaultMode) {
  setInterval(() => {
    void resyncVaultFeeds()
  }, 15000)
}
