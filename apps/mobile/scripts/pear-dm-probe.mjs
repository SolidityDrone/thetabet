#!/usr/bin/env node
/**
 * Probe USB DM bridge — run `npm run pear:adb:dm` first.
 */
import process from 'bare-process'
import { connectLocalDmSocket, LOCAL_DM_PORT, queryDmPresence } from '../pear-end/dm-local-tcp.mjs'

async function probe () {
  console.log(`Probing localhost:${LOCAL_DM_PORT} (adb forward → phone Pear)`)
  console.log('Run first: npm run pear:adb:dm')
  console.log('')

  try {
    const presence = await queryDmPresence(6000)
    console.log('Phone Pear DM bridge reachable via USB')
    console.log(`  handle: @${presence.handle || '(not registered — set handle in app Profile)'}`)
    console.log(`  pubkey: ${presence.pubkey}`)
    console.log(`  ready:  ${presence.ready ? 'yes' : 'no'}`)
    if (!presence.handle) {
      console.log('')
      console.log('On phone: register your Pear handle (same as @pips on-chain) in the app.')
    }
  } catch (error) {
    console.log('Probe failed:', error?.message || String(error))
    console.log('')
    console.log('Phone checklist:')
    console.log('  1. App open in foreground')
    console.log('  2. Pear handle synced (wallet @handle → auto on app load)')
    console.log('  3. npm run bundle:pear && reload app')
    console.log('  4. npm run pear:adb:dm  (forward + reverse)')
    process.exit(1)
  }
}

await probe()
