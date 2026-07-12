import { readVaultShareBalance } from '@/services/theta-vault'
import { recoverMessageAddress, type Address, type Hex } from 'viem'

export type VaultChannelAccess = {
  allowed: boolean
  role: 'owner' | 'investor' | 'denied'
  shares: bigint
  reason?: string
}

export function buildVaultChannelSignMessage(params: {
  channelId: string
  vaultAddress: string
  wallet: Address
  shares: bigint
  timestamp: number
}): string {
  return [
    'ThetaBet Vault Channel Join v1',
    `channel:${params.channelId}`,
    `vault:${params.vaultAddress.toLowerCase()}`,
    `wallet:${params.wallet.toLowerCase()}`,
    `shares:${params.shares.toString()}`,
    `timestamp:${params.timestamp}`,
  ].join('\n')
}

export async function checkVaultChannelAccess(
  vaultAddress: Address,
  tipsterAddress: Address,
  wallet: Address,
  minShares = 1n
): Promise<VaultChannelAccess> {
  if (wallet.toLowerCase() === tipsterAddress.toLowerCase()) {
    return { allowed: true, role: 'owner', shares: 0n }
  }

  const shares = await readVaultShareBalance(vaultAddress, wallet)
  if (shares >= minShares) {
    return { allowed: true, role: 'investor', shares }
  }

  return {
    allowed: false,
    role: 'denied',
    shares,
    reason: shares > 0n ? 'Insufficient vault shares' : 'Deposit into this vault to join chat',
  }
}

export async function verifyVaultChannelMessageSignature(message: {
  channelId: string
  vaultAddress: string
  wallet?: string
  walletSignature?: string
  sharesSnapshot?: string
  signedAt?: number
}): Promise<boolean> {
  if (
    !message.wallet ||
    !message.walletSignature ||
    !message.sharesSnapshot ||
    !message.signedAt
  ) {
    return false
  }

  const payload = buildVaultChannelSignMessage({
    channelId: message.channelId,
    vaultAddress: message.vaultAddress,
    wallet: message.wallet as Address,
    shares: BigInt(message.sharesSnapshot),
    timestamp: message.signedAt,
  })

  try {
    const recovered = await recoverMessageAddress({
      message: payload,
      signature: message.walletSignature as Hex,
    })
    return recovered.toLowerCase() === message.wallet.toLowerCase()
  } catch {
    return false
  }
}
