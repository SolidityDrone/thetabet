export { normalizeTipsterHandle } from '@/services/ponder/tipster-names'
export type { TipsterNameRecord } from '@/services/ponder/tipster-names'

import { THETA_SINGLETON_ADDRESS, thetaSingletonAbi } from '@/config/theta'
import { THETA_DEPLOYMENT } from '@/config/contracts.generated'
import {
  fetchTipsterByAddress,
  fetchTipsterByHandle,
  normalizeTipsterHandle,
  type TipsterNameRecord,
} from '@/services/ponder/tipster-names'
import { createPublicClient, http, type Address } from 'viem'
import { polygon } from 'viem/chains'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

let publicClient: ReturnType<typeof createPublicClient> | null = null

function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: polygon,
      transport: http(THETA_DEPLOYMENT.rpcUrl),
    })
  }
  return publicClient
}

export async function lookupTipsterOnChain(handle: string): Promise<Address | null> {
  const normalized = normalizeTipsterHandle(handle)
  if (!normalized) return null

  const tipster = await getPublicClient().readContract({
    address: THETA_SINGLETON_ADDRESS,
    abi: thetaSingletonAbi,
    functionName: 'lookupTipsterByName',
    args: [normalized],
  })

  if (!tipster || tipster.toLowerCase() === ZERO_ADDRESS) return null
  return tipster
}

export async function readTipsterHandleForWallet(walletAddress: string): Promise<string | null> {
  if (!walletAddress) return null

  const handle = await getPublicClient().readContract({
    address: THETA_SINGLETON_ADDRESS,
    abi: thetaSingletonAbi,
    functionName: 'tipsterNames',
    args: [walletAddress as Address],
  })

  return handle?.length ? handle : null
}

export async function resolveTipsterHandle(handle: string): Promise<TipsterNameRecord | null> {
  const normalized = normalizeTipsterHandle(handle)
  if (!normalized) return null

  try {
    const indexed = await fetchTipsterByHandle(normalized)
    if (indexed) return indexed
  } catch {
    // Fall through to on-chain lookup.
  }

  const tipster = await lookupTipsterOnChain(normalized)
  if (!tipster) return null

  return {
    address: tipster,
    name: normalized,
    nameKey: normalized,
    pubKeyX: '0x0',
    pubKeyY: '0x0',
  }
}

export async function resolveWalletTipsterHandle(walletAddress: string): Promise<string | null> {
  if (!walletAddress) return null

  try {
    const indexed = await fetchTipsterByAddress(walletAddress)
    if (indexed?.name) return indexed.name
  } catch {
    // Fall through to on-chain lookup.
  }

  return readTipsterHandleForWallet(walletAddress)
}

export async function assertTipsterHandleExists(handle: string) {
  const tipster = await resolveTipsterHandle(handle)
  if (!tipster) {
    throw new Error(
      `@${normalizeTipsterHandle(handle)} is not registered on-chain. Handles are unique — register yours in Profile first.`
    )
  }
  return tipster
}

export async function assertWalletOwnsHandle(handle: string, walletAddress: string) {
  const tipster = await assertTipsterHandleExists(handle)
  if (tipster.address.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error('This wallet does not own that @handle on-chain.')
  }
  return tipster
}
