import fs from 'wdk-linked-bare-fs'
import path from 'bare-path'
import b4a from 'b4a'
import crypto from 'hypercore-crypto'
import sodium from 'sodium-universal'

const IDENTITY_FILE = 'identity.json'
export const CHAT_AVATAR_FILENAME = 'chat-avatar.jpg'
const MAX_AVATAR_BYTES = 200_000

function toKeyBuffer (value) {
  if (b4a.isBuffer(value)) return b4a.from(value)
  if (typeof value === 'string' && value.trim()) return b4a.from(value.trim(), 'hex')
  return b4a.alloc(0)
}

/** Fix pubkey/secret mismatch or 32-byte seed — keeps handle/avatar. Does not touch wallet or QVAC. */
export function normalizeIdentityKeys (identity) {
  if (!identity) return null

  let publicKey = toKeyBuffer(identity.publicKey)
  let secretKey = toKeyBuffer(identity.secretKey)
  if (!secretKey.byteLength) return null

  if (secretKey.byteLength === 32) {
    const keyPair = crypto.keyPair(secretKey)
    return {
      ...identity,
      publicKey: b4a.from(keyPair.publicKey),
      secretKey: b4a.from(keyPair.secretKey),
    }
  }

  if (secretKey.byteLength !== 64) return null
  if (publicKey.byteLength !== 32) publicKey = b4a.alloc(0)

  const derivedPublic = b4a.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
  sodium.crypto_sign_ed25519_sk_to_pk(derivedPublic, secretKey)

  if (!publicKey.byteLength || !b4a.equals(publicKey, derivedPublic)) {
    return { ...identity, publicKey: derivedPublic, secretKey }
  }

  if (crypto.validateKeyPair({ publicKey, secretKey })) {
    return { ...identity, publicKey, secretKey }
  }

  return null
}

function identityChanged (before, after) {
  return (
    !b4a.equals(toKeyBuffer(before.publicKey), toKeyBuffer(after.publicKey)) ||
    !b4a.equals(toKeyBuffer(before.secretKey), toKeyBuffer(after.secretKey))
  )
}

function backupIdentityFile (identityPath) {
  try {
    const backupPath = `${identityPath}.bak-${Date.now()}`
    fs.writeFileSync(backupPath, fs.readFileSync(identityPath))
    return backupPath
  } catch (_) {
    return null
  }
}

function readStoredIdentity (identityPath) {
  const raw = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
  return {
    publicKey: b4a.from(raw.publicKey, 'hex'),
    secretKey: b4a.from(raw.secretKey, 'hex'),
    handle: raw.handle,
    avatarUri: raw.avatarUri || null,
    avatarData: raw.avatarData || null,
  }
}

function rotatePearSigningKeys (storagePath, previous) {
  const keyPair = crypto.keyPair()
  const identity = {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
    handle: previous?.handle || b4a.toString(keyPair.publicKey, 'hex').slice(0, 8),
    avatarUri: previous?.avatarUri || null,
    avatarData: previous?.avatarData || null,
  }
  saveIdentity(storagePath, identity)
  console.warn(
    '[identity] rotated Pear signing keys only — wallet, QVAC models, and channels are untouched'
  )
  return identity
}

export function loadOrCreateIdentity (storagePath) {
  const identityPath = path.join(storagePath, IDENTITY_FILE)
  if (fs.existsSync(identityPath)) {
    const stored = readStoredIdentity(identityPath)
    const repaired = normalizeIdentityKeys(stored)
    if (repaired) {
      if (identityChanged(stored, repaired)) {
        console.warn('[identity] repaired Pear signing keypair from secretKey')
        backupIdentityFile(identityPath)
        saveIdentity(storagePath, repaired)
      }
      return repaired
    }

    console.warn('[identity] Pear secretKey unusable — rotating signing keys (models/wallet safe)')
    backupIdentityFile(identityPath)
    return rotatePearSigningKeys(storagePath, stored)
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

/** Re-read disk and repair in-memory identity (safe — only touches pear-end/identity.json). */
export function repairStoredIdentity (storagePath, currentIdentity = null) {
  const identityPath = path.join(storagePath, IDENTITY_FILE)
  if (!fs.existsSync(identityPath)) {
    return loadOrCreateIdentity(storagePath)
  }

  const stored = readStoredIdentity(identityPath)
  const repaired = normalizeIdentityKeys(stored)
  if (repaired) {
    if (identityChanged(stored, repaired)) {
      backupIdentityFile(identityPath)
      saveIdentity(storagePath, repaired)
    }
    return repaired
  }

  backupIdentityFile(identityPath)
  return rotatePearSigningKeys(storagePath, currentIdentity || stored)
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
