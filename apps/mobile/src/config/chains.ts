export type ThetaChainId = 'polygonAmoy'

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
  /** WDK network key when using real wallet addresses */
  wdkNetworkKey?: 'polygon' | 'ethereum'
}

export const DEFAULT_CHAIN_ID: ThetaChainId = 'polygonAmoy'

export const THETA_CHAINS: Record<ThetaChainId, ThetaChainDefinition> = {
  polygonAmoy: {
    id: 'polygonAmoy',
    name: 'Polygon Amoy',
    shortName: 'Amoy',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeSymbol: 'MATIC',
    icon: require('../../assets/images/chains/polygon-matic-logo.png'),
    wdkNetworkKey: 'polygon',
    assets: [
      {
        id: 'matic',
        name: 'Polygon',
        symbol: 'MATIC',
        decimals: 18,
        icon: require('../../assets/images/chains/polygon-matic-logo.png'),
      },
      {
        id: 'betToken',
        name: 'Azuro Bet Token',
        symbol: 'BET',
        decimals: 6,
        contractAddress: '0xCf1b86ceD971b88C042C64A9c099377e2738073C',
        icon: require('../../assets/images/tokens/tether-usdt-logo.png'),
      },
    ],
  },
}

export const ENABLED_CHAIN_IDS: ThetaChainId[] = ['polygonAmoy']

export function getChain(chainId: ThetaChainId = DEFAULT_CHAIN_ID) {
  return THETA_CHAINS[chainId]
}

export function shortenAddress(address: string, chars = 4) {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}
