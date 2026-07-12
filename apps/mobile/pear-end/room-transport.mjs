import b4a from 'b4a'
import Hyperswarm from 'hyperswarm'

export function attachRoomTransport ({ topicHex, roomId, onMessage, onPeerCount }) {
  const swarm = new Hyperswarm()
  const sockets = new Set()

  swarm.on('connection', (socket) => {
    let buffer = ''
    sockets.add(socket)
    socket.on('error', () => {})
    try { onPeerCount?.(sockets.size) } catch (_) {}

    socket.once('close', () => {
      sockets.delete(socket)
      try { onPeerCount?.(sockets.size) } catch (_) {}
    })

    socket.on('data', (chunk) => {
      buffer += b4a.toString(chunk)
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.startsWith('{')) {
          try {
            const frame = JSON.parse(line)
            if (frame.type === 'room-message' && frame.roomId === roomId && frame.message) {
              onMessage?.(frame.message)
            }
          } catch (_) {}
        }
        newline = buffer.indexOf('\n')
      }
    })
  })

  const discovery = swarm.join(b4a.from(topicHex, 'hex'), { server: true, client: true })
  return {
    discovery,
    broadcast (message) {
      const frame = JSON.stringify({ type: 'room-message', roomId, message }) + '\n'
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
    destroy () {
      try { swarm.destroy() } catch (_) {}
    },
  }
}
