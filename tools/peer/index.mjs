#!/usr/bin/env node
/**
 * WSL Node peer for single-device P2P chat testing.
 * Usage: pnpm peer -- --topic <hex-topic-key> --name "WSL peer"
 */
import fs from 'fs'
import path from 'path'
import process from 'process'
import readline from 'readline'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'

const args = process.argv.slice(2)
const topicArg = getArg('--topic')
const name = getArg('--name') ?? 'WSL peer'
const storage = getArg('--storage') ?? path.join(process.cwd(), '.peer-store')

if (!topicArg) {
  console.error('Usage: node index.mjs --topic <hex-topic-key> [--name "WSL peer"]')
  process.exit(1)
}

const topicKey = b4a.from(topicArg, 'hex')
const storePath = path.join(storage, topicArg.slice(0, 8))
fs.mkdirSync(storePath, { recursive: true })

const store = new Corestore(storePath)
const swarm = new Hyperswarm()
const core = store.get({ name: 'channel' })

await store.ready()
await core.ready()

swarm.on('connection', (socket) => {
  store.replicate(socket, { live: true })
})

const discovery = swarm.join(topicKey, { server: true, client: true })
await discovery.flushed()

core.on('append', () => {
  const raw = core.get(core.length - 1)
  try {
    const message = JSON.parse(b4a.toString(raw))
    console.log(`[${message.author}] ${message.text}`)
  } catch {}
})

console.log(`Peer "${name}" joined topic ${topicArg}`)
console.log('Type messages and press Enter. Ctrl+C to exit.')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.on('line', async (line) => {
  const text = line.trim()
  if (!text) return
  const message = {
    id: `${Date.now()}`,
    channelId: topicArg.slice(0, 16),
    author: name,
    authorPubkey: b4a.toString(crypto.keyPair().publicKey, 'hex'),
    text,
    timestamp: Date.now()
  }
  await core.append(b4a.from(JSON.stringify(message)))
})

process.on('SIGINT', async () => {
  await swarm.destroy()
  await store.close()
  process.exit(0)
})

function getArg (flag) {
  const index = args.indexOf(flag)
  if (index === -1) return null
  return args[index + 1] ?? null
}
