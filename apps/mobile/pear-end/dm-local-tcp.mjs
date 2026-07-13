import net from 'bare-tcp'
import b4a from 'b4a'
import { attachJsonFramer, writeJsonFrame } from './socket-framer.mjs'
import { myPubkeyHex, signCanonical, verifyCanonical } from './crypto.mjs'

export const LOCAL_DM_PORT = 39_392
const BIND_HOST = '0.0.0.0'
const CLIENT_HOST = '127.0.0.1'

function normalizeHandle (handle) {
  return handle.trim().toLowerCase().replace(/^@/, '')
}

export function connectLocalDmSocket (timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(LOCAL_DM_PORT, CLIENT_HOST)
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) {
        try { socket.destroy() } catch (_) {}
        reject(error)
      } else {
        resolve(value)
      }
    }

    const timer = setTimeout(() => finish(new Error('Local DM bridge timed out')), timeoutMs)
    socket.on('connect', () => finish(null, socket))
    socket.on('error', (error) => finish(error))
  })
}

/** Phone-side TCP bridge — adb forward tcp:39392 tcp:39392 */
export function startDmTcpBridge (getChat, port = LOCAL_DM_PORT, hooks = {}) {
  const relaySockets = new Set()
  let listening = false

  const server = net.createServer((socket) => {
    socket._dmTrustedLocal = true
    relaySockets.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => {
      relaySockets.delete(socket)
    })

    attachJsonFramer(socket, (frame) => {
      const chat = getChat()
      if (!chat) return

      if (frame?.type === 'handle-lookup') {
        const handle = normalizeHandle(frame.handle || '')
        const registered = normalizeHandle(chat.registeredHandle || '')
        if (!handle || handle !== registered) {
          writeJsonFrame(socket, {
            type: 'handle-miss',
            handle,
            registered: registered || null,
          })
          return
        }
        const payload = {
          type: 'handle-info',
          handle,
          pubkey: myPubkeyHex(chat.identity),
          avatarData: chat.identity.avatarData || null,
          timestamp: Date.now(),
        }
        payload.signature = signCanonical(chat.identity, payload)
        writeJsonFrame(socket, payload)
        return
      }

      if (frame?.type === 'dm-presence-query') {
        const registered = normalizeHandle(chat.registeredHandle || '')
        writeJsonFrame(socket, {
          type: 'dm-presence',
          handle: registered || null,
          pubkey: myPubkeyHex(chat.identity),
          ready: Boolean(registered),
        })
        return
      }

      if (frame?.type === 'dm-room-message' && frame.roomId && frame.message) {
        const runtime = chat.channels.get(frame.roomId)
        if (runtime?.injectRemoteEnvelope) {
          runtime.injectRemoteEnvelope(frame.message)
        }
        return
      }

      chat.handleContactSocketFrame(socket, frame).catch((error) => {
        console.error('[dm-tcp] frame error:', error?.message || String(error))
      })
    })
  })

  server.on('listening', () => {
    listening = true
    const addr = server.address()
    console.log(`[dm-tcp] bridge on ${addr?.address ?? BIND_HOST}:${addr?.port ?? port}`)
    hooks.onListening?.()
  })

  server.on('error', (error) => {
    listening = false
    hooks.onError?.(error)
    if (error?.code === 'EADDRINUSE') {
      console.warn(`[dm-tcp] port ${port} in use — USB DM bridge disabled`)
      return
    }
    console.error('[dm-tcp] bridge error:', error?.message || String(error))
  })

  server.on('close', () => {
    listening = false
    hooks.onClose?.()
  })

  server.listen(port, BIND_HOST)
  server.isDmListening = () => listening
  server.broadcastFrame = (frame) => {
    for (const socket of relaySockets) {
      try {
        writeJsonFrame(socket, frame)
      } catch (_) {}
    }
  }
  server.relaySockets = relaySockets
  return server
}

export function lookupHandleViaTcp (socket, handle, timeoutMs = 8000) {
  const normalized = normalizeHandle(handle)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }

    const timer = setTimeout(() => {
      finish(new Error(`Handle @${normalized} not found via USB (phone offline or different handle)`))
    }, timeoutMs)

    attachJsonFramer(socket, (frame) => {
      if (frame.type === 'handle-miss') {
        const reg = frame.registered ? ` (phone is @${frame.registered})` : ' (phone has no Pear handle)'
        finish(new Error(`@${normalized} is not the phone's Pear handle${reg}`))
        return
      }
      if (frame.type !== 'handle-info') return
      const payload = { ...frame }
      delete payload.signature
      const ok = verifyCanonical(frame.pubkey, payload, frame.signature)
      if (!ok) return
      if (normalizeHandle(frame.handle) !== normalized) return
      finish(null, {
        handle: normalized,
        pubkey: frame.pubkey,
        avatarData: frame.avatarData || null,
      })
    })

    writeJsonFrame(socket, { type: 'handle-lookup', handle: normalized })
  })
}

export async function probePhoneDmHandle (handle, timeoutMs = 6000) {
  const socket = await connectLocalDmSocket(timeoutMs)
  try {
    return await lookupHandleViaTcp(socket, handle, timeoutMs)
  } finally {
    try { socket.destroy() } catch (_) {}
  }
}

export async function deliverContactRequestViaTcp (chat, { peer, note }, waitAcceptMs = 10 * 60 * 1000) {
  const socket = await connectLocalDmSocket(5000)
  const requestId = Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 10)
  const fromPubkey = myPubkeyHex(chat.identity)
  const reqPayload = {
    id: requestId,
    fromHandle: chat.registeredHandle || null,
    fromAvatarData: chat.identity.avatarData || null,
    fromPubkey,
    toHandle: peer.handle,
    toPubkey: peer.pubkey,
    note: note || '',
    timestamp: Date.now(),
  }
  const signature = signCanonical(chat.identity, reqPayload)

  return new Promise((resolve, reject) => {
    let settled = false
    let phase = 'ack'

    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket.destroy() } catch (_) {}
      if (error) reject(error)
      else resolve(value)
    }

    const timer = setTimeout(() => {
      if (phase === 'ack') {
        finish(new Error('Contact request sent — accept on peer (USB wait timed out)'))
      } else {
        finish(new Error('USB contact request timed out'))
      }
    }, waitAcceptMs)

    attachJsonFramer(socket, (frame) => {
      if (frame.type === 'contact-request-ack' && frame.id === requestId) {
        if (!chat.contacts.pendingOutgoing.some((row) => row.id === requestId)) {
          chat.contacts.pendingOutgoing.push({
            id: requestId,
            toHandle: peer.handle,
            toPubkey: peer.pubkey,
            note: note || '',
            timestamp: Date.now(),
          })
          chat.saveContacts()
        }
        phase = 'accept'
        return
      }

      if (frame.type !== 'contact-response') return
      if (!verifyCanonical(frame.fromPubkey, frame.payload, frame.signature)) return
      if (frame.payload?.id !== requestId) return

      void chat.handleContactSocketFrame(socket, frame).then(() => {
        finish(null, {
          id: requestId,
          peer,
          accepted: Boolean(frame.payload.accepted),
        })
      }).catch((error) => finish(error))
    })

    writeJsonFrame(socket, {
      type: 'contact-request',
      fromPubkey,
      payload: reqPayload,
      signature,
    })
  })
}

export function injectDmRoomViaTcp (chat, roomId, envelope) {
  const runtime = chat.channels.get(roomId)
  if (runtime?.injectRemoteEnvelope) {
    runtime.injectRemoteEnvelope(envelope)
  }
}

export async function requestContactViaTcp (chat, { handle, note, peer }, waitAcceptMs = 10 * 60 * 1000) {
  if (peer?.pubkey) {
    return deliverContactRequestViaTcp(chat, { peer, note: note || '' }, waitAcceptMs)
  }

  const normalized = normalizeHandle(handle)
  const socket = await connectLocalDmSocket(5000)
  try {
    const resolved = await lookupHandleViaTcp(socket, normalized, 8000)
    return deliverContactRequestViaTcp(chat, { peer: resolved, note: note || '' }, waitAcceptMs)
  } finally {
    try { socket.destroy() } catch (_) {}
  }
}

export async function queryDmPresence (timeoutMs = 5000) {
  const socket = await connectLocalDmSocket(timeoutMs)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket.destroy() } catch (_) {}
      if (error) reject(error)
      else resolve(value)
    }

    const timer = setTimeout(() => finish(new Error('DM presence probe timed out')), timeoutMs)

    attachJsonFramer(socket, (frame) => {
      if (frame.type !== 'dm-presence') return
      finish(null, frame)
    })

    writeJsonFrame(socket, { type: 'dm-presence-query' })
  })
}
