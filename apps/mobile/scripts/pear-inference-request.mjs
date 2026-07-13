#!/usr/bin/env node
/**
 * Terminal inference client — request real QVAC inference from the phone provider.
 *
 * Phone: Settings → enable "Offer peer inference", keep app open in foreground.
 * USB:   adb forward tcp:39391 tcp:39391   (phone listens, PC connects)
 *
 *   npm run pear:inference:request
 *   PROVIDER_HANDLE=myhandle npm run pear:inference:request
 */
import b4a from 'b4a'
import crypto from 'hypercore-crypto'
import process from 'bare-process'
import { PeerInference } from '../pear-end/peer-inference.mjs'
import { myPubkeyHex } from '../pear-end/crypto.mjs'

const DATA_DIR = './.pear-inference-client-data'
const STUB_HANDLE = 'infer-stub'

export const FRANCE_SPAIN_INPUT = {
  gameId: 'demo-france-spain',
  matchTitle: 'France vs Spain',
  startsAt: null,
  league: 'International',
  markets: [
    {
      conditionId: 'demo-fr-es-1x2',
      conditionTitle: 'Match Result',
      outcomes: [
        { outcomeId: 'fr', title: 'France', decimalOdds: 2.45, rawOdds: '2.45' },
        { outcomeId: 'draw', title: 'Draw', decimalOdds: 3.2, rawOdds: '3.20' },
        { outcomeId: 'es', title: 'Spain', decimalOdds: 2.9, rawOdds: '2.90' },
      ],
    },
    {
      conditionId: 'demo-fr-es-btts',
      conditionTitle: 'Both Teams To Score',
      outcomes: [
        { outcomeId: 'btts-yes', title: 'Yes', decimalOdds: 1.85, rawOdds: '1.85' },
        { outcomeId: 'btts-no', title: 'No', decimalOdds: 1.95, rawOdds: '1.95' },
      ],
    },
    {
      conditionId: 'demo-fr-es-total',
      conditionTitle: 'Total Goals',
      outcomes: [
        { outcomeId: 'over-25', title: 'Over 2.5', decimalOdds: 2.05, rawOdds: '2.05' },
        { outcomeId: 'under-25', title: 'Under 2.5', decimalOdds: 1.78, rawOdds: '1.78' },
      ],
    },
  ],
}

async function loadClientIdentity () {
  const fs = await import('bare-fs').then((m) => m.default ?? m)
  const path = await import('bare-path').then((m) => m.default ?? m)
  const identityPath = path.join(DATA_DIR, 'identity.json')
  if (fs.existsSync(identityPath)) {
    const raw = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    return {
      publicKey: b4a.from(raw.publicKey, 'hex'),
      secretKey: b4a.from(raw.secretKey, 'hex'),
      handle: raw.handle || 'infer-client',
    }
  }
  const keyPair = crypto.keyPair()
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(
    identityPath,
    JSON.stringify({
      publicKey: b4a.toString(keyPair.publicKey, 'hex'),
      secretKey: b4a.toString(keyPair.secretKey, 'hex'),
      handle: 'infer-client',
    })
  )
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    handle: 'infer-client',
  }
}

function pickProvider (peers) {
  const wantHandle = process.env.PROVIDER_HANDLE?.replace(/^@/, '').trim()
  const wantPubkey = process.env.PROVIDER_PUBKEY?.trim().toLowerCase()

  if (wantPubkey) {
    const hit = peers.find((p) => p.pubkey.toLowerCase() === wantPubkey)
    if (hit) return hit
    throw new Error(`Provider pubkey not found: ${wantPubkey}`)
  }

  if (wantHandle) {
    const hit = peers.find((p) => (p.handle || '').toLowerCase() === wantHandle.toLowerCase())
    if (hit) return hit
    throw new Error(`Provider @${wantHandle} not found — is peer inference enabled on the phone?`)
  }

  const candidates = peers.filter(
    (p) => p.status === 'available' && (p.handle || '') !== STUB_HANDLE
  )
  if (candidates.length === 0) {
    const any = peers.filter((p) => (p.handle || '') !== STUB_HANDLE)
    if (any.length === 0) {
      throw new Error(
        'No phone provider found. On the phone: Settings → enable Offer peer inference, keep app open. Run: adb forward tcp:39391 tcp:39391'
      )
    }
    return any[0]
  }
  return candidates[0]
}

let waitListener = (_event) => {}
let resultTimer = null
let pendingResult = null

function armResultWait (requestId, timeoutMs = 25 * 60 * 1000) {
  pendingResult = new Promise((resolve, reject) => {
    if (resultTimer) clearTimeout(resultTimer)
    resultTimer = setTimeout(() => reject(new Error('Inference timed out')), timeoutMs)
    waitListener = (event) => {
      if (event.requestId !== requestId) return
      if (event.type === 'progress') {
        const stage = event.stage ? `[${event.stage}] ` : ''
        console.log(`[progress] ${stage}${event.message || '…'}`)
      }
      if (event.type === 'result') {
        clearTimeout(resultTimer)
        resolve(event.result)
      }
      if (event.type === 'error') {
        clearTimeout(resultTimer)
        reject(new Error(event.message || 'Peer inference failed'))
      }
    }
  })
  return pendingResult
}

const identity = await loadClientIdentity()
const chat = { identity, registeredHandle: identity.handle }
const peerInference = new PeerInference(chat, {
  onRequesterEvent: (event) => waitListener(event),
})

console.log('Pear inference client')
console.log(`  client pubkey: ${myPubkeyHex(identity).slice(0, 16)}…`)
console.log(`  match: ${FRANCE_SPAIN_INPUT.matchTitle}`)
console.log('  USB tip: adb forward tcp:39391 tcp:39391')
console.log('')

try {
  console.log('Probing USB bridge (adb forward)…')
  const usbPeer = await peerInference.probeLocalProvider(6000)
  if (usbPeer) {
    console.log(`  USB peer: @${usbPeer.handle || usbPeer.pubkey.slice(0, 8)} · ${usbPeer.status}`)
  } else {
    console.log('  USB peer: none — run `npm run pear:inference:probe` for help')
  }
  console.log('')
  console.log('Browsing for phone providers…')
  const peers = await peerInference.browse(30_000)
  if (peers.length === 0) throw new Error('No peers found')

  console.log(`Found ${peers.length} peer(s):`)
  for (const peer of peers) {
    console.log(`  @${peer.handle || peer.pubkey.slice(0, 8)} · ${peer.status}`)
  }
  console.log('')

  const provider = pickProvider(peers)
  console.log(
    `Requesting inference from @${provider.handle || provider.pubkey.slice(0, 8)} (${provider.pubkey.slice(0, 12)}…)…`
  )

  const accepted = await peerInference.request({
    providerPubkey: provider.pubkey,
    input: FRANCE_SPAIN_INPUT,
  })
  const resultPromise = armResultWait(accepted.requestId)
  console.log(`[accepted] request ${accepted.requestId}`)
  console.log('Phone should show a banner — real QVAC inference running…')
  console.log('')

  const result = await resultPromise
  console.log('\n=== ANALYSIS ===\n')
  console.log(result.answer || '(no answer)')
  console.log('\n=== PICKS ===')
  for (const pick of result.suggestions || []) {
    console.log(
      `  #${pick.rank} ${pick.outcomeTitle} (${pick.conditionTitle}) @ ${pick.decimalOdds?.toFixed?.(2) ?? pick.decimalOdds}x`
    )
    if (pick.reason) console.log(`     ${pick.reason}`)
  }
  console.log('\n=== SCOUTS ===')
  for (const scout of result.dossier?.scouts || []) {
    const summary = scout.fields?.summary || Object.values(scout.fields || {}).find(Boolean) || '—'
    console.log(`  ${scout.id}: ${String(summary).slice(0, 120)}`)
  }
} catch (error) {
  console.error('\n[error]', error?.message || String(error))
  process.exit(1)
} finally {
  peerInference.destroy()
}
