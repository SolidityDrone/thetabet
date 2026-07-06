import RPC from 'bare-rpc'
import { PearChat } from './chat.mjs'
import { COMMANDS } from './commands.mjs'

const { IPC } = BareKit

const storagePath = Bare.argv[0]
if (!storagePath) {
  throw new Error('pear-end requires documentDirectory as argv[0]')
}

let chat = null
let rpc = null

function replyJson (req, value) {
  req.reply(Buffer.from(JSON.stringify(value)))
}

function parsePayload (req) {
  if (!req.data || req.data.length === 0) return {}
  return JSON.parse(req.data.toString())
}

async function boot () {
  rpc = new RPC(IPC, async (req) => {
    try {
      switch (req.command) {
        case COMMANDS.READY:
          replyJson(req, { ok: true })
          return
        case COMMANDS.GET_IDENTITY:
          replyJson(req, await chat.getIdentity())
          return
        case COMMANDS.LIST_CHANNELS:
          replyJson(req, await chat.listChannels())
          return
        case COMMANDS.CREATE_CHANNEL:
          replyJson(req, await chat.createChannel(parsePayload(req)))
          return
        case COMMANDS.JOIN_CHANNEL:
          replyJson(req, await chat.joinChannel(parsePayload(req)))
          return
        case COMMANDS.SEND_MESSAGE:
          replyJson(req, await chat.sendMessage(parsePayload(req)))
          return
        case COMMANDS.GET_HISTORY:
          replyJson(req, await chat.getHistory(parsePayload(req).channelId))
          return
        case COMMANDS.SHARE_CHANNEL_KEY:
          replyJson(req, await chat.shareChannelKey(parsePayload(req)))
          return
        case COMMANDS.RECEIVE_CHANNEL_KEY:
          replyJson(req, await chat.receiveChannelKey(parsePayload(req)))
          return
        case COMMANDS.SET_TIPSTER_PROFILE:
          replyJson(req, await chat.setTipsterProfile(parsePayload(req)))
          return
        case COMMANDS.GET_TIPSTER_PROFILE:
          replyJson(req, await chat.getTipsterProfile())
          return
        default:
          replyJson(req, { error: 'Unknown command ' + req.command })
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      replyJson(req, { error: message })
    }
  })

  chat = new PearChat(storagePath, (message) => {
    if (!rpc) return
    const event = rpc.request(COMMANDS.MESSAGE_EVENT)
    event.send(Buffer.from(JSON.stringify(message)))
  })

  await chat.ready
}

boot().catch((error) => {
  console.error('pear-end boot failed', error)
})
