import fs from 'bare-fs'
import path from 'bare-path'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'
import { identityToJson, loadOrCreateIdentity } from './identity.mjs'
import { createDmMixin } from './dm.mjs'

const DIRECTORY_FILE = 'channels.json'
const PROFILE_FILE = 'tipster-profile.json'
const ANNOUNCED_HANDLE_FILE = 'announced-handle.json'
const SWARM_FLUSH_MS = 6000
const CORE_UPDATE_MS = 8000

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
    this.swarm = new Hyperswarm()
    this.contactSwarm = new Hyperswarm()

    this.swarm.on('connection', (socket) => {
      this.store.replicate(socket, { live: true })
    })

    await this.store.ready()
    this.loadDirectory()
    this.loadProfile()
    this.loadAnnouncedHandle()
    this.loadContacts()
    await this.ensureContactListener()

    // Attach saved channels in the background — never block boot on DHT flush.
    for (const channel of this.directory) {
      const attach = channel.kind === 'dm' ? this.attachDmChannel(channel) : this.attachChannel(channel, false)
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
      ownerPubkey: channel.ownerPubkey,
      peerPubkey: channel.peerPubkey || null,
      peerHandle: channel.peerHandle || null,
      isPrivate: channel.isPrivate,
      createdAt: channel.createdAt,
    }
  }

  async getIdentity () {
    await this.ready
    return identityToJson(this.identity, this.registeredHandle)
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

  async createChannel ({ name, isPrivate }) {
    await this.ready
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

    await this.attachChannel(channel, false)
    return this.channels.get(channelId) ?? null
  }

  async getHistory (channelId) {
    await this.ready
    const channel = this.directory.find((entry) => entry.id === channelId)
    if (channel?.kind === 'dm') {
      return this.getDmHistory(channelId)
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

  async sendMessage ({ channelId, text }) {
    await this.ready
    const channel = this.directory.find((entry) => entry.id === channelId)
    if (channel?.kind === 'dm') {
      return this.sendDmMessage({ dmId: channelId, text })
    }
    const runtime = await this.ensureRuntime(channelId)
    if (!runtime) throw new Error('Channel not found: ' + channelId)

    const message = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2, 8),
      channelId,
      author: this.registeredHandle || this.identity.handle,
      authorPubkey: b4a.toString(this.identity.publicKey, 'hex'),
      text,
      timestamp: Date.now(),
    }

    await runtime.core.append(b4a.from(JSON.stringify(message)))
    return message
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
}
