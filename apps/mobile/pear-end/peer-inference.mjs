import b4a from 'b4a'
import Hyperswarm from 'hyperswarm'
import {
  myPubkeyHex,
  signCanonical,
  topicFromLabel,
  verifyCanonical,
} from './crypto.mjs'
import { attachJsonFramer, writeJsonFrame } from './socket-framer.mjs'

const DIRECTORY_TOPIC = topicFromLabel('thetabet-peer-inference-directory-v1')
const DIRECT_TOPIC_PREFIX = 'thetabet-peer-inference-direct-v1:'
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const BROWSE_TIMEOUT_MS = 2500
const COOLDOWN_MS = 5000
const MAX_MARKETS = 80
const MAX_OUTCOMES = 20
const MAX_TEXT = 240

function nowId () {
  return Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 10)
}

function safeText (value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function directTopic (pubkey) {
  return topicFromLabel(DIRECT_TOPIC_PREFIX, b4a.from(pubkey, 'hex'))
}

function signedFrame (identity, type, payload) {
  const fromPubkey = myPubkeyHex(identity)
  const body = { type, fromPubkey, payload }
  return { ...body, signature: signCanonical(identity, body) }
}

function verifyFrame (frame, expectedType) {
  if (!frame || frame.type !== expectedType) return false
  if (!/^[0-9a-f]{64}$/i.test(frame.fromPubkey || '')) return false
  if (typeof frame.signature !== 'string') return false
  return verifyCanonical(
    frame.fromPubkey,
    { type: frame.type, fromPubkey: frame.fromPubkey, payload: frame.payload },
    frame.signature
  )
}

function validateInput (input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid inference input')
  const matchTitle = safeText(input.matchTitle)
  if (!matchTitle) throw new Error('Match title is required')
  if (!Array.isArray(input.markets) || input.markets.length === 0 || input.markets.length > MAX_MARKETS) {
    throw new Error('Invalid market list')
  }

  const markets = input.markets.map((market) => {
    if (!market || typeof market !== 'object') throw new Error('Invalid market')
    const conditionId = safeText(market.conditionId, 160)
    const conditionTitle = safeText(market.conditionTitle)
    if (!conditionId || !conditionTitle || !Array.isArray(market.outcomes)) {
      throw new Error('Invalid market')
    }
    if (market.outcomes.length === 0 || market.outcomes.length > MAX_OUTCOMES) {
      throw new Error('Invalid outcomes')
    }
    return {
      conditionId,
      conditionTitle,
      outcomes: market.outcomes.map((outcome) => {
        const outcomeId = safeText(outcome?.outcomeId, 160)
        const title = safeText(outcome?.title)
        const decimalOdds = Number(outcome?.decimalOdds)
        if (!outcomeId || !title || !Number.isFinite(decimalOdds) || decimalOdds <= 1) {
          throw new Error('Invalid outcome')
        }
        return {
          outcomeId,
          title,
          decimalOdds,
          rawOdds: typeof outcome.rawOdds === 'string' ? outcome.rawOdds.slice(0, 80) : outcome.rawOdds,
        }
      }),
    }
  })

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
    const directory = new Hyperswarm()
    const direct = new Hyperswarm()
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
    directory.on('connection', attach)
    direct.on('connection', attach)
    directory.join(DIRECTORY_TOPIC, { server: true, client: false })
    direct.join(directTopic(myPubkeyHex(this.chat.identity)), { server: true, client: false })
    this.providerSwarms = [directory, direct]
  }

  stopProvider () {
    for (const swarm of this.providerSwarms) {
      try { swarm.destroy() } catch (_) {}
    }
    this.providerSwarms = []
  }

  async handleProviderFrame (socket, frame) {
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

    if (!verifyFrame(frame, 'inference-request')) return
    const requestId = safeText(frame.payload?.requestId, 120)
    if (!requestId) return

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
      writeJsonFrame(socket, signedFrame(this.chat.identity, 'inference-rejected', {
        requestId,
        reason: this.enabled ? 'Peer is busy' : 'Peer is offline',
      }))
      return
    }

    const input = validateInput(frame.payload?.input)
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

  async browse (timeoutMs = BROWSE_TIMEOUT_MS) {
    const swarm = new Hyperswarm()
    const peers = new Map()
    swarm.on('connection', (socket) => {
      socket.on('error', () => {})
      attachJsonFramer(socket, (frame) => {
        if (!verifyFrame(frame, 'inference-presence')) return
        const peer = frame.payload
        if (!peer || peer.pubkey !== frame.fromPubkey || peer.pubkey === myPubkeyHex(this.chat.identity)) return
        peers.set(peer.pubkey, {
          pubkey: peer.pubkey,
          handle: safeText(peer.handle, 80) || null,
          avatarData: typeof peer.avatarData === 'string' ? peer.avatarData : null,
          status: peer.status === 'busy' ? 'busy' : 'available',
          updatedAt: Number(peer.updatedAt) || Date.now(),
        })
      })
      writeJsonFrame(socket, { type: 'inference-presence-query' })
    })
    const discovery = swarm.join(DIRECTORY_TOPIC, { server: false, client: true })
    try {
      await Promise.race([
        discovery.flushed(),
        new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 1200))),
      ])
      await new Promise((resolve) => setTimeout(resolve, timeoutMs))
      return [...peers.values()].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'available' ? -1 : 1
        return (a.handle || a.pubkey).localeCompare(b.handle || b.pubkey)
      })
    } finally {
      try { swarm.destroy() } catch (_) {}
    }
  }

  async request ({ providerPubkey, input }) {
    if (!/^[0-9a-f]{64}$/i.test(providerPubkey || '')) throw new Error('Invalid provider')
    const validated = validateInput(input)
    const requestId = nowId()
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
        () => finishStart(new Error('Peer did not respond')),
        12_000
      )

      swarm.on('connection', (socket) => {
        socket.on('error', () => {})
        attachJsonFramer(socket, (frame) => {
          if (!frame?.type?.startsWith('inference-') || !verifyFrame(frame, frame.type)) return
          if (frame.fromPubkey !== providerPubkey || frame.payload?.requestId !== requestId) return

          if (frame.type === 'inference-accepted') {
            this.requesters.set(requestId, {
              providerPubkey,
              socket,
              swarm,
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
            this.emitRequesterEvent({
              type: 'error',
              requestId,
              providerPubkey,
              message: frame.payload.message || 'Peer inference failed',
            })
            this.cleanupRequester(requestId)
          }
        })

        writeJsonFrame(socket, signedFrame(this.chat.identity, 'inference-request', {
          requestId,
          input: validated,
        }))
      })

      swarm.join(directTopic(providerPubkey), { server: false, client: true })
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
    try { active.swarm.destroy() } catch (_) {}
    this.requesters.delete(requestId)
  }

  emitRequesterEvent (event) {
    this.callbacks.onRequesterEvent?.(event)
  }

  destroy () {
    this.stopProvider()
    for (const requestId of this.requesters.keys()) this.cleanupRequester(requestId)
  }
}
