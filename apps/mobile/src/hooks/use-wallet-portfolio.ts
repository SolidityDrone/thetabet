import {
  DEFAULT_CHAIN_ID,
  ENABLED_CHAIN_IDS,
  getChain,
  shortenAddress,
  type ThetaChainId,
} from '@/config/chains'
import { useAppMode } from '@/context/app-mode'
import { fetchChainBalances, type ChainAssetBalance } from '@/services/chain-balances'
import { NetworkType, useWallet } from '@tetherto/wdk-react-native-provider'
import { useCallback, useEffect, useMemo, useState } from 'react'

export function useWalletPortfolio(chainId: ThetaChainId = DEFAULT_CHAIN_ID) {
  const chain = getChain(chainId)
  const { hasSkippedWallet, devWalletAddress } = useAppMode()
  const {
    wallet,
    addresses,
    isLoading: isWalletLoading,
    refreshWalletBalance,
    isUnlocked,
  } = useWallet()

  const [assets, setAssets] = useState<ChainAssetBalance[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const address = useMemo(() => {
    if (hasSkippedWallet) {
      return devWalletAddress
    }
    if (!addresses) return ''
    const polygonAddress = addresses[NetworkType.POLYGON]
    if (polygonAddress) return polygonAddress
    return addresses[NetworkType.ETHEREUM] || ''
  }, [hasSkippedWallet, devWalletAddress, addresses])

  const walletLabel = hasSkippedWallet ? 'Dev wallet' : wallet?.name || 'Wallet'
  const canSend = !hasSkippedWallet && !!wallet && isUnlocked

  const refresh = useCallback(async () => {
    if (!address) {
      setAssets(
        chain.assets.map((asset) => ({
          asset,
          balance: '0',
          balanceNumber: 0,
        }))
      )
      return
    }

    setIsRefreshing(true)
    setError(null)
    try {
      if (!hasSkippedWallet && wallet) {
        await refreshWalletBalance()
      }
      const nextAssets = await fetchChainBalances(chain, address)
      setAssets(nextAssets)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setIsRefreshing(false)
    }
  }, [address, chain, hasSkippedWallet, refreshWalletBalance, wallet])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalMatic = useMemo(() => {
    const native = assets.find((item) => item.asset.id === 'matic')
    return native?.balanceNumber ?? 0
  }, [assets])

  return {
    chain,
    chainId,
    enabledChains: ENABLED_CHAIN_IDS,
    address,
    shortAddress: shortenAddress(address),
    walletLabel,
    hasSkippedWallet,
    canSend,
    assets,
    totalMatic,
    isLoading: isWalletLoading && !hasSkippedWallet,
    isRefreshing,
    error,
    refresh,
  }
}
