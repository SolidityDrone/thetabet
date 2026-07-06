import fs from 'bare-fs'
import path from 'bare-path'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'
import { identityToJson, loadOrCreateIdentity } from './identity.mjs'

const DIRECTORY_FILE = 'channels.json'
const PROFILE_FILE = 'tipster-profile.json'

export class PearChat {
  constructor (storagePath, onMessage) {
    this.storagePath = path.join(storagePath, 'pear-end')
    this.onMessage = onMessage
    this.channels = new Map()
    this.directory = []
    this.identity = null
    this.store = null
    this.swarm = null
    this.tipsterProfile = null
    this.ready = this.init()
  }

  async init () {
    fs.mkdirSync(this.storagePath, { recursive: true })
    this.identity = loadOrCreateIdentity(this.storagePath)
    this.store = new Corestore(this.storagePath)
    this.swarm = new Hyperswarm()

    this.swarm.on('connection', (socket) => {
      this.store.replicate(socket, { live: true })
    })

    await this.store.ready()
    this.loadDirectory()
    this.loadProfile()

    for (const channel of this.directory) {
      await this.attachChannel(channel, false)
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

  saveProfile () {
    const profilePath = path.join(this.storagePath, PROFILE_FILE)
    fs.writeFileSync(profilePath, JSON.stringify(this.tipsterProfile, null, 2))
  }

  channelSummary (channel) {
    return {
      id: channel.id,
      name: channel.name,
      topicKey: channel.topicKey,
      ownerPubkey: channel.ownerPubkey,
      isPrivate: channel.isPrivate,
      createdAt: channel.createdAt,
    }
  }

  async getIdentity () {
    await this.ready
    return identityToJson(this.identity)
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

  async getHistory (channelId) {
    await this.ready
    const runtime = this.channels.get(channelId)
    if (!runtime) return []
    await runtime.core.update()
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
    const runtime = this.channels.get(channelId)
    if (!runtime) throw new Error('Channel not found: ' + channelId)

    const message = {
      id: Date.now() + '-' + Math.random().toString(16).slice(2, 8),
      channelId,
      author: this.identity.handle,
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
    await discovery.flushed()

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
