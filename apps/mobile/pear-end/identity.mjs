import fs from 'bare-fs'
import path from 'bare-path'
import b4a from 'b4a'
import crypto from 'hypercore-crypto'

const IDENTITY_FILE = 'identity.json'

export function loadOrCreateIdentity (storagePath) {
  const identityPath = path.join(storagePath, IDENTITY_FILE)
  if (fs.existsSync(identityPath)) {
    const raw = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    return {
      publicKey: b4a.from(raw.publicKey, 'hex'),
      secretKey: b4a.from(raw.secretKey, 'hex'),
      handle: raw.handle,
    }
  }

  const keyPair = crypto.keyPair()
  const handle = b4a.toString(keyPair.publicKey, 'hex').slice(0, 8)
  const identity = {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    handle,
  }

  fs.writeFileSync(
    identityPath,
    JSON.stringify({
      publicKey: b4a.toString(keyPair.publicKey, 'hex'),
      secretKey: b4a.toString(keyPair.secretKey, 'hex'),
      handle,
    })
  )

  return identity
}

export function identityToJson (identity, onChainHandle = null) {
  return {
    pubkey: b4a.toString(identity.publicKey, 'hex'),
    deviceId: identity.handle,
    onChainHandle,
  }
}
