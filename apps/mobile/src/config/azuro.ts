import { chainsData, Environment, ODDS_DECIMALS, type ChainId } from '@azuro-org/toolkit'
import { getChain } from '@/config/chains'

export const AZURO_CHAIN_ID = 137 satisfies ChainId
export const AZURO_ENV = Environment.PolygonUSDT
export const AZURO_FOOTBALL_SLUG = 'football'
export const AZURO_WORLD_CUP_LEAGUE_SLUG = 'world-cup'
export const AZURO_MIN_PER_PAGE = 10

/** Polygon mainnet Azuro REST API */
export const AZURO_API_BASE = 'https://api.onchainfeed.org/api/v1/public'
export const AZURO_API_ENVIRONMENT = 'PolygonUSDT'

export const azuroChainConfig = chainsData[AZURO_CHAIN_ID]
export const azuroContracts = azuroChainConfig.contracts
export const azuroBetToken = azuroChainConfig.betToken

/** Zero address — valid when no affiliate is configured */
export const AZURO_ZERO_AFFILIATE = '0x0000000000000000000000000000000000000000' as const

/** Azuro betting guide */
export const AZURO_BETTING_GUIDE_URL =
  'https://gem.azuro.org/hub/apps/guides/advanced/live/prepare-for-betting'

/** Native USDT on Polygon (Azuro bet token) */
export const AZURO_BET_TOKEN_EXPLORER_URL =
  'https://polygonscan.com/address/0xc2132D05D31c914a87C6611C10748AEb04B58e8F'

export const thetaChain = getChain('polygon')

export function formatAzuroOdds(rawOdds: string): number {
  const value = rawOdds?.trim()
  if (!value) return 0

  if (value.includes('.') || Number(value) < 1000) {
    const decimal = Number(value)
    return Number.isFinite(decimal) ? decimal : 0
  }

  const scaled = Number(value) / 10 ** ODDS_DECIMALS
  return Number.isFinite(scaled) ? scaled : 0
}

export function formatAzuroOddsDisplay(rawOdds: string): string {
  const decimal = formatAzuroOdds(rawOdds)
  if (decimal <= 0) return '—'
  return decimal.toFixed(2)
}
