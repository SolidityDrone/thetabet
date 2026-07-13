#!/usr/bin/env node
/**
 * Pear DM console — register a handle and chat in encrypted DMs with the phone app.
 *
 * Terminal (this script):
 *   npm run pear:dm
 *   DM_HANDLE=dev npm run pear:dm
 *   bare scripts/pear-dm-demo.mjs --handle dev --auto-accept
 *   bare scripts/pear-dm-demo.mjs --add @pips
 *
 * Phone app:
 *   1) Your handle must be announced in Pear (Profile / chat settings).
 *   2) To DM the terminal handle from the phone, that handle must exist on-chain
 *      (tipster registry) — same name you pass as --handle here.
 *   3) Send a contact request from Home → DM, or accept one from the terminal.
 *
 * Either side can initiate:
 *   Terminal → phone:  /add @pips
 *   Phone → terminal:  DM @dev in the app (after @dev is on-chain + this script is running)
 */
import process from 'bare-process'
import { PearChat } from '../pear-end/chat.mjs'
import { attachJsonFramer, writeJsonFrame } from '../pear-end/socket-framer.mjs'
import {
  connectLocalDmSocket,
  deliverContactRequestViaTcp,
  lookupHandleViaTcp,
  LOCAL_DM_PORT,
  queryDmPresence,
  requestContactViaTcp,
  startDmTcpBridge,
} from '../pear-end/dm-local-tcp.mjs'

const DATA_DIR = './.pear-dm-demo-data'

function parseArgs (argv) {
  const opts = {
    handle: (process.env.DM_HANDLE || 'dev').replace(/^@/, '').trim().toLowerCase(),
    autoAccept: process.env.AUTO_ACCEPT === '1',
    addPeer: null,
    addNote: '',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--handle') {
      opts.handle = (argv[++i] || opts.handle).replace(/^@/, '').trim().toLowerCase()
    } else if (arg === '--auto-accept') {
      opts.autoAccept = true
    } else if (arg === '--add' || arg === '--peer') {
      opts.addPeer = (argv[++i] || '').replace(/^@/, '').trim().toLowerCase()
    } else if (arg === '--note') {
      opts.addNote = argv[++i] || ''
    } else if (arg === '--help') {
      printHelp()
      process.exit(0)
    }
  }

  return opts
}

function printHelp () {
  console.log(`
Pear DM console

  npm run pear:adb:dm          # forward + reverse (run once)
  npm run pear:dm:probe        # see phone's real @handle
  npm run pear:dm:dev            # terminal as @dev, auto-accept

  /add @pips                   # uses USB pubkey (handle name optional)
  Phone → terminal: DM @dev     # no on-chain needed for @dev anymore

Commands:
  /help                 Show commands
  /contacts             Pending + accepted contacts
  /dms                  List DM threads
  /lookup @handle       Resolve a Pear handle on DHT
  /add @handle [note]   Send a contact request
  /accept <id>          Accept incoming request
  /reject <id>          Decline incoming request
  /open @handle         Open DM with accepted contact
  /history              Print active thread history
  /quit                 Exit

Type a message and press Enter to send in the active DM thread.
`)
}

function formatMessage (message) {
  const who = message.isMine ? 'you' : message.author
  const time = new Date(message.timestamp).toLocaleTimeString()
  return `[${time}] ${who}: ${message.text}`
}

const opts = parseArgs(process.argv.slice(2))
let activeDmId = null
let chat = null
let dmTcpServer = null
let phoneRelay = null
let phonePresence = null

function usbHelp (detail) {
  return (
    `${detail}\n\n` +
    'USB setup (both directions):\n' +
    '  npm run pear:adb:dm\n' +
    '  npm run pear:dm:probe\n' +
    'Reload phone app after: npm run bundle:pear'
  )
}

async function probePhone () {
  try {
    phonePresence = await queryDmPresence(6000)
    console.log(`USB phone @${phonePresence.handle || '(no Pear handle)'} · ${phonePresence.pubkey.slice(0, 16)}…`)
    return phonePresence
  } catch (error) {
    console.log('USB phone not reachable:', error?.message || String(error))
    console.log('  Run: npm run pear:adb:dm')
    return null
  }
}

function openPhoneRelay () {
  if (!phonePresence?.pubkey || phoneRelay) return
  void connectLocalDmSocket(5000).then((socket) => {
    phoneRelay = socket
    attachJsonFramer(socket, (frame) => {
      if (frame.type !== 'dm-room-message' || !frame.roomId || !frame.message) return
      if (!activeDmId) activeDmId = frame.roomId
      const runtime = chat.channels.get(frame.roomId)
      runtime?.injectRemoteEnvelope?.(frame.message)
    })
  }).catch(() => {})
}

function pickDefaultDm () {
  const dms = chat.directory.filter((row) => row.kind === 'dm')
  if (dms.length === 1) {
    activeDmId = dms[0].id
    return dms[0]
  }
  return null
}

function dmForHandle (handle) {
  const want = handle.replace(/^@/, '').trim().toLowerCase()
  return chat.directory.find(
    (row) => row.kind === 'dm' && (row.peerHandle || '').toLowerCase() === want
  )
}

async function printContacts () {
  const contacts = await chat.listContacts()
  console.log('\n── Contacts ──')
  if (contacts.pendingIncoming.length === 0 && contacts.pendingOutgoing.length === 0 && contacts.accepted.length === 0) {
    console.log('  (none)')
  }
  for (const row of contacts.pendingIncoming) {
    console.log(`  incoming  ${row.id}  @${row.fromHandle || row.fromPubkey.slice(0, 8)}  ${row.note ? `"${row.note}"` : ''}`)
  }
  for (const row of contacts.pendingOutgoing) {
    console.log(`  outgoing  ${row.id}  @${row.toHandle || row.toPubkey.slice(0, 8)}`)
  }
  for (const row of contacts.accepted) {
    console.log(`  accepted  ${row.dmId.slice(0, 12)}…  @${row.peerHandle || row.peerPubkey.slice(0, 8)}`)
  }
  console.log('')
}

async function printDms () {
  const dms = await chat.listDms()
  console.log('\n── DMs ──')
  if (dms.length === 0) {
    console.log('  (none — use /add @handle or accept a request from the phone)')
  }
  for (const dm of dms) {
    const active = dm.id === activeDmId ? ' *' : ''
    console.log(`  ${dm.id.slice(0, 12)}…  @${dm.peerHandle || dm.peerPubkey?.slice(0, 8) || '?'}${active}`)
  }
  console.log('')
}

async function openDm (handleOrId) {
  const raw = handleOrId.replace(/^@/, '').trim()
  let channel =
    chat.directory.find((row) => row.kind === 'dm' && row.id === raw) ||
    dmForHandle(raw)

  if (!channel) {
    const accepted = chat.contacts.accepted.find(
      (row) => (row.peerHandle || '').toLowerCase() === raw.toLowerCase()
    )
    if (accepted) {
      channel = chat.directory.find((row) => row.id === accepted.dmId)
    }
  }

  if (!channel) {
    console.log(`No DM thread for "${handleOrId}". Try /add @${raw} or /contacts`)
    return false
  }

  await chat.attachDmChannel(channel)
  activeDmId = channel.id
  console.log(`Active DM: @${channel.peerHandle || channel.peerPubkey.slice(0, 8)} (${channel.id.slice(0, 12)}…)`)
  return true
}

async function printHistory () {
  if (!activeDmId) {
    console.log('No active DM — use /open @handle')
    return
  }
  const rows = await chat.getDmHistory(activeDmId)
  console.log('\n── History ──')
  if (rows.length === 0) console.log('  (empty)')
  for (const row of rows) console.log('  ' + formatMessage(row))
  console.log('')
}

async function acceptIncoming (requestId, accept) {
  await chat.respondContactRequest({ requestId, accept })
  if (accept) {
    const accepted = chat.contacts.accepted.find((row) => row.dmId)
    const last = chat.contacts.accepted[chat.contacts.accepted.length - 1]
    if (last?.dmId) {
      activeDmId = last.dmId
      const channel = chat.directory.find((row) => row.id === last.dmId)
      if (channel) await chat.attachDmChannel(channel)
      console.log(`Accepted — DM open with @${last.peerHandle || last.peerPubkey.slice(0, 8)}`)
    }
  } else {
    console.log(`Declined request ${requestId}`)
  }
}

async function maybeAutoAccept () {
  if (!opts.autoAccept) return
  const contacts = await chat.listContacts()
  for (const row of contacts.pendingIncoming) {
    console.log(`[auto-accept] @${row.fromHandle || row.fromPubkey.slice(0, 8)}`)
    await acceptIncoming(row.id, true)
  }
}

async function lookupPeer (handle) {
  const normalized = handle.replace(/^@/, '').trim().toLowerCase()
  try {
    console.log('  Trying USB bridge (adb forward)…')
    const socket = await connectLocalDmSocket(5000)
    try {
      return await lookupHandleViaTcp(socket, normalized, 8000)
    } finally {
      try { socket.destroy() } catch (_) {}
    }
  } catch (usbError) {
    console.log(`  USB: ${usbError?.message || String(usbError)}`)
    console.log('  Trying Hyperswarm DHT…')
    return chat.lookupHandle(normalized, 20_000)
  }
}

async function sendContactRequest (handle, note) {
  const normalized = handle.replace(/^@/, '').trim().toLowerCase()
  const presence = phonePresence || (await probePhone())
  if (!presence?.pubkey) {
    throw new Error(usbHelp('Phone USB bridge not available'))
  }

  const peer = {
    handle: presence.handle || normalized,
    pubkey: presence.pubkey,
    avatarData: null,
  }

  if (normalized && presence.handle && normalized !== presence.handle.toLowerCase()) {
    console.log(`Note: phone Pear handle is @${presence.handle}, not @${normalized}`)
  }

  console.log(`USB contact request → @${peer.handle} (${peer.pubkey.slice(0, 12)}…)`)
  const result = await requestContactViaTcp(chat, { peer, note: note || '' })
  if (result.accepted) {
    const channel = chat.directory.find((row) => row.kind === 'dm' && row.peerPubkey === peer.pubkey)
    if (channel) {
      activeDmId = channel.id
      await chat.attachDmChannel(channel)
    }
    openPhoneRelay()
    console.log(`DM open with @${peer.handle}`)
  } else {
    console.log('Waiting for accept on the phone…')
  }
  return result
}

async function handleCommand (line) {
  const parts = line.trim().split(/\s+/)
  const cmd = (parts[0] || '').toLowerCase()

  if (cmd === '/help') {
    printHelp()
    return
  }
  if (cmd === '/quit' || cmd === '/exit') {
    console.log('Goodbye!')
    cleanup()
    process.exit(0)
  }
  if (cmd === '/contacts') {
    await printContacts()
    return
  }
  if (cmd === '/dms') {
    await printDms()
    return
  }
  if (cmd === '/history') {
    await printHistory()
    return
  }
  if (cmd === '/lookup') {
    const handle = parts[1]
    if (!handle) {
      console.log('Usage: /lookup @handle')
      return
    }
    const peer = await lookupPeer(handle.replace(/^@/, ''))
    console.log(`@${peer.handle}  ${peer.pubkey}`)
    return
  }
  if (cmd === '/add') {
    const handle = parts[1]
    if (!handle) {
      console.log('Usage: /add @handle [note…]')
      return
    }
    const note = parts.slice(2).join(' ')
    await sendContactRequest(handle, note)
    return
  }
  if (cmd === '/accept') {
    const id = parts[1]
    if (!id) {
      console.log('Usage: /accept <request-id>')
      return
    }
    await acceptIncoming(id, true)
    return
  }
  if (cmd === '/reject') {
    const id = parts[1]
    if (!id) {
      console.log('Usage: /reject <request-id>')
      return
    }
    await acceptIncoming(id, false)
    return
  }
  if (cmd === '/open') {
    const target = parts[1]
    if (!target) {
      console.log('Usage: /open @handle')
      return
    }
    await openDm(target)
    return
  }

  console.log(`Unknown command ${cmd} — try /help`)
}

async function sendDmText (text) {
  if (!activeDmId) {
    const only = pickDefaultDm()
    if (!only) {
      console.log('No active DM. Use /open @handle or /add @handle first.')
      return
    }
    await chat.attachDmChannel(only)
    console.log(`Using DM @${only.peerHandle || only.peerPubkey.slice(0, 8)}`)
  }

  const sent = await chat.sendDmMessage({ dmId: activeDmId, text })
  console.log(`  → ${formatMessage(sent)}`)
}

function cleanup () {
  try { chat?.swarm?.destroy() } catch (_) {}
  try { chat?.contactSwarm?.destroy() } catch (_) {}
  try { chat?.store?.close() } catch (_) {}
}

chat = new PearChat(DATA_DIR, (message) => {
  if (message.kind !== 'dm') return
  if (message.channelId === activeDmId || !activeDmId) {
    if (!activeDmId) activeDmId = message.channelId
    console.log('\n' + formatMessage(message))
    process.stdout.write('> ')
  } else {
    console.log(`\n[other dm] ${formatMessage(message)}`)
    process.stdout.write('> ')
  }
}, () => {
  void (async () => {
    await maybeAutoAccept()
    await printContacts()
    process.stdout.write('> ')
  })()
})

await chat.ready

dmTcpServer = startDmTcpBridge(() => chat, LOCAL_DM_PORT)
chat.dmTcpBroadcast = (frame) => {
  try {
    dmTcpServer?.broadcastFrame?.(frame)
  } catch (_) {}
  if (frame?.type === 'dm-room-message' && phoneRelay) {
    try {
      writeJsonFrame(phoneRelay, frame)
    } catch (_) {}
  }
}

const announced = await chat.announceHandle(opts.handle)
console.log('')
console.log('Pear DM console')
console.log('───────────────')
console.log(`  handle   @${announced.handle}`)
console.log(`  pubkey   ${announced.pubkey.slice(0, 24)}…`)
console.log(`  data     ${DATA_DIR}`)
if (opts.autoAccept) console.log('  mode     auto-accept incoming')
console.log('')
console.log('USB: npm run pear:adb:dm  (forward + reverse)')
console.log('Phone → terminal @' + opts.handle + ' needs reverse; terminal → phone needs forward')
console.log('Type /help for commands.')
console.log('')

await probePhone()
await maybeAutoAccept()
await printContacts()

if (opts.addPeer) {
  try {
    await sendContactRequest(opts.addPeer, opts.addNote)
  } catch (error) {
    console.error('[add]', error?.message || String(error))
  }
}

const defaultDm = pickDefaultDm()
if (defaultDm) {
  await chat.attachDmChannel(defaultDm)
  console.log(`Active DM: @${defaultDm.peerHandle || defaultDm.peerPubkey.slice(0, 8)}`)
  await printHistory()
}

let buf = ''
process.stdin.on('data', (chunk) => {
  buf += chunk.toString()
  const lines = buf.split('\n')
  buf = lines.pop()

  for (const line of lines) {
    const text = line.trim()
    if (!text) {
      process.stdout.write('> ')
      continue
    }

    void (async () => {
      try {
        if (text.startsWith('/')) {
          await handleCommand(text)
        } else {
          await sendDmText(text)
        }
      } catch (error) {
        console.log('Error: ' + (error?.message || String(error)))
      }
      process.stdout.write('> ')
    })()
  }
})

process.stdin.on('end', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('')
  cleanup()
  process.exit(0)
})

process.stdout.write('> ')
