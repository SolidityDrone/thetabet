import fs from 'wdk-linked-bare-fs'
import path from 'bare-path'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'
import { identityToJson, loadOrCreateIdentity, saveIdentity, writeChatAvatarImage } from './identity.mjs'
import { createDmMixin } from './dm.mjs'
import { attachRoomTransport } from './room-transport.mjs'
import {
  assertVaultSendAllowed,
  isVaultChannel,
  isVaultWriterId,
  vaultChannelId,
  vaultChannelKeys,
  vaultDevWriterId,
  vaultOutboxKeyPair,
} from './vault-channel.mjs'
import { attachVaultPeerHandshake } from './vault-peer-handshake.mjs'

const DIRECTORY_FILE = 'channels.json'
const PROFILE_FILE = 'tipster-profile.json'
const ANNOUNCED_HANDLE_FILE = 'announced-handle.json'
const PRESENCE_PREFIX = '__PRESENCE__:'
const SWARM_FLUSH_MS = 6000
const CORE_UPDATE_MS = 8000
const VAULT_UPDATE_MS = 2000
const DEFAULT_PRESENCE_MAX_AGE_MS = 120000
const PUBLIC_TOPIC = crypto.hash(b4a.from('thetabet-global-public-v1'))
const PUBLIC_TOPIC_HEX = b4a.toString(PUBLIC_TOPIC, 'hex')
const PUBLIC_CHANNEL_ID = PUBLIC_TOPIC_HEX.slice(0, 16)

function promiseWithTimeout (promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label + ' timed out after ' + timeoutMs + 'ms')), timeoutMs)
    }),
  ])
}

export class PearChat {
  constructor (storagePath, onMessage, onContactsChanged) {
    this.storagePath = path.join(storagePath, 'pear-end')
    this.onMessage = onMessage
    this.onContactsChanged = onContactsChanged
    this.channels = new Map()
    this.directory = []
    this.identity = null
    this.store = null
    this.swarm = null
    this.contactSwarm = null
    this.tipsterProfile = null
    this.registeredHandle = null
    this.contacts = { pendingIncoming: [], pendingOutgoing: [], accepted: [] }
    this.handleDiscovery = null
    this.contactDiscovery = null
    Object.assign(this, createDmMixin(this))
    this.ready = this.init()
  }

  async init () {
    fs.mkdirSync(this.storagePath, { recursive: true })
    this.identity = loadOrCreateIdentity(this.storagePath)
    this.store = new Corestore(this.storagePath)

    try {
      await this.store.ready()
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      if (message.indexOf('could not be locked') !== -1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        this.store = new Corestore(this.storagePath)
        await this.store.ready()
      } else {
        throw error
      }
    }
    this.swarm = new Hyperswarm()
    this.contactSwarm = new Hyperswarm()

    this.swarm.on('connection', (socket) => {
      socket.on('error', () => {})
      this.store.replicate(socket, { live: true })
    })

    this.store.watch((core) => {
      this._onStoreCoreOpened(core).catch(() => {})
    })

    this.loadDirectory()
    this._ensurePublicChannelRecord()
    this.loadProfile()
    this.loadAnnouncedHandle()
    this.loadContacts()
    await this.ensureContactListener()

    // Attach saved channels in the background — never block boot on DHT flush.
    for (const channel of this.directory) {
      const attach =
        channel.kind === 'dm'
          ? this.attachDmChannel(channel)
          : channel.kind === 'vault'
            ? this.attachVaultChannel(channel, false)
            : channel.canonicalPublic
              ? this.attachPublicChannel(channel)
            : this.attachChannel(channel, false)
      attach.catch((error) => {
        console.error('pear-end attachChannel failed', channel.id, error)
      })
    }

    if (this.registeredHandle) {
      this.announceHandle(this.registeredHandle).catch((error) => {
        console.error('pear-end announceHandle failed', error)
      })
    }
  }

  loadDirectory () {
    const directoryPath = path.join(this.storagePath, DIRECTORY_FILE)
    if (!fs.existsSync(directoryPath)) {
      this.directory = []
      return
    }
    this.directory = JSON.parse(fs.readFileSync(directoryPath, 'utf8'))
  }

  saveDirectory () {
    const directoryPath = path.join(this.storagePath, DIRECTORY_FILE)
    fs.writeFileSync(directoryPath, JSON.stringify(this.directory, null, 2))
  }

  loadProfile () {
    const profilePath = path.join(this.storagePath, PROFILE_FILE)
    if (!fs.existsSync(profilePath)) {
      this.tipsterProfile = null
      return
    }
    this.tipsterProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
  }

  loadAnnouncedHandle () {
    const announcedPath = path.join(this.storagePath, ANNOUNCED_HANDLE_FILE)
    if (!fs.existsSync(announcedPath)) {
      this.registeredHandle = null
      return
    }
    const raw = JSON.parse(fs.readFileSync(announcedPath, 'utf8'))
    this.registeredHandle = raw.handle || null
  }

  saveAnnouncedHandle () {
    const announcedPath = path.join(this.storagePath, ANNOUNCED_HANDLE_FILE)
    fs.writeFileSync(
      announcedPath,
      JSON.stringify({ handle: this.registeredHandle, updatedAt: Date.now() }, null, 2)
    )
  }

  saveProfile () {
    const profilePath = path.join(this.storagePath, PROFILE_FILE)
    if (!this.tipsterProfile) return
    fs.writeFileSync(profilePath, JSON.stringify(this.tipsterProfile, null, 2))
  }

  channelSummary (channel) {
    return {
      id: channel.id,
      kind: channel.kind || 'channel',
      name: channel.name,
      topicKey: channel.topicKey,
      coreKey: channel.coreKey,
      ownerPubkey: channel.ownerPubkey,
      peerPubkey: channel.peerPubkey || null,
      peerHandle: channel.peerHandle || null,
      peerAvatarData: channel.peerAvatarData || null,
      isPrivate: channel.isPrivate,
      canonicalPublic: Boolean(channel.canonicalPublic),
      createdAt: channel.createdAt,
      vaultAddress: channel.vaultAddress || null,
      tipsterAddress: channel.tipsterAddress || null,
      minShares: channel.minShares || null,
      devBypassTag: channel.devBypassTag || null,
    }
  }

  async getIdentity () {
    await this.ready
    return identityToJson(this.identity, this.registeredHandle)
  }

  async setChatAvatar (payload = {}) {
    await this.ready
    writeChatAvatarImage(this.storagePath, this.identity, payload)
    saveIdentity(this.storagePath, this.identity)
    return this.getIdentity()
  }

  async getTipsterProfile () {
    await this.ready
    return this.tipsterProfile
  }

  async setTipsterProfile (profile) {
    await this.ready
    this.tipsterProfile = {
      displayName: profile.displayName,
      bio: profile.bio || '',
      walletAddress: profile.walletAddress || null,
      publicChannelId: profile.publicChannelId || null,
      privateChannelId: profile.privateChannelId || null,
      createdAt: profile.createdAt || Date.now(),
    }
    this.saveProfile()
    return this.tipsterProfile
  }

  async listChannels () {
    await this.ready
    return this.directory.map((channel) => this.channelSummary(channel))
  }

  async createVaultChannel ({ name, vaultAddress, tipsterAddress, minShares }) {
    await this.ready
    const keys = vaultChannelKeys(vaultAddress)
    const id = vaultChannelId(vaultAddress)
    const existing = this.directory.find((entry) => entry.id === id)
    if (existing) {
      if (!existing.devBypassTag) {
        existing.devBypassTag = b4a.toString(crypto.randomBytes(16), 'hex')
        this.saveDirectory()
      }
      await this.attachVaultChannel(existing, true)
      return this.channelSummary(existing)
    }

    const channel = {
      id,
      kind: 'vault',
      name: name || 'Vault chat',
      topicKey: keys.topicKey,
      vaultAddress: keys.vaultAddress,
      tipsterAddress: String(tipsterAddress || '').trim().toLowerCase(),
      minShares: String(minShares ?? 1),
      devBypassTag: b4a.toString(crypto.randomBytes(16), 'hex'),
      ownerPubkey: b4a.toString(this.identity.publicKey, 'hex'),
      isPrivate: true,
      createdAt: Date.now(),
    }

    this.directory.push(channel)
    this.saveDirectory()
    await this.attachVaultChannel(channel, true)
    return this.channelSummary(channel)
  }

  async joinVaultChannel ({ vaultAddress, tipsterAddress, name, minShares, devBypassTag }) {
    await this.ready
    const keys = vaultChannelKeys(vaultAddress)
    const id = vaultChannelId(vaultAddress)
    let channel = this.directory.find((entry) => entry.id === id)

    if (!channel) {
      channel = {
        id,
        kind: 'vault',
        name: name || 'Vault chat',
        topicKey: keys.topicKey,
        vaultAddress: keys.vaultAddress,
        tipsterAddress: String(tipsterAddress || '').trim().toLowerCase(),
        minShares: String(minShares ?? 1),
        devBypassTag: devBypassTag || null,
        ownerPubkey: 'unknown',
        isPrivate: true,
        createdAt: Date.now(),
      }
      this.directory.push(channel)
      this.saveDirectory()
    } else if (devBypassTag && !channel.devBypassTag) {
      channel.devBypassTag = devBypassTag
      this.saveDirectory()
    }

    await this.attachVaultChannel(channel, true)
    return {
      channel: this.channelSummary(channel),
      history: await this.getHistory(channel.id),
    }
  }

  async createChannel ({ name, isPrivate }) {
    await this.ready
    if (isPrivate) {
      throw new Error('Private rooms were replaced by encrypted direct messages')
    }
    const channel = this._ensurePublicChannelRecord()
    await this.attachPublicChannel(channel)
    return this.channelSummary(channel)
  }

  _ensurePublicChannelRecord () {
    let channel = this.directory.find((entry) => entry.id === PUBLIC_CHANNEL_ID)
    if (channel) return channel

    channel = {
      id: PUBLIC_CHANNEL_ID,
      kind: 'channel',
      name: 'Public',
      topicKey: PUBLIC_TOPIC_HEX,
      ownerPubkey: 'global',
      isPrivate: false,
      canonicalPublic: true,
      createdAt: 0,
    }
    this.directory.push(channel)
    this.saveDirectory()
    return channel
  }

  async attachPublicChannel (channel) {
    if (this.channels.has(channel.id)) return
    const core = this.store.get({ name: 'global-public-history-v1' })
    await core.ready()
    const runtime = { core, kind: 'public', seen: new Set(), livePeerCount: 0 }

    const emitAt = async (index) => {
      try {
        const raw = await core.get(index)
        if (!raw) return
        const message = JSON.parse(b4a.toString(raw))
        runtime.seen.add(message.id)
        if (this.onMessage) this.onMessage(message)
      } catch (_) {}
    }
    core.on('append', () => { emitAt(core.length - 1).catch(() => {}) })

    runtime.transport = attachRoomTransport({
      topicHex: channel.topicKey,
      roomId: channel.id,
      onPeerCount: (count) => { runtime.livePeerCount = count },
      onMessage: (message) => {
        if (!message?.id || runtime.seen.has(message.id)) return
        runtime.seen.add(message.id)
        core.append(b4a.from(JSON.stringify(message))).catch(() => {})
      },
    })
    this.channels.set(channel.id, runtime)
  }

  async getPublicHistory (channelId) {
    const runtime = await this.ensureRuntime(channelId)
    if (!runtime || runtime.kind !== 'public') return []
    const messages = []
    for (let index = 0; index < runtime.core.length; index++) {
      try {
        const raw = await runtime.core.get(index)
        if (!raw) continue
        const message = JSON.parse(b4a.toString(raw))
        runtime.seen.add(message.id)
        messages.push(message)
      } catch (_) {}
    }
    return messages.sort((a, b) => a.timestamp - b.timestamp)
  }

  async sendPublicMessage (channel, runtime, text) {
    const message = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2, 8),
      channelId: channel.id,
      kind: 'channel',
      author: this.registeredHandle ? '@' + this.registeredHandle : this.identity.handle,
      authorPubkey: b4a.toString(this.identity.publicKey, 'hex'),
      avatarData: this.identity.avatarData || null,
      text,
      timestamp: Date.now(),
    }
    runtime.seen.add(message.id)
    await runtime.core.append(b4a.from(JSON.stringify(message)))
    runtime.transport.broadcast(message)
    return message
  }

  async createLegacyChannel ({ name, isPrivate }) {
    const topicKey = crypto.randomBytes(32)
    const topicHex = b4a.toString(topicKey, 'hex')
    const channel = {
      id: topicHex.slice(0, 16),
      kind: 'channel',
      name,
      topicKey: topicHex,
      ownerPubkey: b4a.toString(this.identity.publicKey, 'hex'),
      isPrivate: Boolean(isPrivate),
      createdAt: Date.now(),
    }

    this.directory.push(channel)
    this.saveDirectory()
    await this.attachChannel(channel, true)
    return this.channelSummary(channel)
  }

  async joinChannel ({ topicKey, name }) {
    await this.ready
    const normalized = topicKey.trim().toLowerCase()
    const existing = this.directory.find((channel) => channel.topicKey === normalized)
    if (existing) {
      await this.attachChannel(existing, true)
      return {
        channel: this.channelSummary(existing),
        history: await this.getHistory(existing.id),
      }
    }

    const channel = {
      id: normalized.slice(0, 16),
      kind: 'channel',
      name: name || ('Joined ' + normalized.slice(0, 8)),
      topicKey: normalized,
      ownerPubkey: 'unknown',
      isPrivate: true,
      createdAt: Date.now(),
    }

    this.directory.push(channel)
    this.saveDirectory()
    await this.attachChannel(channel, true)
    return {
      channel: this.channelSummary(channel),
      history: await this.getHistory(channel.id),
    }
  }

  async ensureRuntime (channelId) {
    await this.ready
    let runtime = this.channels.get(channelId)
    if (runtime) return runtime

    const channel = this.directory.find((entry) => entry.id === channelId)
    if (!channel) return null

    if (channel.kind === 'dm') {
      await this.attachDmChannel(channel)
      return this.channels.get(channelId) ?? null
    }

    if (channel.kind === 'vault') {
      await this.attachVaultChannel(channel, false)
      return this.channels.get(channelId) ?? null
    }
    if (channel.canonicalPublic) {
      await this.attachPublicChannel(channel)
      return this.channels.get(channelId) ?? null
    }

    await this.attachChannel(channel, false)
    return this.channels.get(channelId) ?? null
  }

  async getHistory (channelId) {
    await this.ready
    const channel = this.directory.find((entry) => entry.id === channelId)
    if (channel?.kind === 'dm') {
      return this.getDmHistory(channelId)
    }
    if (channel?.kind === 'vault') {
      return this._readVaultHistory(channelId)
    }
    if (channel?.canonicalPublic) {
      return this.getPublicHistory(channelId)
    }
    const runtime = await this.ensureRuntime(channelId)
    if (!runtime) return []

    try {
      await promiseWithTimeout(runtime.core.update(), CORE_UPDATE_MS, 'core.update')
    } catch (error) {
      console.error('pear-end core.update skipped', channelId, error)
    }

    const history = []
    for (let index = 0; index < runtime.core.length; index++) {
      const raw = runtime.core.get(index)
      try {
        history.push(JSON.parse(b4a.toString(raw)))
      } catch (e) {}
    }
    return history
  }

  async _openVaultOutbox (vaultAddress, writerPubkeyHex) {
    const pair = vaultOutboxKeyPair(vaultAddress, writerPubkeyHex)
    const core = this.store.get({ keyPair: pair })
    await core.ready()
    return core
  }

  async _emitVaultFeedMessage (feed, channelId, index) {
    try {
      const raw = await feed.get(index)
      if (!raw) return
      const message = JSON.parse(b4a.toString(raw))
      if (
        channelId &&
        message.channelId &&
        message.channelId.toLowerCase() !== channelId.toLowerCase()
      ) {
        return
      }
      if (this.onMessage) this.onMessage(message)
    } catch (_) {}
  }

  async _replayVaultFeed (feed, channelId) {
    if (!feed || feed.closing) return
    if (feed._pearVaultReplayPromise) return feed._pearVaultReplayPromise

    feed._pearVaultReplayPromise = (async () => {
      let index = feed._pearVaultReplayedIndex || 0
      while (index < feed.length) {
        await this._emitVaultFeedMessage(feed, channelId, index)
        index++
        feed._pearVaultReplayedIndex = index
      }
    })()

    try {
      await feed._pearVaultReplayPromise
    } finally {
      feed._pearVaultReplayPromise = null
    }
  }

  _attachVaultFeedListener (feed, channelId) {
    if (!feed._pearVaultListener) {
      feed._pearVaultListener = true
      const self = this
      const cid = channelId
      feed.on('append', function () {
        self._replayVaultFeed(feed, cid).catch(() => {})
      })
    }
    this._replayVaultFeed(feed, channelId).catch(() => {})
  }

  async _resyncVaultChannelsOnPeer () {
    for (const [channelId, runtime] of this.channels) {
      const channel = this.directory.find((entry) => entry.id === channelId)
      if (!channel || channel.kind !== 'vault') continue
      await this._ensureVaultFeeds(runtime, channel)
      for (const feed of runtime.feeds.values()) {
        await this._updateVaultFeed(feed, 'peer-resync')
        await this._replayVaultFeed(feed, channel.id)
      }
    }
  }

  _registerVaultWriter (runtime, writerPubkey) {
    if (!runtime.knownWriters) runtime.knownWriters = new Set()
    const pk = String(writerPubkey || '').trim().toLowerCase()
    if (!isVaultWriterId(pk)) return
    runtime.knownWriters.add(pk)
  }

  _recordVaultPeer (runtime, message) {
    if (!message?.authorPubkey) return
    if (!runtime.recentPeers) runtime.recentPeers = new Map()
    runtime.recentPeers.set(message.authorPubkey, {
      author: message.author || message.authorPubkey.slice(0, 8),
      authorPubkey: message.authorPubkey,
      wallet: message.wallet || null,
      role: message.gateBypass ? 'dev' : message.wallet ? 'investor' : 'peer',
      lastSeen: message.timestamp || Date.now(),
    })
  }

  async _updateVaultFeed (feed, label) {
    if (!feed || feed.closing) return
    const stopFinding = this.store.findingPeers()
    try {
      await promiseWithTimeout(feed.update(), VAULT_UPDATE_MS, label || 'vault.feed.update')
    } catch (_) {
      // Live replication and the direct vault socket continue in the background.
    } finally {
      stopFinding()
    }
  }

  async _scanStorageVaultCores (runtime, channel) {
    try {
      const stream = this.store.list()
      if (!stream) return
      for await (const discoveryKey of stream) {
        try {
          const core = this.store.get({ discoveryKey })
          await core.ready()
          await this._tryAttachVaultCore(runtime, channel, core)
        } catch (_) {}
      }
    } catch (error) {
      console.error('pear-end vault storage scan skipped', channel.id, error)
    }
  }

  async _onRemoteVaultWriter (channelId, writerPubkey) {
    const channel = this.directory.find((entry) => entry.id === channelId)
    const runtime = this.channels.get(channelId)
    if (!channel || !runtime || channel.kind !== 'vault') return

    this._registerVaultWriter(runtime, writerPubkey)
    const feed = await this._openVaultOutbox(channel.vaultAddress, writerPubkey)
    const dk = b4a.toString(feed.discoveryKey, 'hex')
    if (!runtime.feeds.has(dk)) {
      runtime.feeds.set(dk, feed)
      this._attachVaultFeedListener(feed, channelId)
    }
    await this._updateVaultFeed(feed, 'remote-outbox')
    this._replayVaultFeed(feed, channelId)
  }

  async _onStoreCoreOpened (core) {
    for (const [channelId, runtime] of this.channels) {
      const channel = this.directory.find((entry) => entry.id === channelId)
      if (!channel || channel.kind !== 'vault') continue
      await this._tryAttachVaultCore(runtime, channel, core)
    }
  }

  async _tryAttachVaultCore (runtime, channel, core) {
    if (!core || core.closing) return
    await core.ready()
    if (core.length === 0) return

    let sample = null
    for (let index = core.length - 1; index >= 0; index--) {
      try {
        const raw = await core.get(index)
        if (!raw) continue
        sample = JSON.parse(b4a.toString(raw))
        break
      } catch (_) {}
    }
    if (!sample) return
    if (sample.vaultAddress && sample.vaultAddress.toLowerCase() !== channel.vaultAddress.toLowerCase()) return
    if (sample.channelId && sample.channelId.toLowerCase() !== channel.id.toLowerCase()) return

    const dk = b4a.toString(core.discoveryKey, 'hex')
    if (!runtime.feeds.has(dk)) {
      runtime.feeds.set(dk, core)
      this._attachVaultFeedListener(core, channel.id)
    }
    if (sample.authorPubkey) {
      this._registerVaultWriter(runtime, sample.authorPubkey)
      await this._openVaultOutbox(channel.vaultAddress, sample.authorPubkey)
    }
  }

  async _scanStoreVaultCores (runtime, channel) {
    if (!this.store.cores) return
    for (const core of this.store.cores) {
      await this._tryAttachVaultCore(runtime, channel, core)
    }
  }

  async _ensureVaultPeerDiscovery (runtime, channel) {
    if (runtime.peerHandshake) return

    const channelId = channel.id
    const myPk = b4a.toString(this.identity.publicKey, 'hex')
    runtime.peerHandshake = attachVaultPeerHandshake({
      vaultAddress: channel.vaultAddress,
      writerId: myPk,
      onRemoteWriter: (pk) => {
        this._onRemoteVaultWriter(channelId, pk).catch((error) => {
          console.error('pear-end vault peer writer attach failed', channelId, pk.slice(0, 8), error)
        })
      },
      onMessage: (message) => {
        this._onRemoteVaultMessage(channelId, message).catch((error) => {
          console.error('pear-end direct vault message failed', channelId, error)
        })
      },
      onPeerCount: (count) => {
        runtime.livePeerCount = count
      },
    })

    this._registerVaultWriter(runtime, myPk)
    try {
      await promiseWithTimeout(runtime.peerHandshake.flushed(), SWARM_FLUSH_MS, 'vault-peer.flushed')
    } catch (error) {
      console.error('pear-end vault peer discovery skipped', channel.id, error)
    }
  }

  async _hasVaultMessage (runtime, messageId) {
    if (!messageId) return false
    for (const feed of runtime.feeds.values()) {
      for (let index = feed.length - 1; index >= 0; index--) {
        try {
          const raw = await feed.get(index)
          if (!raw) continue
          const message = JSON.parse(b4a.toString(raw))
          if (message.id === messageId) return true
        } catch (_) {}
      }
    }
    return false
  }

  async _onRemoteVaultMessage (channelId, message) {
    const channel = this.directory.find((entry) => entry.id === channelId)
    const runtime = this.channels.get(channelId)
    if (!channel || !runtime || channel.kind !== 'vault' || !message) return
    if (!message.id || !message.text || !message.authorPubkey) return
    if (String(message.channelId || '').toLowerCase() !== channelId.toLowerCase()) return
    if (
      message.vaultAddress &&
      message.vaultAddress.toLowerCase() !== channel.vaultAddress.toLowerCase()
    ) {
      return
    }

    assertVaultSendAllowed(channel, message)
    if (await this._hasVaultMessage(runtime, message.id)) return

    this._registerVaultWriter(runtime, message.authorPubkey)
    this._recordVaultPeer(runtime, message)
    const outbox = await this._ensureWritableOutbox(runtime, channel)
    await outbox.append(b4a.from(JSON.stringify(message)))
  }

  async _ensureWritableOutbox (runtime, channel) {
    if (runtime.outbox && !runtime.outbox.closing) return runtime.outbox

    const myPk = b4a.toString(this.identity.publicKey, 'hex')
    runtime.outbox = await this._openVaultOutbox(channel.vaultAddress, myPk)
    if (!runtime.feeds) runtime.feeds = new Map()
    const dk = b4a.toString(runtime.outbox.discoveryKey, 'hex')
    runtime.feeds.set(dk, runtime.outbox)
    this._attachVaultFeedListener(runtime.outbox, channel.id)
    return runtime.outbox
  }

  async _ensureVaultFeeds (runtime, channel) {
    await this._ensureWritableOutbox(runtime, channel)
    await this._ensureVaultPeerDiscovery(runtime, channel)
    if (!runtime.feeds) runtime.feeds = new Map()

    if (!runtime.legacyLoaded) {
      runtime.legacyLoaded = true
      try {
        const legacyPair = vaultChannelKeys(channel.vaultAddress).coreKeyPair
        const legacy = this.store.get({ keyPair: legacyPair })
        await legacy.ready()
        if (legacy.length > 0) {
          runtime.legacyCore = legacy
          runtime.feeds.set('legacy:' + b4a.toString(legacy.discoveryKey, 'hex'), legacy)
        }
      } catch (error) {
        console.error('pear-end legacy vault core skipped', channel.id, error)
      }
    }

    const authors = new Set([b4a.toString(this.identity.publicKey, 'hex')])
    if (channel.devBypassTag) {
      try {
        authors.add(vaultDevWriterId(channel.devBypassTag))
      } catch (_) {}
    }
    if (runtime.knownWriters) {
      for (const pk of runtime.knownWriters) authors.add(pk)
    }
    if (runtime.peerHandshake?.known) {
      for (const pk of runtime.peerHandshake.known) authors.add(pk)
    }

    for (const feed of runtime.feeds.values()) {
      await this._updateVaultFeed(feed, 'known-feed')
      for (let i = 0; i < feed.length; i++) {
        try {
          const raw = await feed.get(i)
          if (!raw) continue
          const msg = JSON.parse(b4a.toString(raw))
          if (msg.authorPubkey) authors.add(msg.authorPubkey)
        } catch (_) {}
      }
    }

    await this._scanStoreVaultCores(runtime, channel)
    await this._scanStorageVaultCores(runtime, channel)

    for (const authorPubkey of authors) {
      const feed = await this._openVaultOutbox(channel.vaultAddress, authorPubkey)
      const dk = b4a.toString(feed.discoveryKey, 'hex')
      if (!runtime.feeds.has(dk)) {
        runtime.feeds.set(dk, feed)
        this._attachVaultFeedListener(feed, channel.id)
      }
      await this._updateVaultFeed(feed, 'author-' + authorPubkey.slice(0, 8))
      await this._replayVaultFeed(feed, channel.id)
    }

    return runtime.feeds
  }

  async _readVaultHistory (channelId) {
    const channel = this.directory.find((entry) => entry.id === channelId)
    const runtime = await this.ensureRuntime(channelId)
    if (!channel || !runtime) return []

    // Direct vault messages are mirrored into the local writable outbox.
    // Avoid network/storage discovery here so history RPC remains responsive.
    await this._ensureWritableOutbox(runtime, channel)
    if (!runtime.peerHandshake) {
      this._ensureVaultPeerDiscovery(runtime, channel).catch(() => {})
    }

    const messages = []
    const seen = new Set()
    for (const feed of runtime.feeds.values()) {
      for (let i = 0; i < feed.length; i++) {
        try {
          const raw = await feed.get(i)
          if (!raw) continue
          const msg = JSON.parse(b4a.toString(raw))
          if (msg.channelId && msg.channelId.toLowerCase() !== channelId.toLowerCase()) continue
          if (msg.id && seen.has(msg.id)) continue
          if (msg.id) seen.add(msg.id)
          messages.push(msg)
        } catch (_) {}
      }
    }

    return messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  }

  _isVaultSystemText (text) {
    return !text || text.indexOf('__KEY_SHARE__:') === 0 || text.indexOf(PRESENCE_PREFIX) === 0
  }

  async sendMessage ({ channelId, text, wallet, walletSignature, sharesSnapshot, signedAt, gateBypass }) {
    await this.ready
    const channel = this.directory.find((entry) => entry.id === channelId)
    if (channel?.kind === 'dm') {
      return this.sendDmMessage({ dmId: channelId, text })
    }
    const runtime = await this.ensureRuntime(channelId)
    if (!runtime) throw new Error('Channel not found: ' + channelId)

    if (channel?.canonicalPublic) {
      return this.sendPublicMessage(channel, runtime, text)
    }

    assertVaultSendAllowed(channel, {
      wallet,
      walletSignature,
      sharesSnapshot,
      signedAt,
      gateBypass,
    })

    const message = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2, 8),
      channelId,
      author: this.registeredHandle || this.identity.handle,
      authorPubkey: b4a.toString(this.identity.publicKey, 'hex'),
      avatarData: this.identity.avatarData || null,
      text,
      timestamp: Date.now(),
    }

    if (isVaultChannel(channel)) {
      message.vaultAddress = channel.vaultAddress
      if (gateBypass && gateBypass === channel.devBypassTag) {
        message.gateBypass = gateBypass
        message.author = 'console:dev'
      } else {
        message.wallet = wallet
        message.walletSignature = walletSignature
        message.sharesSnapshot = sharesSnapshot
        message.signedAt = signedAt
      }

      const outbox = await this._ensureWritableOutbox(runtime, channel)
      await this._ensureVaultPeerDiscovery(runtime, channel)
      await outbox.append(b4a.from(JSON.stringify(message)))
      this._recordVaultPeer(runtime, message)
      runtime.peerHandshake.broadcastMessage(message)
      return message
    }

    try {
      await promiseWithTimeout(runtime.core.update(), CORE_UPDATE_MS, 'core.update')
    } catch (error) {
      console.error('pear-end send core.update skipped', channelId, error)
    }

    await runtime.core.append(b4a.from(JSON.stringify(message)))
    return message
  }

  async pingChannelPresence ({ channelId, wallet, role, label }) {
    await this.ready
    const channel = this.directory.find((entry) => entry.id === channelId)
    const runtime = await this.ensureRuntime(channelId)
    if (!runtime || !channel || channel.kind !== 'vault') {
      throw new Error('Vault channel not found: ' + channelId)
    }

    if (!runtime.peerHandshake) {
      this._ensureVaultPeerDiscovery(runtime, channel).catch(() => {})
    }

    const pubkeyHex = b4a.toString(this.identity.publicKey, 'hex')
    return {
      author: label || this.registeredHandle || ('peer:' + pubkeyHex.slice(0, 8)),
      authorPubkey: pubkeyHex,
      wallet: wallet || null,
      role: role || null,
      lastSeen: Date.now(),
    }
  }

  async getChannelOnline ({ channelId, maxAgeMs = DEFAULT_PRESENCE_MAX_AGE_MS }) {
    await this.ready
    const channel = this.directory.find((entry) => entry.id === channelId)
    const runtime = await this.ensureRuntime(channelId)
    if (!runtime || !channel || channel.kind !== 'vault') return []

    const cutoff = Date.now() - maxAgeMs
    const peers = new Map()
    const myPk = b4a.toString(this.identity.publicKey, 'hex')

    peers.set(myPk, {
      author: this.registeredHandle || ('peer:' + myPk.slice(0, 8)),
      authorPubkey: myPk,
      wallet: null,
      role: 'local',
      lastSeen: Date.now(),
    })

    if (runtime.livePeerCount > 0 && runtime.knownWriters) {
      let remaining = runtime.livePeerCount
      for (const writer of runtime.knownWriters) {
        if (writer === myPk || remaining <= 0) continue
        peers.set(writer, {
          author: writer.startsWith('dev:') ? 'console:dev' : 'peer:' + writer.slice(0, 8),
          authorPubkey: writer,
          wallet: null,
          role: writer.startsWith('dev:') ? 'dev' : 'peer',
          lastSeen: Date.now(),
        })
        remaining--
      }
    }

    if (runtime.recentPeers) {
      for (const [pubkey, peer] of runtime.recentPeers) {
        if (peer.lastSeen >= cutoff) peers.set(pubkey, peer)
      }
    }

    return Array.from(peers.values()).sort((a, b) => b.lastSeen - a.lastSeen)
  }

  async shareChannelKey ({ channelId, peerPubkey }) {
    await this.ready
    const channel = this.directory.find((entry) => entry.id === channelId)
    if (!channel) throw new Error('Channel not found: ' + channelId)
    if (!channel.isPrivate) throw new Error('Only private channels can share keys')

    const payload = {
      type: 'channel-key-share',
      channelId: channel.id,
      channelName: channel.name,
      topicKey: channel.topicKey,
      fromPubkey: b4a.toString(this.identity.publicKey, 'hex'),
      toPubkey: peerPubkey,
      timestamp: Date.now(),
    }

    const publicChannel = this.directory.find((entry) => !entry.isPrivate)
    if (!publicChannel) {
      throw new Error('Create a public channel before sharing private keys')
    }

    return this.sendMessage({
      channelId: publicChannel.id,
      text: '__KEY_SHARE__:' + JSON.stringify(payload),
    })
  }

  async receiveChannelKey ({ topicKey, name, fromPubkey }) {
    await this.ready
    const shortFrom = fromPubkey ? fromPubkey.slice(0, 8) : 'peer'
    const result = await this.joinChannel({
      topicKey,
      name: name || ('Private from ' + shortFrom),
    })
    return result.channel
  }

  async attachChannel (channel, announce) {
    if (this.channels.has(channel.id)) return

    const core = this.store.get({ name: 'channel-' + channel.id })
    await core.ready()
    channel.coreKey = JSON.stringify({
      publicKey: b4a.toString(core.keyPair.publicKey, 'hex'),
      secretKey: b4a.toString(core.keyPair.secretKey, 'hex'),
    })

    const discovery = this.swarm.join(b4a.from(channel.topicKey, 'hex'), {
      server: announce && !channel.isPrivate,
      client: true,
    })

    if (announce && !channel.isPrivate) {
      try {
        await promiseWithTimeout(discovery.flushed(), SWARM_FLUSH_MS, 'discovery.flushed')
      } catch (error) {
        console.error('pear-end discovery.flushed skipped', channel.id, error)
      }
    }

    const self = this
    core.on('append', function () {
      const raw = core.get(core.length - 1)
      try {
        const message = JSON.parse(b4a.toString(raw))
        if (message.text && message.text.indexOf('__KEY_SHARE__:') === 0) {
          const payload = JSON.parse(message.text.slice('__KEY_SHARE__:'.length))
          const myPubkey = b4a.toString(self.identity.publicKey, 'hex')
          if (payload.toPubkey === myPubkey || payload.toPubkey === '*') {
            self.receiveChannelKey({
              topicKey: payload.topicKey,
              name: payload.channelName,
              fromPubkey: payload.fromPubkey,
            }).catch(function () {})
          }
        }
        if (self.onMessage) self.onMessage(message)
      } catch (e) {}
    })

    this.channels.set(channel.id, { core, discovery })
  }

  async attachVaultChannel (channel, announce) {
    const keys = vaultChannelKeys(channel.vaultAddress)
    channel.topicKey = keys.topicKey

    let runtime = this.channels.get(channel.id)
    if (!runtime) {
      runtime = {
        feeds: new Map(),
        vaultAddress: channel.vaultAddress,
        channelId: channel.id,
      }
      this.channels.set(channel.id, runtime)
    }

    await this._ensureWritableOutbox(runtime, channel)
    await this._ensureVaultPeerDiscovery(runtime, channel)
    await this._ensureVaultDiscovery(runtime, channel)

    channel.coreKey = JSON.stringify({
      publicKey: b4a.toString(runtime.outbox.keyPair.publicKey, 'hex'),
      secretKey: b4a.toString(runtime.outbox.keyPair.secretKey, 'hex'),
    })
  }

  async _ensureVaultDiscovery (runtime, channel) {
    if (runtime.discovery) return

    runtime.discovery = this.swarm.join(b4a.from(channel.topicKey, 'hex'), {
      server: true,
      client: true,
    })
    runtime.announced = true

    try {
      await promiseWithTimeout(runtime.discovery.flushed(), SWARM_FLUSH_MS, 'discovery.flushed')
    } catch (error) {
      console.error('pear-end vault discovery.flushed skipped', channel.id, error)
    }
  }
}
