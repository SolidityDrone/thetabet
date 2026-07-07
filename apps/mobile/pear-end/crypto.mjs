import b4a from 'b4a'
import crypto from 'hypercore-crypto'
import sodium from 'sodium-universal'

export function topicFromLabel (label, extra) {
  const parts = [b4a.from(label)]
  if (extra) {
    if (Array.isArray(extra)) parts.push(...extra)
    else parts.push(extra)
  }
  return crypto.hash(...parts)
}

export function topicHexFromLabel (label, extra) {
  return b4a.toString(topicFromLabel(label, extra), 'hex')
}

export function dmIdForPeers (pubkeyA, pubkeyB) {
  const a = b4a.from(pubkeyA, typeof pubkeyA === 'string' ? 'hex' : undefined)
  const b = b4a.from(pubkeyB, typeof pubkeyB === 'string' ? 'hex' : undefined)
  const sorted = b4a.compare(a, b) <= 0 ? [a, b] : [b, a]
  return b4a.toString(crypto.hash(b4a.from('thetabet-dm-id:'), sorted[0], sorted[1]), 'hex')
}

function encryptionKeyPairFromIdentity (identity) {
  const seed = identity.secretKey.subarray(0, 32)
  return crypto.encryptionKeyPair(seed)
}

function ed25519PublicToCurve25519 (edPublicKey) {
  const curvePublic = b4a.alloc(sodium.crypto_box_PUBLICKEYBYTES)
  if (!sodium.crypto_sign_ed25519_pk_to_curve25519(curvePublic, edPublicKey)) {
    throw new Error('Invalid peer public key')
  }
  return curvePublic
}

export function deriveDmKey (identity, peerPublicKey) {
  const enc = encryptionKeyPairFromIdentity(identity)
  const peerCurve = ed25519PublicToCurve25519(
    b4a.from(peerPublicKey, typeof peerPublicKey === 'string' ? 'hex' : undefined)
  )
  const shared = b4a.alloc(sodium.crypto_scalarmult_BYTES)
  sodium.crypto_scalarmult(shared, enc.secretKey, peerCurve)
  return crypto.hash(b4a.from('thetabet-dm-key:'), shared)
}

export function encryptText (plaintext, dmKey) {
  const nonce = b4a.alloc(sodium.crypto_secretbox_NONCEBYTES)
  sodium.randombytes_buf(nonce)
  const message = b4a.from(plaintext)
  const ciphertext = b4a.alloc(message.byteLength + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(ciphertext, message, nonce, dmKey)
  return {
    nonce: b4a.toString(nonce, 'hex'),
    ciphertext: b4a.toString(ciphertext, 'hex'),
  }
}

export function decryptText (payload, dmKey) {
  const nonce = b4a.from(payload.nonce, 'hex')
  const ciphertext = b4a.from(payload.ciphertext, 'hex')
  const plaintext = b4a.alloc(ciphertext.byteLength - sodium.crypto_secretbox_MACBYTES)
  if (!sodium.crypto_secretbox_open_easy(plaintext, ciphertext, nonce, dmKey)) {
    throw new Error('Could not decrypt message')
  }
  return b4a.toString(plaintext)
}

export function signCanonical (identity, payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return b4a.toString(crypto.sign(b4a.from(body), identity.secretKey), 'hex')
}

export function verifyCanonical (publicKeyHex, payload, signatureHex) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return crypto.verify(
    b4a.from(body),
    b4a.from(signatureHex, 'hex'),
    b4a.from(publicKeyHex, 'hex')
  )
}

export function myPubkeyHex (identity) {
  return b4a.toString(identity.publicKey, 'hex')
}
