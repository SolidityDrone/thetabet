import net from 'bare-tcp'
import { attachJsonFramer, writeJsonFrame } from './socket-framer.mjs'

export const LOCAL_INFERENCE_PORT = 39_391
const LOCAL_HOST = '127.0.0.1'

export function startInferenceTcpBridge (peerInference, port = LOCAL_INFERENCE_PORT) {
  const server = net.createServer((socket) => {
    socket._inferenceTrustedLocal = true
    socket.on('error', () => {})
    attachJsonFramer(socket, (frame) => {
      peerInference.handleProviderFrame(socket, frame).catch((error) => {
        const message = error?.message || String(error)
        console.error('[tcp] request error:', message)
        try {
          writeJsonFrame(
            socket,
            peerInference.signedFrame('inference-error', {
              requestId: frame?.payload?.requestId ?? null,
              message,
            })
          )
        } catch (_) {}
      })
    })
  })

  server.on('listening', () => {
    const addr = server.address()
    console.log(`[tcp] inference bridge on ${addr?.address ?? LOCAL_HOST}:${addr?.port ?? port}`)
  })

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.warn(
        `[tcp] port ${port} already in use — USB bridge disabled. Hyperswarm DHT still active.`
      )
      console.warn(`[tcp] free the port: fuser -k ${port}/tcp   (or close the other stub terminal)`)
      return
    }
    console.error('[tcp] bridge error:', error?.message || String(error))
  })

  server.listen(port, LOCAL_HOST)
  return server
}

export function connectLocalInferenceSocket (timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(LOCAL_INFERENCE_PORT, LOCAL_HOST)
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) {
        try { socket.destroy() } catch (_) {}
        reject(error)
      } else {
        resolve(value)
      }
    }

    const timer = setTimeout(() => finish(new Error('Local inference bridge timed out')), timeoutMs)
    socket.on('connect', () => finish(null, socket))
    socket.on('error', (error) => finish(error))
  })
}
