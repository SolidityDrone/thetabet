import { THETA_DEPLOYMENT } from '@/config/contracts.generated'

let cachedPolUsd: { value: number; fetchedAt: number } | null = null
const CACHE_MS = 5 * 60 * 1000

export async function getPolUsdPrice(): Promise<number> {
  if (cachedPolUsd && Date.now() - cachedPolUsd.fetchedAt < CACHE_MS) {
    return cachedPolUsd.value
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=usd'
    )
    if (!response.ok) {
      throw new Error(`Price API ${response.status}`)
    }
    const json = (await response.json()) as {
      'polygon-ecosystem-token'?: { usd?: number }
    }
    const value = json['polygon-ecosystem-token']?.usd
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('POL price unavailable')
    }
    cachedPolUsd = { value, fetchedAt: Date.now() }
    return value
  } catch (error) {
    console.warn('POL USD price fetch failed:', error)
    return cachedPolUsd?.value ?? 0
  }
}

/** Dev-only sanity check that RPC is reachable — not used for pricing. */
export function getPolygonRpcUrl() {
  return THETA_DEPLOYMENT.rpcUrl
}
