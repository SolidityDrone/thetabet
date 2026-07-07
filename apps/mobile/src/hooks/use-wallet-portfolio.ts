import {
  DEFAULT_CHAIN_ID,
  ENABLED_CHAIN_IDS,
  getChain,
  type ThetaChainId,
} from '@/config/chains'
import { useAppMode } from '@/context/app-mode'
import { fetchChainBalances, type ChainAssetBalance } from '@/services/chain-balances'
import { useThetaWalletAddress } from '@/hooks/use-theta-wallet-address'
import { useWallet } from '@tetherto/wdk-react-native-provider'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export function useWalletPortfolio(chainId: ThetaChainId = DEFAULT_CHAIN_ID) {
  const chain = getChain(chainId)
  const { hasSkippedWallet } = useAppMode()
  const { address, shortAddress, isResolving: isResolvingAddress } = useThetaWalletAddress()
  const { wallet, isUnlocked } = useWallet()

  const [assets, setAssets] = useState<ChainAssetBalance[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef(false)

  const walletLabel = hasSkippedWallet ? 'Dev wallet' : wallet?.name || 'Wallet'
  const canSend = !hasSkippedWallet && !!wallet && isUnlocked

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return

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

    inFlightRef.current = true
    setIsRefreshing(true)
    setError(null)
    try {
      const nextAssets = await fetchChainBalances(chain, address)
      setAssets(nextAssets)
      setHasLoadedOnce(true)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      inFlightRef.current = false
      setIsRefreshing(false)
    }
  }, [address, chain])

  useEffect(() => {
    void refresh()
  }, [address, refresh])

  const totalMatic = useMemo(() => {
    const native = assets.find((item) => item.asset.id === 'matic')
    return native?.balanceNumber ?? 0
  }, [assets])

  const isLoading = !hasLoadedOnce && (isResolvingAddress || (!address && !hasSkippedWallet))

  return {
    chain,
    chainId,
    enabledChains: ENABLED_CHAIN_IDS,
    address,
    shortAddress,
    walletLabel,
    hasSkippedWallet,
    canSend,
    assets,
    totalMatic,
    isLoading,
    isRefreshing,
    error,
    refresh,
  }
}
