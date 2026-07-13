#!/usr/bin/env node
/**
 * Probe USB inference bridge — run `npm run pear:adb:inference` first.
 */
import process from 'bare-process'
import { acceptPresenceFrame } from '../pear-end/peer-inference.mjs'
import { connectLocalInferenceSocket, LOCAL_INFERENCE_PORT } from '../pear-end/inference-local-tcp.mjs'
import { attachJsonFramer, writeJsonFrame } from '../pear-end/socket-framer.mjs'

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function queryPresence (socket) {
  const seen = []
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ peer: null, seen }), 6000)
    attachJsonFramer(socket, (frame) => {
      if (frame?.type) seen.push(frame.type)
      const payload = acceptPresenceFrame(frame, null, { trustedLocal: true })
      if (!payload) return
      clearTimeout(timer)
      resolve({ peer: payload, seen })
    })
    writeJsonFrame(socket, { type: 'inference-presence-query' })
  })
}

async function probe () {
  console.log(`Probing localhost:${LOCAL_INFERENCE_PORT} (adb forward → phone)`)
  console.log('Run first: npm run pear:adb:inference')
  console.log('')

  let socket
  try {
    socket = await connectLocalInferenceSocket(5000)
  } catch (error) {
    console.log('TCP connect failed:', error?.message || String(error))
    console.log('')
    console.log('Phone checklist:')
    console.log('  1. Settings → Offer peer inference ON')
    console.log('     Must show: "USB bridge :39391" (not "USB bridge off")')
    console.log('  2. App in foreground')
    console.log('  3. npm run bundle:pear && npm run start:clean, reopen app')
    process.exit(1)
  }

  let result = null
  let allSeen = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      try { socket.destroy() } catch (_) {}
      await sleep(400)
      socket = await connectLocalInferenceSocket(5000)
    }
    await sleep(200)
    const { peer, seen } = await queryPresence(socket)
    allSeen = seen
    if (peer) {
      result = peer
      break
    }
    console.log(`Attempt ${attempt}/3: no presence (${seen.length ? seen.join(', ') : 'no frames'})`)
  }

  try { socket.destroy() } catch (_) {}

  if (!result) {
    console.log('')
    console.log('Connected but no presence reply')
    console.log('  frames seen:', allSeen.length ? allSeen.join(', ') : 'none')
    console.log('')
    console.log('On phone Settings, if "USB bridge off": toggle peer inference OFF → ON')
    process.exit(1)
  }

  console.log('')
  console.log('Phone inference provider reachable via USB')
  console.log(`  handle: @${result.handle || '(none)'}`)
  console.log(`  pubkey: ${result.pubkey}`)
  console.log(`  status: ${result.status}`)
}

await probe()
