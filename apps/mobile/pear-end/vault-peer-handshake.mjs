import b4a from 'b4a'
import Hyperswarm from 'hyperswarm'
import { isVaultWriterId, normalizeVaultAddress, vaultPeerTopicKey } from './vault-channel.mjs'

export function attachVaultPeerHandshake ({
  vaultAddress,
  writerId,
  onRemoteWriter,
  onMessage,
  onPeerCount,
}) {
  const vault = normalizeVaultAddress(vaultAddress)
  const writer = String(writerId || '').trim().toLowerCase()
  if (!isVaultWriterId(writer)) throw new Error('Invalid vault writer id for handshake: ' + writerId)
  const known = new Set([writer])
  const sockets = new Set()
  const swarm = new Hyperswarm()
  const announce = JSON.stringify({ t: 'vault-writer', vault, pk: writer }) + '\n'

  function registerRemote (pubkey) {
    const pk = String(pubkey || '').trim().toLowerCase()
    if (!isVaultWriterId(pk) || known.has(pk)) return
    known.add(pk)
    onRemoteWriter(pk)
  }

  function onConnection (socket) {
    let buf = ''
    sockets.add(socket)
    socket.on('error', () => {})
    if (onPeerCount) {
      try {
        onPeerCount(sockets.size)
      } catch (_) {}
    }
    socket.once('close', () => {
      sockets.delete(socket)
      if (onPeerCount) {
        try {
          onPeerCount(sockets.size)
        } catch (_) {}
      }
    })

    const announceLine = announce
    try {
      socket.write(announceLine)
    } catch (_) {}

    socket.on('data', (chunk) => {
      buf += b4a.toString(chunk)
      let newline = buf.indexOf('\n')
      while (newline >= 0) {
        const line = buf.slice(0, newline).trim()
        buf = buf.slice(newline + 1)
        if (line.startsWith('{')) {
          try {
            const msg = JSON.parse(line)
            if (msg.t === 'vault-writer' && msg.vault === vault && msg.pk) {
              registerRemote(msg.pk)
            } else if (msg.t === 'vault-message' && msg.vault === vault && msg.message) {
              if (onMessage) {
                try {
                  onMessage(msg.message)
                } catch (_) {}
              }
            }
          } catch (_) {}
        }
        newline = buf.indexOf('\n')
      }
    })
  }

  swarm.on('connection', onConnection)

  const topicHex = vaultPeerTopicKey(vault)
  const discovery = swarm.join(b4a.from(topicHex, 'hex'), {
    server: true,
    client: true,
  })

  const announceTimer = setInterval(() => {
    for (const socket of sockets) {
      try { socket.write(announce) } catch (_) {}
    }
  }, 8000)

  const refreshTimer = setInterval(() => {
    if (sockets.size > 0) return
    discovery.refresh().catch(() => {})
  }, 12000)

  return {
    swarm,
    discovery,
    known,
    registerRemote,
    broadcastMessage (message) {
      const frame = JSON.stringify({ t: 'vault-message', vault, message }) + '\n'
      let sent = 0
      for (const socket of sockets) {
        try {
          socket.write(frame)
          sent++
        } catch (_) {}
      }
      return sent
    },
    get peerCount () {
      return sockets.size
    },
    async flushed () {
      try {
        await discovery.flushed()
      } catch (_) {}
    },
    destroy () {
      clearInterval(announceTimer)
      clearInterval(refreshTimer)
      try {
        swarm.destroy()
      } catch (_) {}
    },
  }
}
