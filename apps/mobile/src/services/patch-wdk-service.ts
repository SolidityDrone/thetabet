import { WDK_NETWORK_KEY } from '@/config/chains'
import { AssetTicker, NetworkType, wdkService } from '@tetherto/wdk-react-native-provider'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY_ADDRESSES = 'wdk_wallet_addresses'

type WdkServiceInstance = typeof wdkService & {
  __thetaPatched?: boolean
  config?: { indexer?: { apiKey?: string } }
}

function hasIndexerApiKey(service: WdkServiceInstance): boolean {
  return Boolean(service.config?.indexer?.apiKey?.trim())
}

/** Drop cached null addresses so WDK re-resolves after a failed wallet setup. */
export async function clearEmptyWalletAddressCache(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY_ADDRESSES)
  if (!stored) return false

  try {
    const parsed = JSON.parse(stored) as Record<string, string | null>
    const hasAddress = Object.values(parsed).some(
      (value) => typeof value === 'string' && value.length > 0
    )
    if (hasAddress) return false
    await AsyncStorage.removeItem(STORAGE_KEY_ADDRESSES)
    return true
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY_ADDRESSES)
    return true
  }
}

/** Polygon mainnet address + skip cloud indexer when no API key. */
export function patchWdkService(): void {
  const service = wdkService as WdkServiceInstance
  if (service.__thetaPatched) return

  const originalCreateWallet = service.createWallet.bind(service)
  const originalGetAssetAddress = service.getAssetAddress.bind(service)
  const originalResolveBalances = service.resolveWalletBalances.bind(service)
  const originalResolveTransactions = service.resolveWalletTransactions.bind(service)

  service.createWallet = async function createWalletPatched(params) {
    const wallet = await originalCreateWallet(params)
    return { ...wallet, enabledAssets: [AssetTicker.USDT] }
  }

  service.getAssetAddress = async function getAssetAddressPatched(network, index) {
    if (network === NetworkType.POLYGON) {
      return this.wdkManager.getAddress({ network: WDK_NETWORK_KEY, accountIndex: index })
    }
    return originalGetAssetAddress(network, index)
  }

  service.resolveWalletAddresses = async function resolveWalletAddressesPatched(
    _enabledAssets: AssetTicker[],
    index = 0
  ) {
    try {
      const { address } = await this.wdkManager.getAddress({
        network: WDK_NETWORK_KEY,
        accountIndex: index,
      })
      return { [NetworkType.POLYGON]: address }
    } catch (error) {
      console.error('Error resolving Polygon address:', error)
      return { [NetworkType.POLYGON]: null }
    }
  }

  service.resolveWalletBalances = async function resolveWalletBalancesPatched(
    enabledAssets,
    networkAddresses
  ) {
    if (!hasIndexerApiKey(this as WdkServiceInstance)) {
      return {}
    }
    return originalResolveBalances(enabledAssets, networkAddresses)
  }

  service.resolveWalletTransactions = async function resolveWalletTransactionsPatched(
    enabledAssets,
    networkAddresses
  ) {
    if (!hasIndexerApiKey(this as WdkServiceInstance)) {
      return {}
    }
    return originalResolveTransactions(enabledAssets, networkAddresses)
  }

  service.__thetaPatched = true
}

export async function bootstrapWdkService(): Promise<void> {
  patchWdkService()
  await clearEmptyWalletAddressCache()
}
