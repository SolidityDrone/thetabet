import b4a from 'b4a'

const MAX_FRAME_BYTES = 64 * 1024

export function writeJsonFrame (socket, payload) {
  const body = Buffer.from(JSON.stringify(payload))
  if (body.byteLength > MAX_FRAME_BYTES) {
    throw new Error('Frame too large')
  }
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.byteLength, 0)
  socket.write(header)
  socket.write(body)
}

export function attachJsonFramer (socket, onMessage) {
  let buffer = Buffer.alloc(0)

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])

    while (buffer.byteLength >= 4) {
      const size = buffer.readUInt32BE(0)
      if (size > MAX_FRAME_BYTES) {
        socket.destroy()
        return
      }
      if (buffer.byteLength < 4 + size) return

      const body = buffer.subarray(4, 4 + size)
      buffer = buffer.subarray(4 + size)

      try {
        const message = JSON.parse(b4a.toString(body))
        onMessage(message)
      } catch (error) {
        console.error('pear-end bad socket frame', error)
      }
    }
  })
}
