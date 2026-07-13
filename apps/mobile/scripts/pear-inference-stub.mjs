#!/usr/bin/env node
/**
 * Pear inference stub provider — discoverable peer for single-phone testing.
 *
 * Phone = client (Browse peers → request inference)
 * WSL   = provider (this script)
 *
 * Usage:
 *   cd apps/mobile
 *   npm run pear:inference:stub
 *
 * Then on the phone: Match AI sheet → Browse peers → pick the stub peer.
 */
import b4a from 'b4a'
import crypto from 'hypercore-crypto'
import fs from 'bare-fs'
import path from 'bare-path'
import process from 'bare-process'
import { PeerInference } from '../pear-end/peer-inference.mjs'
import { myPubkeyHex, topicHexFromLabel } from '../pear-end/crypto.mjs'
import { LOCAL_INFERENCE_PORT, startInferenceTcpBridge } from '../pear-end/inference-local-tcp.mjs'

const DIRECTORY_TOPIC_HEX = topicHexFromLabel('thetabet-peer-inference-directory-v1')

const DATA_DIR = './.pear-inference-stub-data'
const IDENTITY_FILE = 'identity.json'
const HANDLE = 'infer-stub'

function loadOrCreateIdentity () {
  const identityPath = path.join(DATA_DIR, IDENTITY_FILE)
  if (fs.existsSync(identityPath)) {
    const raw = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    return {
      publicKey: b4a.from(raw.publicKey, 'hex'),
      secretKey: b4a.from(raw.secretKey, 'hex'),
      handle: raw.handle || HANDLE,
    }
  }

  const keyPair = crypto.keyPair()
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(
    identityPath,
    JSON.stringify({
      publicKey: b4a.toString(keyPair.publicKey, 'hex'),
      secretKey: b4a.toString(keyPair.secretKey, 'hex'),
      handle: HANDLE,
    })
  )
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    handle: HANDLE,
  }
}

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseSides (matchTitle) {
  const m = matchTitle.match(/^(.+?)\s+(?:vs\.?|v\.?|–|—|-)\s+(.+)$/i)
  if (!m) return { home: 'Home', away: 'Away' }
  return { home: m[1].trim(), away: m[2].trim() }
}

function buildStubResult (input) {
  const { home, away } = parseSides(input.matchTitle)
  const options = []

  for (const market of input.markets) {
    for (const outcome of market.outcomes) {
      options.push({
        conditionId: market.conditionId,
        conditionTitle: market.conditionTitle,
        outcomeId: outcome.outcomeId,
        outcomeTitle: outcome.title,
        decimalOdds: outcome.decimalOdds,
        rawOdds: typeof outcome.rawOdds === 'string' ? outcome.rawOdds : String(outcome.decimalOdds),
      })
    }
  }

  options.sort((a, b) => a.decimalOdds - b.decimalOdds)

  const suggestions = options.slice(0, 3).map((pick, index) => ({
    ...pick,
    rank: index + 1,
    reason:
      index === 0
        ? `Stub peer main play — ${pick.outcomeTitle} priced at ${pick.decimalOdds.toFixed(2)}x.`
        : index === 1
          ? `Alt angle on ${pick.outcomeTitle} if the favourite stalls.`
          : `Longshot ${pick.outcomeTitle} for upside.`,
  }))

  const main = suggestions[0]
  const answer = [
    main
      ? `MAIN: Stub peer tip on ${input.matchTitle} — lean ${main.outcomeTitle} @ ${main.decimalOdds.toFixed(2)}x from terminal provider.`
      : `MAIN: Stub peer completed ${input.matchTitle} without live picks.`,
    `HOME: ${home} profile looks balanced in this stub run (no web scouts).`,
    `AWAY: ${away} can punish space if the favourite overcommits.`,
    suggestions[0] ? `REASON1: ${suggestions[0].reason}` : 'REASON1: NONE',
    suggestions[1] ? `REASON2: ${suggestions[1].reason}` : 'REASON2: NONE',
    suggestions[2] ? `REASON3: ${suggestions[2].reason}` : 'REASON3: NONE',
  ].join('\n')

  const dossier = {
    matchTitle: input.matchTitle,
    scouts: [
      {
        id: 'form',
        fields: { summary: 'Stub provider — simulated form read (terminal/WSL).' },
        sources: [],
      },
      {
        id: 'injuries',
        fields: { summary: 'Stub provider — no injury web pass in test mode.' },
        sources: [],
      },
      {
        id: 'tactics',
        fields: { summary: 'Stub provider — tactical note generated locally.' },
        sources: [],
      },
    ],
  }

  return { dossier, answer, suggestions }
}

async function runStubProvider (peerInference, request) {
  const { requestId, input } = request
  console.log(`\n[inference] request ${requestId}`)
  console.log(`  match: ${input.matchTitle}`)
  console.log(`  markets: ${input.markets.length}`)

  peerInference.sendProviderProgress({
    requestId,
    stage: 'web',
    message: 'Stub peer scouting (simulated)…',
  })
  await sleep(900)

  peerInference.sendProviderProgress({
    requestId,
    stage: 'synthesis',
    message: 'Stub peer writing analysis…',
  })
  await sleep(1200)

  const result = buildStubResult(input)
  peerInference.completeProviderRequest({ requestId, result })
  console.log(`[inference] done ${requestId} · picks: ${result.suggestions.length}`)
}

const identity = loadOrCreateIdentity()
const chat = {
  identity,
  registeredHandle: identity.handle || HANDLE,
}

const peerInference = new PeerInference(chat, {
  onDirectoryConnection: () => {
    console.log('[directory] browse/client connected')
  },
  onProviderRequest: (request) => {
    void runStubProvider(peerInference, request).catch((error) => {
      console.error('[inference] failed', error)
      peerInference.completeProviderRequest({
        requestId: request.requestId,
        error: error?.message || String(error),
      })
    })
  },
  onProviderCancel: ({ requestId }) => {
    console.log(`[inference] cancelled ${requestId}`)
  },
  onStatusChanged: (profile) => {
    console.log(`[status] ${profile.status}`)
  },
})

await peerInference.setEnabled(true)
await peerInference.waitForDirectoryReady()
const tcpServer = startInferenceTcpBridge(peerInference, LOCAL_INFERENCE_PORT)

console.log('Pear inference stub provider online')
console.log(`  directory topic: ${DIRECTORY_TOPIC_HEX.slice(0, 16)}…`)
console.log(`  usb bridge: adb reverse tcp:${LOCAL_INFERENCE_PORT} tcp:${LOCAL_INFERENCE_PORT}`)
console.log(`  handle: @${chat.registeredHandle}`)
console.log(`  pubkey: ${myPubkeyHex(identity)}`)
console.log('')
console.log('Keep this terminal open. On the phone:')
console.log('  Match → Run AI → Browse peers → select @' + chat.registeredHandle)
console.log('')

process.on('SIGINT', () => {
  console.log('\nShutting down stub provider…')
  try { tcpServer.close() } catch (_) {}
  peerInference.destroy()
  process.exit(0)
})

setInterval(() => {}, 60_000)
