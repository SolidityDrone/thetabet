import net from 'bare-tcp'
import { attachJsonFramer, writeJsonFrame } from './socket-framer.mjs'

export const LOCAL_INFERENCE_PORT = 39_391
/** 0.0.0.0 so adb forward can reach the device listener (127.0.0.1-only fails on some Android builds). */
const BIND_HOST = '0.0.0.0'
const CLIENT_HOST = '127.0.0.1'

export function startInferenceTcpBridge (peerInference, port = LOCAL_INFERENCE_PORT, hooks = {}) {
  let listening = false
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
    listening = true
    const addr = server.address()
    console.log(`[tcp] inference bridge on ${addr?.address ?? BIND_HOST}:${addr?.port ?? port}`)
    hooks.onListening?.()
  })

  server.on('error', (error) => {
    listening = false
    hooks.onError?.(error)
    if (error?.code === 'EADDRINUSE') {
      console.warn(
        `[tcp] port ${port} already in use — USB bridge disabled. Hyperswarm DHT still active.`
      )
      console.warn(`[tcp] free the port: fuser -k ${port}/tcp   (or close the other stub terminal)`)
      return
    }
    console.error('[tcp] bridge error:', error?.message || String(error))
  })

  server.on('close', () => {
    listening = false
    hooks.onClose?.()
  })

  server.listen(port, BIND_HOST)
  server.isInferenceListening = () => listening
  return server
}

export function connectLocalInferenceSocket (timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(LOCAL_INFERENCE_PORT, CLIENT_HOST)
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
