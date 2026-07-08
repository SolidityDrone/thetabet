#!/usr/bin/env node
/**
 * Pear Chat P2P message sender.
 *
 * Acts as a peer in the Hyperswarm network to send messages to a channel
 * that the mobile Pear Chat instance is connected to.
 *
 * Usage:
 *   bare scripts/pear-send.mjs <topicKey> <text>
 *
 * The topicKey is a 64-char hex string visible in the mobile app's
 * Pear Chat debug section.
 *
 * Example:
 *   bare scripts/pear-send.mjs abc123def456... "Hello from console!"
 */
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'

const topicKey = process.argv[2]
const text = process.argv[3]

if (!topicKey || !text) {
  console.error('Usage: bare scripts/pear-send.mjs <topicKey> <text>')
  console.error('  topicKey: 64-char hex channel topic key')
  console.error('  text:     message to send')
  process.exit(1)
}

const channelId = topicKey.slice(0, 16)

// Generate a unique identity for this script session
const keyPair = crypto.keyPair()
const handle = b4a.toString(keyPair.publicKey, 'hex').slice(0, 8)

console.log('Identity:', handle, b4a.toString(keyPair.publicKey, 'hex').slice(0, 16) + '...')

const storagePath = './.pear-script-data'
const store = new Corestore(storagePath)
const swarm = new Hyperswarm()

swarm.on('connection', (socket) => {
  store.replicate(socket, { live: true })
})

await store.ready()

const core = store.get({ name: 'channel-' + channelId })
await core.ready()

const discovery = swarm.join(b4a.from(topicKey, 'hex'), {
  server: false,
  client: true,
})

console.log('Joining channel', channelId, '...')
await discovery.flushed()
console.log('Connected to Hyperswarm!')

// Wait a moment for peer discovery
await new Promise((r) => setTimeout(r, 3000))

const message = {
  id: Date.now() + '-' + Math.random().toString(16).slice(2, 8),
  channelId,
  author: 'console:' + handle,
  authorPubkey: b4a.toString(keyPair.publicKey, 'hex'),
  text,
  timestamp: Date.now(),
}

await core.append(b4a.from(JSON.stringify(message)))
console.log('Message sent:', text)
console.log('Waiting for replication...')

// Give time for the message to replicate to peers
await new Promise((r) => setTimeout(r, 2000))

console.log('Done.')
swarm.destroy()
store.close()
process.exit(0)
