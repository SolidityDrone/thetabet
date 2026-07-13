import RPC from 'bare-rpc'
import { PearChat } from './chat.mjs'
import { COMMANDS } from './commands.mjs'
import { repairStoredIdentity } from './identity.mjs'
import { PeerInference } from './peer-inference.mjs'

const { IPC } = BareKit

const storagePath = Bare.argv[0]
if (!storagePath) {
  throw new Error('pear-end requires documentDirectory as argv[0]')
}

let chat = null
let peerInference = null
let rpc = null
let chatBoot = null

function replyJson (req, value) {
  req.reply(Buffer.from(JSON.stringify(value)))
}

function parsePayload (req) {
  if (!req.data || req.data.length === 0) return {}
  return JSON.parse(req.data.toString())
}

async function ensureChat () {
  if (chat) return chat
  if (chatBoot) return chatBoot

  chatBoot = (async () => {
    const instance = new PearChat(storagePath, (message) => {
      if (!rpc) return
      const event = rpc.request(COMMANDS.MESSAGE_EVENT)
      event.send(Buffer.from(JSON.stringify(message)))
    }, () => {
      if (!rpc) return
      const event = rpc.request(COMMANDS.CONTACTS_CHANGED_EVENT)
      event.send(Buffer.from(JSON.stringify({ ok: true })))
    })

    await instance.ready
    chat = instance
    peerInference = new PeerInference(instance, {
      onProviderRequest: (request) => {
        if (!rpc) return
        const event = rpc.request(COMMANDS.INFERENCE_PROVIDER_REQUEST_EVENT)
        event.send(Buffer.from(JSON.stringify({ type: 'request', ...request })))
      },
      onProviderCancel: ({ requestId }) => {
        if (!rpc) return
        const event = rpc.request(COMMANDS.INFERENCE_PROVIDER_REQUEST_EVENT)
        event.send(Buffer.from(JSON.stringify({ type: 'cancel', requestId })))
      },
      onRequesterEvent: (payload) => {
        if (!rpc) return
        const event = rpc.request(COMMANDS.INFERENCE_REQUESTER_EVENT)
        event.send(Buffer.from(JSON.stringify(payload)))
      },
      onStatusChanged: (status) => {
        if (!rpc) return
        const event = rpc.request(COMMANDS.INFERENCE_STATUS_EVENT)
        event.send(Buffer.from(JSON.stringify(status)))
      },
    })
    return chat
  })().catch((error) => {
    chatBoot = null
    throw error
  })

  return chatBoot
}

async function boot () {
  await ensureChat()

  if (rpc) return

  rpc = new RPC(IPC, async (req) => {
    try {
      const activeChat = await ensureChat()

      switch (req.command) {
        case COMMANDS.READY:
          await activeChat.ready
          replyJson(req, { ok: true })
          return
        case COMMANDS.GET_IDENTITY:
          replyJson(req, await activeChat.getIdentity())
          return
        case COMMANDS.LIST_CHANNELS:
          replyJson(req, await activeChat.listChannels())
          return
        case COMMANDS.CREATE_CHANNEL:
          replyJson(req, await activeChat.createChannel(parsePayload(req)))
          return
        case COMMANDS.JOIN_CHANNEL:
          replyJson(req, await activeChat.joinChannel(parsePayload(req)))
          return
        case COMMANDS.SEND_MESSAGE:
          replyJson(req, await activeChat.sendMessage(parsePayload(req)))
          return
        case COMMANDS.GET_HISTORY:
          replyJson(req, await activeChat.getHistory(parsePayload(req).channelId))
          return
        case COMMANDS.SHARE_CHANNEL_KEY:
          replyJson(req, await activeChat.shareChannelKey(parsePayload(req)))
          return
        case COMMANDS.RECEIVE_CHANNEL_KEY:
          replyJson(req, await activeChat.receiveChannelKey(parsePayload(req)))
          return
        case COMMANDS.SET_TIPSTER_PROFILE:
          replyJson(req, await activeChat.setTipsterProfile(parsePayload(req)))
          return
        case COMMANDS.GET_TIPSTER_PROFILE:
          replyJson(req, await activeChat.getTipsterProfile())
          return
        case COMMANDS.REGISTER_HANDLE:
          replyJson(req, await activeChat.announceHandle(parsePayload(req).handle))
          return
        case COMMANDS.LOOKUP_HANDLE:
          replyJson(req, await activeChat.lookupHandle(parsePayload(req).handle))
          return
        case COMMANDS.SEND_CONTACT_REQUEST:
          replyJson(req, await activeChat.sendContactRequest(parsePayload(req)))
          return
        case COMMANDS.LIST_CONTACTS:
          replyJson(req, await activeChat.listContacts())
          return
        case COMMANDS.RESPOND_CONTACT_REQUEST:
          replyJson(req, await activeChat.respondContactRequest(parsePayload(req)))
          return
        case COMMANDS.LIST_DMS:
          replyJson(req, await activeChat.listDms())
          return
        case COMMANDS.SEND_DM:
          replyJson(req, await activeChat.sendDmMessage(parsePayload(req)))
          return
        case COMMANDS.CREATE_VAULT_CHANNEL:
          replyJson(req, await activeChat.createVaultChannel(parsePayload(req)))
          return
        case COMMANDS.JOIN_VAULT_CHANNEL:
          replyJson(req, await activeChat.joinVaultChannel(parsePayload(req)))
          return
        case COMMANDS.PING_CHANNEL_PRESENCE:
          replyJson(req, await activeChat.pingChannelPresence(parsePayload(req)))
          return
        case COMMANDS.GET_CHANNEL_ONLINE:
          replyJson(req, await activeChat.getChannelOnline(parsePayload(req)))
          return
        case COMMANDS.SET_CHAT_AVATAR:
          replyJson(req, await activeChat.setChatAvatar(parsePayload(req)))
          return
        case COMMANDS.SET_INFERENCE_ENABLED:
          replyJson(req, await peerInference.setEnabled(parsePayload(req).enabled))
          return
        case COMMANDS.SET_INFERENCE_RUNTIME_BUSY:
          replyJson(req, peerInference.setRuntimeBusy(parsePayload(req).busy))
          return
        case COMMANDS.LIST_INFERENCE_PEERS:
          replyJson(req, await peerInference.browse(parsePayload(req).timeoutMs))
          return
        case COMMANDS.REQUEST_PEER_INFERENCE:
          activeChat.identity = repairStoredIdentity(activeChat.storagePath, activeChat.identity)
          replyJson(req, await peerInference.request(parsePayload(req)))
          return
        case COMMANDS.SEND_INFERENCE_PROGRESS:
          replyJson(req, { ok: peerInference.sendProviderProgress(parsePayload(req)) })
          return
        case COMMANDS.COMPLETE_INFERENCE_REQUEST:
          replyJson(req, { ok: peerInference.completeProviderRequest(parsePayload(req)) })
          return
        case COMMANDS.CANCEL_PEER_INFERENCE:
          replyJson(req, { ok: peerInference.cancelRequester(parsePayload(req).requestId) })
          return
        case COMMANDS.GET_INFERENCE_STATUS:
          replyJson(req, peerInference.profile())
          return
        default:
          replyJson(req, { error: 'Unknown command ' + req.command })
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      replyJson(req, { error: message })
    }
  })
}

boot().catch((error) => {
  console.error('pear-end boot failed', error)
})
