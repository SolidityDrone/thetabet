/**
 * QVAC Worker Test Entry - minimal, no native addons
 * This entry avoids loading bare-env, bare-fs, bare-path, bare-os.
 * It only uses the built-in IPC channel.
 */

const { IPC } = BareKit

let rpc = null

async function boot() {
  try {
    const RPC = (await import('bare-rpc')).default || (await import('bare-rpc'))

    rpc = new RPC(IPC, async (req) => {
      if (req.command === 0) {
        req.reply(Buffer.from(JSON.stringify({ ok: true })))
      }
    })

    // Signal ready
    rpc.request(0).send(Buffer.from(JSON.stringify({ type: 'ready' })))

    console.log('Test worker booted successfully')
  } catch (err) {
    console.error('Test worker boot failed:', err.message || String(err))
  }
}

boot()
