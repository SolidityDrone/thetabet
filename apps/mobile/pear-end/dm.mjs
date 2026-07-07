import fs from 'bare-fs'
import path from 'bare-path'
import b4a from 'b4a'
import {
  decryptText,
  deriveDmKey,
  dmIdForPeers,
  encryptText,
  myPubkeyHex,
  signCanonical,
  topicFromLabel,
  topicHexFromLabel,
  verifyCanonical,
} from './crypto.mjs'
import { attachJsonFramer, writeJsonFrame } from './socket-framer.mjs'

const CONTACTS_FILE = 'contacts.json'
const HANDLE_TOPIC_PREFIX = 'thetabet-handle:'
const CONTACT_TOPIC_PREFIX = 'thetabet-contact:'
const DM_OUT_PREFIX = 'thetabet-dm-out:'
const DM_IN_PREFIX = 'thetabet-dm-in:'

function nowId () {
  return Date.now() + '-' + Math.random().toString(16).slice(2, 8)
}

function normalizeHandle (handle) {
  return handle.trim().toLowerCase().replace(/^@/, '')
}

export function createDmMixin (chat) {
  return {
    loadContacts () {
      const contactsPath = path.join(chat.storagePath, CONTACTS_FILE)
      if (!fs.existsSync(contactsPath)) {
        chat.contacts = { pendingIncoming: [], pendingOutgoing: [], accepted: [] }
        return
      }
      chat.contacts = JSON.parse(fs.readFileSync(contactsPath, 'utf8'))
    },

    saveContacts () {
      const contactsPath = path.join(chat.storagePath, CONTACTS_FILE)
      fs.writeFileSync(contactsPath, JSON.stringify(chat.contacts, null, 2))
    },

    async ensureContactListener () {
      if (chat.contactDiscovery) return
      const topic = topicFromLabel(CONTACT_TOPIC_PREFIX, chat.identity.publicKey)
      chat.contactDiscovery = chat.contactSwarm.join(topic, { server: true, client: false })

      chat.contactSwarm.on('connection', (socket) => {
        attachJsonFramer(socket, (frame) => {
          chat.handleContactSocketFrame(socket, frame).catch((error) => {
            console.error('pear-end contact frame failed', error)
          })
        })
      })
    },

    async handleContactSocketFrame (socket, frame) {
      if (!frame || !frame.type) return

      if (frame.type === 'handle-lookup') {
        const handle = normalizeHandle(frame.handle || '')
        if (!handle || handle !== chat.registeredHandle) return
        const payload = {
          type: 'handle-info',
          handle,
          pubkey: myPubkeyHex(chat.identity),
          timestamp: Date.now(),
        }
        payload.signature = signCanonical(chat.identity, payload)
        writeJsonFrame(socket, payload)
        return
      }

      if (frame.type === 'contact-request') {
        const ok = verifyCanonical(frame.fromPubkey, frame.payload, frame.signature)
        if (!ok) return
        if (frame.payload.toPubkey !== myPubkeyHex(chat.identity)) return

        const existing = chat.contacts.pendingIncoming.find((row) => row.id === frame.payload.id)
        if (!existing) {
          chat.contacts.pendingIncoming.push({
            id: frame.payload.id,
            fromPubkey: frame.fromPubkey,
            fromHandle: frame.payload.fromHandle || null,
            note: frame.payload.note || '',
            timestamp: frame.payload.timestamp,
          })
          chat.saveContacts()
        }

        writeJsonFrame(socket, { type: 'contact-request-ack', id: frame.payload.id })
        if (chat.onContactsChanged) chat.onContactsChanged()
        return
      }

      if (frame.type === 'contact-response') {
        const ok = verifyCanonical(frame.fromPubkey, frame.payload, frame.signature)
        if (!ok) return

        const outgoing = chat.contacts.pendingOutgoing.find((row) => row.id === frame.payload.id)
        if (!outgoing) return

        if (frame.payload.accepted) {
          await chat.acceptDmSession(myPubkeyHex(chat.identity), frame.fromPubkey, {
            peerHandle: frame.payload.fromHandle || null,
            myHandle: chat.registeredHandle,
          })
        }

        chat.contacts.pendingOutgoing = chat.contacts.pendingOutgoing.filter(
          (row) => row.id !== frame.payload.id
        )
        chat.saveContacts()
        if (chat.onContactsChanged) chat.onContactsChanged()
      }
    },

    async announceHandle (handle) {
      const normalized = normalizeHandle(handle)
      if (!normalized) throw new Error('Enter a valid handle')

      chat.registeredHandle = normalized
      chat.saveAnnouncedHandle()

      if (chat.handleDiscovery) {
        chat.contactSwarm.leave(chat.handleDiscovery)
      }

      const topic = topicFromLabel(HANDLE_TOPIC_PREFIX, b4a.from(normalized))
      chat.handleDiscovery = chat.contactSwarm.join(topic, { server: true, client: true })
      await chat.ensureContactListener()
      return { handle: normalized, pubkey: myPubkeyHex(chat.identity) }
    },

    async lookupHandle (handle, timeoutMs = 8000) {
      const normalized = normalizeHandle(handle)
      if (!normalized) throw new Error('Enter a valid handle')

      const topic = topicFromLabel(HANDLE_TOPIC_PREFIX, b4a.from(normalized))
      const discovery = chat.contactSwarm.join(topic, { server: false, client: true })

      return new Promise((resolve, reject) => {
        let settled = false

        const finish = (error, value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          chat.contactSwarm.leave(discovery)
          if (error) reject(error)
          else resolve(value)
        }

        const timer = setTimeout(() => {
          finish(new Error('Handle is offline or not registered on Pear yet'))
        }, timeoutMs)

        const onConnection = (socket) => {
          attachJsonFramer(socket, (frame) => {
            if (frame.type !== 'handle-info') return
            const payload = { ...frame }
            delete payload.signature
            const ok = verifyCanonical(frame.pubkey, payload, frame.signature)
            if (!ok) return
            if (normalizeHandle(frame.handle) !== normalized) return
            finish(null, { handle: normalized, pubkey: frame.pubkey })
          })

          writeJsonFrame(socket, { type: 'handle-lookup', handle: normalized })
        }

        chat.contactSwarm.once('connection', onConnection)
      })
    },

    async sendContactRequest ({ handle, note }) {
      const peer = await chat.lookupHandle(handle)
      const requestId = nowId()
      const fromPubkey = myPubkeyHex(chat.identity)
      const payload = {
        id: requestId,
        fromHandle: chat.registeredHandle || null,
        fromPubkey,
        toHandle: peer.handle,
        toPubkey: peer.pubkey,
        note: note || '',
        timestamp: Date.now(),
      }
      const signature = signCanonical(chat.identity, payload)

      const topic = topicFromLabel(CONTACT_TOPIC_PREFIX, b4a.from(peer.pubkey, 'hex'))
      const discovery = chat.contactSwarm.join(topic, { server: false, client: true })

      await new Promise((resolve, reject) => {
        let settled = false
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          chat.contactSwarm.leave(discovery)
          reject(new Error('Contact request timed out — peer may be offline'))
        }, 8000)

        const onConnection = (socket) => {
          attachJsonFramer(socket, (frame) => {
            if (frame.type === 'contact-request-ack' && frame.id === requestId) {
              if (settled) return
              settled = true
              clearTimeout(timer)
              chat.contactSwarm.leave(discovery)
              resolve()
            }
          })

          writeJsonFrame(socket, {
            type: 'contact-request',
            fromPubkey,
            payload,
            signature,
          })
        }

        chat.contactSwarm.once('connection', onConnection)
      })

      chat.contacts.pendingOutgoing.push({
        id: requestId,
        toHandle: peer.handle,
        toPubkey: peer.pubkey,
        note: note || '',
        timestamp: Date.now(),
      })
      chat.saveContacts()
      return { id: requestId, peer }
    },

    async listContacts () {
      await chat.ready
      return {
        pendingIncoming: chat.contacts.pendingIncoming,
        pendingOutgoing: chat.contacts.pendingOutgoing,
        accepted: chat.contacts.accepted,
      }
    },

    async respondContactRequest ({ requestId, accept }) {
      const incoming = chat.contacts.pendingIncoming.find((row) => row.id === requestId)
      if (!incoming) throw new Error('Contact request not found')

      chat.contacts.pendingIncoming = chat.contacts.pendingIncoming.filter(
        (row) => row.id !== requestId
      )
      chat.saveContacts()

      if (accept) {
        await chat.acceptDmSession(myPubkeyHex(chat.identity), incoming.fromPubkey, {
          peerHandle: incoming.fromHandle,
          myHandle: chat.registeredHandle,
        })
      }

      const payload = {
        id: requestId,
        accepted: Boolean(accept),
        fromHandle: chat.registeredHandle || null,
        timestamp: Date.now(),
      }
      const signature = signCanonical(chat.identity, payload)

      const topic = topicFromLabel(CONTACT_TOPIC_PREFIX, b4a.from(incoming.fromPubkey, 'hex'))
      const discovery = chat.contactSwarm.join(topic, { server: false, client: true })

      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          chat.contactSwarm.leave(discovery)
          resolve()
        }, 5000)

        const onConnection = (socket) => {
          writeJsonFrame(socket, {
            type: 'contact-response',
            fromPubkey: myPubkeyHex(chat.identity),
            payload,
            signature,
          })
          clearTimeout(timer)
          chat.contactSwarm.leave(discovery)
          resolve()
        }

        chat.contactSwarm.once('connection', onConnection)
      })

      if (chat.onContactsChanged) chat.onContactsChanged()
      return { accepted: Boolean(accept) }
    },

    async acceptDmSession (myPubkey, peerPubkey, meta) {
      const dmId = dmIdForPeers(myPubkey, peerPubkey)
      const existing = chat.directory.find((row) => row.kind === 'dm' && row.id === dmId)
      if (!existing) {
        const channel = {
          id: dmId,
          kind: 'dm',
          name: meta.peerHandle ? '@' + meta.peerHandle : peerPubkey.slice(0, 8),
          topicKey: topicHexFromLabel(DM_OUT_PREFIX, b4a.from(dmId, 'hex')),
          peerTopicKey: topicHexFromLabel(DM_IN_PREFIX, b4a.from(dmId, 'hex')),
          ownerPubkey: myPubkeyHex(chat.identity),
          peerPubkey,
          peerHandle: meta.peerHandle || null,
          isPrivate: true,
          createdAt: Date.now(),
        }
        chat.directory.push(channel)
        chat.saveDirectory()
        await chat.attachDmChannel(channel)
      }

      const accepted = {
        dmId,
        peerPubkey,
        peerHandle: meta.peerHandle || null,
        acceptedAt: Date.now(),
      }
      if (!chat.contacts.accepted.some((row) => row.dmId === dmId)) {
        chat.contacts.accepted.push(accepted)
        chat.saveContacts()
      }

      return accepted
    },

    async listDms () {
      await chat.ready
      return chat.directory
        .filter((row) => row.kind === 'dm')
        .map((channel) => chat.channelSummary(channel))
    },

    async attachDmChannel (channel) {
      if (chat.channels.has(channel.id)) return

      const outCore = chat.store.get({ name: 'dm-out-' + channel.id })
      await outCore.ready()
      const inCore = chat.store.get({ name: 'dm-in-' + channel.id })
      await inCore.ready()

      const outDiscovery = chat.swarm.join(b4a.from(channel.topicKey, 'hex'), {
        server: true,
        client: true,
      })
      const inDiscovery = chat.swarm.join(b4a.from(channel.peerTopicKey, 'hex'), {
        server: true,
        client: true,
      })

      const self = chat
      const onAppend = (core, isMine) => {
        core.on('append', function () {
          const raw = core.get(core.length - 1)
          try {
            const envelope = JSON.parse(b4a.toString(raw))
            const message = self.decodeDmEnvelope(channel, envelope, isMine)
            if (message && self.onMessage) self.onMessage(message)
          } catch (error) {
            console.error('pear-end dm append parse failed', error)
          }
        })
      }

      onAppend(outCore, true)
      onAppend(inCore, false)

      chat.channels.set(channel.id, {
        core: outCore,
        peerCore: inCore,
        discovery: outDiscovery,
        peerDiscovery: inDiscovery,
        kind: 'dm',
      })
    },

    decodeDmEnvelope (channel, envelope, isMine) {
      if (!envelope || envelope.type !== 'dm') return null
      const peerPubkey = channel.peerPubkey
      const dmKey = deriveDmKey(chat.identity, peerPubkey)
      const payload = verifyCanonical(envelope.authorPubkey, envelope.payload, envelope.signature)
        ? envelope.payload
        : null
      if (!payload) return null

      let text = ''
      try {
        text = decryptText(payload, dmKey)
      } catch (error) {
        text = '[encrypted]'
      }

      return {
        id: envelope.id,
        channelId: channel.id,
        kind: 'dm',
        author: envelope.authorHandle || envelope.authorPubkey.slice(0, 8),
        authorPubkey: envelope.authorPubkey,
        text,
        timestamp: envelope.timestamp,
        isMine,
      }
    },

    async getDmHistory (dmId) {
      await chat.ready
      const runtime = await chat.ensureRuntime(dmId)
      if (!runtime || runtime.kind !== 'dm') return []

      const channel = chat.directory.find((row) => row.id === dmId)
      if (!channel) return []

      const cores = [runtime.core]
      if (runtime.peerCore) cores.push(runtime.peerCore)

      for (const core of cores) {
        try {
          await core.update()
        } catch (error) {
          console.error('pear-end dm core.update skipped', dmId, error)
        }
      }

      const merged = []
      for (const core of cores) {
        const isMine = core === runtime.core
        for (let index = 0; index < core.length; index++) {
          const raw = core.get(index)
          try {
            const envelope = JSON.parse(b4a.toString(raw))
            const message = chat.decodeDmEnvelope(channel, envelope, isMine)
            if (message) merged.push(message)
          } catch (error) {}
        }
      }

      merged.sort((left, right) => left.timestamp - right.timestamp)
      return merged
    },

    async sendDmMessage ({ dmId, text }) {
      await chat.ready
      const runtime = await chat.ensureRuntime(dmId)
      if (!runtime || runtime.kind !== 'dm') throw new Error('DM not found')

      const channel = chat.directory.find((row) => row.id === dmId)
      if (!channel) throw new Error('DM not found')

      const dmKey = deriveDmKey(chat.identity, channel.peerPubkey)
      const encrypted = encryptText(text, dmKey)
      const payload = {
        nonce: encrypted.nonce,
        ciphertext: encrypted.ciphertext,
      }

      const envelope = {
        type: 'dm',
        id: nowId(),
        authorPubkey: myPubkeyHex(chat.identity),
        authorHandle: chat.registeredHandle || null,
        timestamp: Date.now(),
        payload,
      }
      envelope.signature = signCanonical(chat.identity, payload)

      await runtime.core.append(b4a.from(JSON.stringify(envelope)))

      return chat.decodeDmEnvelope(channel, envelope, true)
    },
  }
}
