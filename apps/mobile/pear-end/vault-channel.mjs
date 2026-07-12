import b4a from 'b4a'
import crypto from 'hypercore-crypto'

const VAULT_ADDRESS_RE = /^0x[a-f0-9]{40}$/

export function normalizeVaultAddress (vaultAddress) {
  const normalized = String(vaultAddress || '').trim().toLowerCase()
  if (!VAULT_ADDRESS_RE.test(normalized)) {
    throw new Error('Invalid vault address: ' + vaultAddress)
  }
  return normalized
}

/** Separate DHT topic for exchanging writer pubkeys (opens outbox cores before replication). */
export function vaultPeerTopicKey (vaultAddress) {
  const normalized = normalizeVaultAddress(vaultAddress)
  const topicSeed = crypto.hash(b4a.from('thetabet-vault-peer-v1:' + normalized))
  return b4a.toString(topicSeed, 'hex')
}

/** Deterministic swarm topic — shared by all vault members. */
export function vaultChannelKeys (vaultAddress) {
  const normalized = normalizeVaultAddress(vaultAddress)
  const topicSeed = crypto.hash(b4a.from('thetabet-vault-topic-v1:' + normalized))
  const coreSeed = crypto.hash(b4a.from('thetabet-vault-core-v1:' + normalized))
  const keyPair = crypto.keyPair(coreSeed)
  return {
    vaultAddress: normalized,
    topicKey: b4a.toString(topicSeed, 'hex'),
    coreKeyPair: {
      publicKey: keyPair.publicKey,
      secretKey: keyPair.secretKey,
    },
  }
}

/** Stable writer id for PC console peers using the dev bypass tag. */
export function vaultDevWriterId (bypassTag) {
  const tag = String(bypassTag || '').trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(tag)) {
    throw new Error('Invalid dev bypass tag for vault writer: ' + bypassTag)
  }
  return 'dev:' + tag
}

export function isVaultWriterId (writerId) {
  const writer = String(writerId || '').trim().toLowerCase()
  if (!writer) return false
  if (writer.startsWith('dev:')) return /^dev:[0-9a-f]+$/.test(writer)
  return /^[0-9a-f]+$/.test(writer)
}

/** Per-writer outbox — each device appends only to its own core (avoids hypercore fork conflicts). */
export function vaultOutboxKeyPair (vaultAddress, writerId) {
  const normalized = normalizeVaultAddress(vaultAddress)
  const writer = String(writerId || '').trim().toLowerCase()
  if (!isVaultWriterId(writer)) {
    throw new Error('Invalid vault outbox writer id: ' + writerId)
  }
  const seed = crypto.hash(b4a.from('thetabet-vault-outbox-v1:' + normalized + ':' + writer))
  const keyPair = crypto.keyPair(seed)
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  }
}

export function vaultChannelId (vaultAddress) {
  return vaultChannelKeys(vaultAddress).topicKey.slice(0, 16)
}

export function isVaultChannel (channel) {
  return channel?.kind === 'vault' && Boolean(channel.vaultAddress)
}

export function assertVaultSendAllowed (channel, payload) {
  if (!isVaultChannel(channel)) return

  if (payload.gateBypass && channel.devBypassTag && payload.gateBypass === channel.devBypassTag) {
    return
  }

  if (!payload.wallet || !payload.walletSignature || !payload.sharesSnapshot || !payload.signedAt) {
    throw new Error('Vault channel messages require a signed wallet proof or dev bypass tag')
  }
}
