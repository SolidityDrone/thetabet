import b4a from 'b4a'
import Hyperswarm from 'hyperswarm'
import {
  digestStablePayload,
  myPubkeyHex,
  signStablePayload,
  topicFromLabel,
  topicHexFromLabel,
  verifyStablePayload,
} from './crypto.mjs'
import { attachJsonFramer, writeJsonFrame } from './socket-framer.mjs'
import { connectLocalInferenceSocket } from './inference-local-tcp.mjs'
import { normalizeIdentityKeys } from './identity.mjs'

const DIRECTORY_TOPIC = topicFromLabel('thetabet-peer-inference-directory-v1')
const DIRECTORY_TOPIC_HEX = topicHexFromLabel('thetabet-peer-inference-directory-v1')
const DIRECT_TOPIC_PREFIX = 'thetabet-peer-inference-direct-v1:'
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const BROWSE_TIMEOUT_MS = 30_000
const BROWSE_FLUSH_MS = 6000
const BROWSE_POLL_MS = 500
const COOLDOWN_MS = 5000
const MAX_MARKETS = 80
const MAX_OUTCOMES = 20
const MAX_TEXT = 240

function normalizePubkey (pubkey) {
  return typeof pubkey === 'string' ? pubkey.trim().toLowerCase() : ''
}

function nowId () {
  return Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 10)
}

function safeText (value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function directTopic (pubkey) {
  return topicFromLabel(DIRECT_TOPIC_PREFIX, b4a.from(pubkey, 'hex'))
}

/** Match the JSON shape the TCP/DHT framer will deliver on the other side. */
function payloadForWire (payload) {
  return JSON.parse(JSON.stringify(payload))
}

function signingBodyForType (type, payload) {
  if (type === 'inference-request') {
    return {
      requestId: payload.requestId,
      inputDigest: digestStablePayload(payload.input),
    }
  }
  return payload
}

function signingIdentity (identity) {
  const normalized = normalizeIdentityKeys(identity)
  if (!normalized) throw new Error('Pear signing keys could not be loaded')
  return normalized
}

function signedFrame (identity, type, payload) {
  const signer = signingIdentity(identity)
  const fromPubkey = myPubkeyHex(signer)
  const wirePayload = type === 'inference-request' ? payloadForWire(payload) : payload
  const signBody = signingBodyForType(type, wirePayload)
  return {
    type,
    fromPubkey,
    payload: wirePayload,
    signature: signStablePayload(signer, signBody),
  }
}

function verifyFrame (frame, expectedType) {
  if (!frame || frame.type !== expectedType) return false
  if (!/^[0-9a-f]{64}$/i.test(frame.fromPubkey || '')) return false
  if (typeof frame.signature !== 'string') return false
  if (!frame.payload || typeof frame.payload !== 'object') return false
  const signBody = signingBodyForType(expectedType, frame.payload)
  return verifyStablePayload(frame.fromPubkey, signBody, frame.signature)
}

function buildInferenceRequestFrame (identity, requestId, input) {
  return signedFrame(identity, 'inference-request', { requestId, input })
}

function validateInput (input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid inference input')
  const matchTitle = safeText(input.matchTitle)
  if (!matchTitle) throw new Error('Match title is required')
  if (!Array.isArray(input.markets) || input.markets.length === 0 || input.markets.length > MAX_MARKETS) {
    throw new Error('Invalid market list')
  }

  const markets = input.markets.flatMap((market) => {
    if (!market || typeof market !== 'object') return []
    const conditionId = safeText(market.conditionId, 160)
    const conditionTitle = safeText(market.conditionTitle)
    if (!conditionId || !conditionTitle || !Array.isArray(market.outcomes)) return []

    const outcomes = market.outcomes
      .map((outcome) => {
        const outcomeId = safeText(outcome?.outcomeId, 160)
        const title = safeText(outcome?.title)
        const decimalOdds = Number(outcome?.decimalOdds)
        if (!outcomeId || !title || !Number.isFinite(decimalOdds) || decimalOdds <= 1) return null
        return {
          outcomeId,
          title,
          decimalOdds,
          rawOdds:
            typeof outcome.rawOdds === 'string' && outcome.rawOdds.trim()
              ? outcome.rawOdds.trim().slice(0, 80)
              : String(decimalOdds),
        }
      })
      .filter(Boolean)
      .slice(0, MAX_OUTCOMES)

    if (outcomes.length === 0) return []
    return [{ conditionId, conditionTitle, outcomes }]
  })

  if (markets.length === 0) {
    throw new Error('No bettable outcomes — wait for active odds, then try again.')
  }

  return {
    gameId: safeText(input.gameId, 160) || null,
    matchTitle,
    startsAt: safeText(input.startsAt, 80) || null,
    league: safeText(input.league) || null,
    markets,
  }
}

function compactResult (result) {
  const dossier = result?.dossier || {}
  return {
    dossier: {
      matchTitle: safeText(dossier.matchTitle),
      scouts: Array.isArray(dossier.scouts)
        ? dossier.scouts.slice(0, 10).map((scout) => ({
            id: safeText(scout?.id, 80),
            fields: Object.fromEntries(
              Object.entries(scout?.fields || {})
                .slice(0, 24)
                .map(([key, value]) => [safeText(key, 80), value == null ? null : safeText(value, 800)])
            ),
            sources: Array.isArray(scout?.sources)
              ? scout.sources.slice(0, 6).map((source) => ({
                  title: safeText(source?.title, 300),
                  url: safeText(source?.url, 1000),
                  site: safeText(source?.site, 160),
                }))
              : [],
          }))
        : [],
    },
    answer: safeText(result?.answer, 16 * 1024),
    suggestions: Array.isArray(result?.suggestions)
      ? result.suggestions.slice(0, 3).map((pick) => ({
          ...pick,
          conditionId: safeText(pick?.conditionId, 160),
          conditionTitle: safeText(pick?.conditionTitle),
          outcomeId: safeText(pick?.outcomeId, 160),
          outcomeTitle: safeText(pick?.outcomeTitle),
          reason: pick?.reason == null ? null : safeText(pick.reason, 1200),
        }))
      : [],
  }
}

export class PeerInference {
  constructor (chat, callbacks = {}) {
    this.chat = chat
    this.callbacks = callbacks
    this.enabled = false
    this.runtimeBusy = false
    this.activeProviderRequest = null
    this.providerSwarms = []
    this.requesters = new Map()
    this.cooldowns = new Map()
    this.directoryDiscovery = null
    this.localTcpProviders = new Set()
  }

  get status () {
    if (!this.enabled) return 'offline'
    return this.runtimeBusy || this.activeProviderRequest ? 'busy' : 'available'
  }

  profile () {
    return {
      pubkey: myPubkeyHex(this.chat.identity),
      handle: this.chat.registeredHandle || null,
      avatarData:
        typeof this.chat.identity.avatarData === 'string' &&
        this.chat.identity.avatarData.length <= 32 * 1024
          ? this.chat.identity.avatarData
          : null,
      status: this.status,
      updatedAt: Date.now(),
    }
  }

  signedFrame (type, payload) {
    return signedFrame(this.chat.identity, type, payload)
  }

  async setEnabled (enabled) {
    this.enabled = Boolean(enabled)
    if (this.enabled && this.providerSwarms.length === 0) this.startProvider()
    if (!this.enabled && !this.activeProviderRequest) this.stopProvider()
    this.callbacks.onStatusChanged?.(this.profile())
    return this.profile()
  }

  setRuntimeBusy (busy) {
    this.runtimeBusy = Boolean(busy)
    this.callbacks.onStatusChanged?.(this.profile())
    return this.profile()
  }

  startProvider () {
    const swarm = new Hyperswarm()
    const attach = (socket) => {
      socket.on('error', () => {})
      attachJsonFramer(socket, (frame) => {
        this.handleProviderFrame(socket, frame).catch((error) => {
          try {
            writeJsonFrame(socket, signedFrame(this.chat.identity, 'inference-error', {
              requestId: frame?.payload?.requestId || null,
              message: error?.message || String(error),
            }))
          } catch (_) {}
        })
      })
    }
    swarm.on('connection', () => {
      this.callbacks.onDirectoryConnection?.()
    })
    swarm.on('connection', attach)
    this.directoryDiscovery = swarm.join(DIRECTORY_TOPIC, { server: true, client: true })
    swarm.join(directTopic(myPubkeyHex(this.chat.identity)), { server: true, client: true })
    this.providerSwarms = [swarm]
  }

  async waitForDirectoryReady (timeoutMs = BROWSE_FLUSH_MS) {
    if (!this.directoryDiscovery) return false
    try {
      await Promise.race([
        this.directoryDiscovery.flushed(),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ])
      return true
    } catch (_) {
      return false
    }
  }

  stopProvider () {
    for (const swarm of this.providerSwarms) {
      try { swarm.destroy() } catch (_) {}
    }
    this.providerSwarms = []
  }

  async handleProviderFrame (socket, frame) {
    const trustedLocal = Boolean(socket._inferenceTrustedLocal)

    if (frame?.type === 'inference-presence-query') {
      writeJsonFrame(socket, signedFrame(this.chat.identity, 'inference-presence', this.profile()))
      return
    }

    if (frame?.type === 'inference-cancel' && verifyFrame(frame, 'inference-cancel')) {
      if (this.activeProviderRequest?.id === frame.payload?.requestId) {
        this.callbacks.onProviderCancel?.({ requestId: frame.payload.requestId })
      }
      return
    }

    if (frame?.type !== 'inference-request') return

    const requestId = safeText(frame.payload?.requestId, 120)
    if (!requestId) return

    if (!trustedLocal && !verifyFrame(frame, 'inference-request')) {
      console.warn('[inference] rejected request — bad signature from', frame.fromPubkey?.slice(0, 8))
      writeJsonFrame(socket, this.signedFrame('inference-rejected', {
        requestId,
        reason: 'Invalid request signature',
      }))
      return
    }

    if (trustedLocal) {
      console.log('[inference] request via USB bridge from', frame.fromPubkey?.slice(0, 8))
    }

    const lastRequest = this.cooldowns.get(frame.fromPubkey) || 0
    if (Date.now() - lastRequest < COOLDOWN_MS) {
      writeJsonFrame(socket, signedFrame(this.chat.identity, 'inference-rejected', {
        requestId,
        reason: 'Rate limited',
      }))
      return
    }
    this.cooldowns.set(frame.fromPubkey, Date.now())

    if (this.status !== 'available') {
      writeJsonFrame(socket, this.signedFrame('inference-rejected', {
        requestId,
        reason: this.enabled ? 'Peer is busy' : 'Peer is offline',
      }))
      return
    }

    let input
    try {
      input = validateInput(frame.payload?.input)
    } catch (error) {
      const message = error?.message || 'Invalid inference input'
      console.warn('[inference] rejected request —', message)
      writeJsonFrame(socket, this.signedFrame('inference-rejected', { requestId, reason: message }))
      return
    }

    console.log('[inference] accepted request', requestId, 'from', frame.fromPubkey.slice(0, 8))
    this.activeProviderRequest = {
      id: requestId,
      requesterPubkey: frame.fromPubkey,
      socket,
      timer: setTimeout(() => this.failProviderRequest(requestId, 'Inference timed out'), REQUEST_TIMEOUT_MS),
    }
    this.callbacks.onStatusChanged?.(this.profile())
    writeJsonFrame(socket, signedFrame(this.chat.identity, 'inference-accepted', {
      requestId,
      provider: this.profile(),
    }))
    this.callbacks.onProviderRequest?.({
      requestId,
      requesterPubkey: frame.fromPubkey,
      input,
    })
  }

  sendProviderProgress ({ requestId, stage, message }) {
    const active = this.activeProviderRequest
    if (!active || active.id !== requestId) return false
    writeJsonFrame(active.socket, signedFrame(this.chat.identity, 'inference-progress', {
      requestId,
      stage: safeText(stage, 80),
      message: safeText(message, 300),
    }))
    return true
  }

  completeProviderRequest ({ requestId, result, error }) {
    const active = this.activeProviderRequest
    if (!active || active.id !== requestId) return false
    clearTimeout(active.timer)
    const type = error ? 'inference-error' : 'inference-result'
    const payload = error
      ? { requestId, message: safeText(error, 500) || 'Inference failed' }
      : { requestId, result: compactResult(result) }
    try {
      writeJsonFrame(active.socket, signedFrame(this.chat.identity, type, payload))
      return true
    } finally {
      this.activeProviderRequest = null
      this.callbacks.onStatusChanged?.(this.profile())
      if (!this.enabled) this.stopProvider()
    }
  }

  failProviderRequest (requestId, message) {
    return this.completeProviderRequest({ requestId, error: message })
  }

  async resolveLocalTcpRoute (providerPubkey, timeoutMs = 5000) {
    const want = normalizePubkey(providerPubkey)
    if (!/^[0-9a-f]{64}$/.test(want)) return false

    let socket
    try {
      socket = await connectLocalInferenceSocket(timeoutMs)
    } catch (_) {
      return false
    }

    const matched = await new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      }
      const timer = setTimeout(() => finish(false), timeoutMs)

      attachJsonFramer(socket, (frame) => {
        if (!verifyFrame(frame, 'inference-presence')) return
        const payload = frame.payload
        if (!payload || normalizePubkey(payload.pubkey) !== normalizePubkey(frame.fromPubkey)) return
        if (normalizePubkey(payload.pubkey) === normalizePubkey(myPubkeyHex(this.chat.identity))) return
        finish(normalizePubkey(payload.pubkey) === want)
      })

      try {
        writeJsonFrame(socket, { type: 'inference-presence-query' })
      } catch (_) {
        finish(false)
      }
    })

    try { socket.destroy() } catch (_) {}
    if (matched) this.localTcpProviders.add(want)
    return matched
  }

  async probeLocalProvider (timeoutMs = 2000) {
    let socket
    try {
      socket = await connectLocalInferenceSocket(timeoutMs)
    } catch (_) {
      return null
    }

    const peer = await new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      }
      const timer = setTimeout(() => finish(null), timeoutMs)

      attachJsonFramer(socket, (frame) => {
        if (!verifyFrame(frame, 'inference-presence')) return
        const payload = frame.payload
        if (!payload || payload.pubkey !== frame.fromPubkey) return
        if (payload.pubkey === myPubkeyHex(this.chat.identity)) return
        finish({
          pubkey: normalizePubkey(payload.pubkey),
          handle: safeText(payload.handle, 80) || null,
          avatarData: typeof payload.avatarData === 'string' ? payload.avatarData : null,
          status: payload.status === 'busy' ? 'busy' : 'available',
          updatedAt: Number(payload.updatedAt) || Date.now(),
        })
      })

      try {
        writeJsonFrame(socket, { type: 'inference-presence-query' })
      } catch (_) {
        finish(null)
      }
    })

    try { socket.destroy() } catch (_) {}
    if (!peer) return null
    this.localTcpProviders.add(peer.pubkey)
    return peer
  }

  handleRequesterFrame (frame, { requestId, providerPubkey, finishStart }) {
    if (!frame?.type?.startsWith('inference-') || !verifyFrame(frame, frame.type)) {
      if (frame?.type?.startsWith('inference-')) {
        console.warn('[inference] ignored frame — bad signature', frame.type, frame.fromPubkey?.slice(0, 8))
      }
      return
    }
    if (
      normalizePubkey(frame.fromPubkey) !== normalizePubkey(providerPubkey) ||
      frame.payload?.requestId !== requestId
    ) {
      return
    }

    if (frame.type === 'inference-accepted') {
      this.requesters.set(requestId, {
        providerPubkey,
        socket: this._activeRequestSocket,
        swarm: this._activeRequestSwarm,
        timer: setTimeout(() => {
          this.emitRequesterEvent({
            type: 'error',
            requestId,
            providerPubkey,
            message: 'Peer inference timed out',
          })
          this.cleanupRequester(requestId)
        }, REQUEST_TIMEOUT_MS),
      })
      finishStart(null, { requestId, provider: frame.payload.provider })
      return
    }
    if (frame.type === 'inference-rejected') {
      finishStart(new Error(frame.payload.reason || 'Peer rejected the request'))
      return
    }
    if (frame.type === 'inference-progress') {
      this.emitRequesterEvent({
        type: 'progress',
        requestId,
        providerPubkey,
        stage: frame.payload.stage,
        message: frame.payload.message,
      })
      return
    }
    if (frame.type === 'inference-result') {
      this.emitRequesterEvent({
        type: 'result',
        requestId,
        providerPubkey,
        result: frame.payload.result,
      })
      this.cleanupRequester(requestId)
      return
    }
    if (frame.type === 'inference-error') {
      const message = frame.payload.message || 'Peer inference failed'
      this.emitRequesterEvent({
        type: 'error',
        requestId,
        providerPubkey,
        message,
      })
      this.cleanupRequester(requestId)
      finishStart(new Error(message))
    }
  }

  async browse (timeoutMs = BROWSE_TIMEOUT_MS) {
    const peers = new Map()
    const localPeer = await this.probeLocalProvider(2500)
    if (localPeer) peers.set(localPeer.pubkey, localPeer)

    const swarm = new Hyperswarm()
    const deadline = Date.now() + Math.max(timeoutMs, 2000)
    let connections = 0

    swarm.on('connection', (socket) => {
      connections += 1
      socket.on('error', () => {})
      attachJsonFramer(socket, (frame) => {
        if (!verifyFrame(frame, 'inference-presence')) return
        const peer = frame.payload
        if (!peer || normalizePubkey(peer.pubkey) !== normalizePubkey(frame.fromPubkey)) return
        if (normalizePubkey(peer.pubkey) === normalizePubkey(myPubkeyHex(this.chat.identity))) return
        peers.set(normalizePubkey(peer.pubkey), {
          pubkey: normalizePubkey(peer.pubkey),
          handle: safeText(peer.handle, 80) || null,
          avatarData: typeof peer.avatarData === 'string' ? peer.avatarData : null,
          status: peer.status === 'busy' ? 'busy' : 'available',
          updatedAt: Number(peer.updatedAt) || Date.now(),
        })
      })
      writeJsonFrame(socket, { type: 'inference-presence-query' })
    })

    const discovery = swarm.join(DIRECTORY_TOPIC, { server: true, client: true })
    try {
      await Promise.race([
        discovery.flushed(),
        new Promise((resolve) => setTimeout(resolve, BROWSE_FLUSH_MS)),
      ])

      while (Date.now() < deadline) {
        if (peers.size > 0) {
          return [...peers.values()].sort((a, b) => {
            if (a.status !== b.status) return a.status === 'available' ? -1 : 1
            return (a.handle || a.pubkey).localeCompare(b.handle || b.pubkey)
          })
        }
        await new Promise((resolve) => setTimeout(resolve, BROWSE_POLL_MS))
      }

      if (peers.size === 0 && connections === 0) {
        throw new Error(
          'No inference peers found. Run `npm run pear:inference:stub` on your PC. On USB/hotspot also run: adb reverse tcp:39391 tcp:39391'
        )
      }

      return [...peers.values()].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'available' ? -1 : 1
        return (a.handle || a.pubkey).localeCompare(b.handle || b.pubkey)
      })
    } finally {
      try { swarm.destroy() } catch (_) {}
    }
  }

  async request ({ providerPubkey, input }) {
    const normalizedPubkey = normalizePubkey(providerPubkey)
    if (!/^[0-9a-f]{64}$/.test(normalizedPubkey)) throw new Error('Invalid provider')
    const validated = validateInput(input)
    const requestId = nowId()

    const tryLocalTcp = async () => {
      console.log('[inference] request via USB bridge', normalizedPubkey.slice(0, 8))
      return this.requestViaLocalTcp({ providerPubkey: normalizedPubkey, validated, requestId })
    }

    if (this.localTcpProviders.has(normalizedPubkey)) {
      try {
        return await tryLocalTcp()
      } catch (error) {
        const message = error?.message || String(error)
        if (!message.includes('did not respond') && !message.includes('bridge timed out')) throw error
      }
    }

    if (await this.resolveLocalTcpRoute(normalizedPubkey, 5000)) {
      return await tryLocalTcp()
    }

    const localPeer = await this.probeLocalProvider(2500)
    if (localPeer?.pubkey === normalizedPubkey) {
      return await tryLocalTcp()
    }

    console.log('[inference] request via DHT (USB bridge unavailable)', normalizedPubkey.slice(0, 8))
    const swarm = new Hyperswarm()

    return new Promise((resolve, reject) => {
      let settled = false
      const finishStart = (error, value) => {
        if (settled) return
        settled = true
        clearTimeout(connectTimer)
        if (error) {
          try { swarm.destroy() } catch (_) {}
          reject(error)
        } else {
          resolve(value)
        }
      }

      const connectTimer = setTimeout(
        () => finishStart(new Error(
          'Peer did not respond (DHT). For USB dev testing run: adb reverse tcp:39391 tcp:39391'
        )),
        20_000
      )

      swarm.on('connection', (socket) => {
        socket.on('error', () => {})
        this._activeRequestSocket = socket
        this._activeRequestSwarm = swarm
        attachJsonFramer(socket, (frame) => {
          this.handleRequesterFrame(frame, { requestId, providerPubkey: normalizedPubkey, finishStart })
        })

        writeJsonFrame(
          socket,
          buildInferenceRequestFrame(this.chat.identity, requestId, validated)
        )
      })

      swarm.join(directTopic(normalizedPubkey), { server: true, client: true })
    })
  }

  async requestViaLocalTcp ({ providerPubkey, validated, requestId }) {
    const socket = await connectLocalInferenceSocket(5000)

    return new Promise((resolve, reject) => {
      let settled = false
      const finishStart = (error, value) => {
        if (settled) return
        settled = true
        clearTimeout(connectTimer)
        if (error) {
          try { socket.destroy() } catch (_) {}
          reject(error)
        } else {
          resolve(value)
        }
      }

      const connectTimer = setTimeout(
        () => finishStart(new Error(
          'Peer did not respond (USB bridge). Run: adb reverse tcp:39391 tcp:39391 — keep stub terminal open.'
        )),
        20_000
      )

      this._activeRequestSocket = socket
      this._activeRequestSwarm = null
      attachJsonFramer(socket, (frame) => {
        this.handleRequesterFrame(frame, { requestId, providerPubkey, finishStart })
      })

      writeJsonFrame(
        socket,
        buildInferenceRequestFrame(this.chat.identity, requestId, validated)
      )
    })
  }

  cancelRequester (requestId) {
    const active = this.requesters.get(requestId)
    if (!active) return false
    try {
      writeJsonFrame(active.socket, signedFrame(this.chat.identity, 'inference-cancel', { requestId }))
    } catch (_) {}
    this.cleanupRequester(requestId)
    return true
  }

  cleanupRequester (requestId) {
    const active = this.requesters.get(requestId)
    if (!active) return
    clearTimeout(active.timer)
    try { active.swarm?.destroy() } catch (_) {}
    try { active.socket?.destroy?.() } catch (_) {}
    this.requesters.delete(requestId)
    this._activeRequestSocket = null
    this._activeRequestSwarm = null
  }

  emitRequesterEvent (event) {
    this.callbacks.onRequesterEvent?.(event)
  }

  destroy () {
    this.stopProvider()
    for (const requestId of this.requesters.keys()) this.cleanupRequester(requestId)
  }
}
