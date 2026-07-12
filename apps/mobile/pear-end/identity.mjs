import fs from 'wdk-linked-bare-fs'
import path from 'bare-path'
import b4a from 'b4a'
import crypto from 'hypercore-crypto'

const IDENTITY_FILE = 'identity.json'
export const CHAT_AVATAR_FILENAME = 'chat-avatar.jpg'
const MAX_AVATAR_BYTES = 200_000

export function loadOrCreateIdentity (storagePath) {
  const identityPath = path.join(storagePath, IDENTITY_FILE)
  if (fs.existsSync(identityPath)) {
    const raw = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    return {
      publicKey: b4a.from(raw.publicKey, 'hex'),
      secretKey: b4a.from(raw.secretKey, 'hex'),
      handle: raw.handle,
      avatarUri: raw.avatarUri || null,
      avatarData: raw.avatarData || null,
    }
  }

  const keyPair = crypto.keyPair()
  const handle = b4a.toString(keyPair.publicKey, 'hex').slice(0, 8)
  const identity = {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    handle,
    avatarUri: null,
    avatarData: null,
  }

  fs.writeFileSync(
    identityPath,
    JSON.stringify({
      publicKey: b4a.toString(keyPair.publicKey, 'hex'),
      secretKey: b4a.toString(keyPair.secretKey, 'hex'),
      handle,
      avatarUri: null,
      avatarData: null,
    })
  )

  return identity
}

export function saveIdentity (storagePath, identity) {
  const identityPath = path.join(storagePath, IDENTITY_FILE)
  fs.writeFileSync(identityPath, JSON.stringify({
    publicKey: b4a.toString(identity.publicKey, 'hex'),
    secretKey: b4a.toString(identity.secretKey, 'hex'),
    handle: identity.handle,
    avatarUri: identity.avatarUri || null,
    avatarData: identity.avatarData || null,
  }))
}

export function identityToJson (identity, onChainHandle = null) {
  return {
    pubkey: b4a.toString(identity.publicKey, 'hex'),
    deviceId: identity.handle,
    onChainHandle,
    avatarUri: identity.avatarUri || null,
    avatarData: identity.avatarData || null,
  }
}

export function writeChatAvatarImage (storagePath, identity, { imageBase64, mimeType, clear }) {
  const avatarPath = path.join(storagePath, CHAT_AVATAR_FILENAME)

  if (clear) {
    if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath)
    identity.avatarUri = null
    identity.avatarData = null
    return identity
  }

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new Error('imageBase64 is required')
  }

  const buffer = b4a.from(imageBase64, 'base64')
  if (!buffer.length) throw new Error('Avatar image is empty')
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new Error('Avatar image too large (max 200KB)')
  }

  fs.writeFileSync(avatarPath, buffer)
  identity.avatarUri = CHAT_AVATAR_FILENAME
  identity.avatarData = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`
  return identity
}
