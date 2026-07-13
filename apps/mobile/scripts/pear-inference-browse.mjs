#!/usr/bin/env node
/**
 * Quick local test: browse inference directory from WSL while stub is running.
 *
 *   npm run pear:inference:stub    # terminal 1
 *   npm run pear:inference:browse  # terminal 2
 */
import b4a from 'b4a'
import crypto from 'hypercore-crypto'
import process from 'bare-process'
import { PeerInference } from '../pear-end/peer-inference.mjs'
import { topicHexFromLabel } from '../pear-end/crypto.mjs'

const DIRECTORY_TOPIC_HEX = topicHexFromLabel('thetabet-peer-inference-directory-v1')
const identity = crypto.keyPair()
const chat = {
  identity,
  registeredHandle: 'browse-test',
}

const peerInference = new PeerInference(chat, {})
console.log('Browsing inference directory…')
console.log(`  topic: ${DIRECTORY_TOPIC_HEX.slice(0, 16)}…`)
console.log(`  local pubkey: ${b4a.toString(identity.publicKey, 'hex').slice(0, 16)}…`)
console.log('')

try {
  const peers = await peerInference.browse(30_000)
  if (peers.length === 0) {
    console.log('No peers found.')
    process.exit(1)
  }
  console.log(`Found ${peers.length} peer(s):`)
  for (const peer of peers) {
    console.log(`  @${peer.handle || peer.pubkey.slice(0, 8)} · ${peer.status} · ${peer.pubkey}`)
  }
} catch (error) {
  console.error(error?.message || String(error))
  process.exit(1)
} finally {
  peerInference.destroy()
}
