import { THETA_DEPLOYMENT } from '@/config/contracts.generated'

export type ThetaChainId = 'polygon'

export type ThetaAssetId = 'matic' | 'betToken'

export interface ThetaAssetDefinition {
  id: ThetaAssetId
  name: string
  symbol: string
  decimals: number
  contractAddress?: string
  icon: number
}

export interface ThetaChainDefinition {
  id: ThetaChainId
  name: string
  shortName: string
  chainId: number
  rpcUrl: string
  explorerUrl: string
  nativeSymbol: string
  icon: number
  assets: ThetaAssetDefinition[]
  /** WDK worklet network key — must be `polygon` (Polygon mainnet is chainId 137 in get-chains-config). */
  wdkNetworkKey: 'polygon'
}

export const DEFAULT_CHAIN_ID: ThetaChainId = 'polygon'

/** Network name the WDK worklet expects (Blockchain.Polygon — not `polygon` app id). */
export const WDK_NETWORK_KEY = 'polygon' as const

/** Polygon JSON-RPC — override with EXPO_PUBLIC_POLYGON_RPC_URL in .env */
export const POLYGON_RPC_URL =
  process.env.EXPO_PUBLIC_POLYGON_RPC_URL ?? THETA_DEPLOYMENT.rpcUrl

export const THETA_CHAINS: Record<ThetaChainId, ThetaChainDefinition> = {
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    shortName: 'Polygon',
    chainId: 137,
    rpcUrl: POLYGON_RPC_URL,
    explorerUrl: 'https://polygonscan.com',
    nativeSymbol: 'POL',
    icon: require('../../assets/images/chains/polygon-matic-logo.png'),
    wdkNetworkKey: 'polygon',
    assets: [
      {
        id: 'matic',
        name: 'Polygon',
        symbol: 'POL',
        decimals: 18,
        icon: require('../../assets/images/chains/polygon-matic-logo.png'),
      },
      {
        id: 'betToken',
        name: 'Tether USD',
        symbol: 'USDT',
        decimals: 6,
        contractAddress: THETA_DEPLOYMENT.betToken,
        icon: require('../../assets/images/tokens/tether-usdt-logo.png'),
      },
    ],
  },
}

export const ENABLED_CHAIN_IDS: ThetaChainId[] = ['polygon']

export function getChain(chainId: ThetaChainId = DEFAULT_CHAIN_ID) {
  return THETA_CHAINS[chainId]
}

export function shortenAddress(address: string, chars = 4) {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}
