import { WDK_NETWORK_KEY } from '@/config/chains'
import { getWdkManager } from '@/services/wdk-bare-api'

const ACCOUNT_INDEX = 0

/** EOA on Polygon — used for display, receive, and on-chain actions in this app. */
export async function getPolygonWalletAddress(): Promise<string | null> {
  try {
    const manager = getWdkManager() as {
      getAddress: (args: { network: string; accountIndex: number }) => Promise<{ address: string }>
    }
    const response = await manager.getAddress({
      network: WDK_NETWORK_KEY,
      accountIndex: ACCOUNT_INDEX,
    })
    return response?.address ?? null
  } catch (error) {
    console.error('Failed to resolve Polygon wallet address:', error)
    return null
  }
}

/** @deprecated Use getPolygonWalletAddress */
export const getAmoyWalletAddress = getPolygonWalletAddress
