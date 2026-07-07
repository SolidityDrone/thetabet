import { shortenAddress } from '@/config/chains'
import { useAppMode } from '@/context/app-mode'
import { getPolygonWalletAddress } from '@/services/wdk-address'
import { NetworkType, useWallet } from '@tetherto/wdk-react-native-provider'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Resolves the wallet address used on Polygon mainnet.
 */
export function useThetaWalletAddress() {
  const { hasSkippedWallet, devWalletAddress } = useAppMode()
  const { wallet, addresses, isUnlocked } = useWallet()
  const [polygonAddress, setPolygonAddress] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const resolvedForWalletRef = useRef<string | null>(null)

  const walletKey = wallet?.id ?? wallet?.name ?? ''
  const cachedPolygonAddress = addresses?.[NetworkType.POLYGON] ?? null

  useEffect(() => {
    if (hasSkippedWallet) {
      setPolygonAddress(devWalletAddress)
      resolvedForWalletRef.current = 'dev'
      return
    }

    if (!walletKey || !isUnlocked) {
      setPolygonAddress(null)
      resolvedForWalletRef.current = null
      return
    }

    if (cachedPolygonAddress) {
      setPolygonAddress(cachedPolygonAddress)
      resolvedForWalletRef.current = walletKey
      return
    }

    if (resolvedForWalletRef.current === walletKey) {
      return
    }

    let cancelled = false
    setIsResolving(true)
    getPolygonWalletAddress()
      .then((resolved) => {
        if (!cancelled) {
          setPolygonAddress(resolved)
          resolvedForWalletRef.current = walletKey
        }
      })
      .finally(() => {
        if (!cancelled) setIsResolving(false)
      })

    return () => {
      cancelled = true
    }
  }, [walletKey, isUnlocked, hasSkippedWallet, devWalletAddress, cachedPolygonAddress])

  const address = useMemo(() => {
    if (hasSkippedWallet) return devWalletAddress
    return cachedPolygonAddress || polygonAddress || ''
  }, [hasSkippedWallet, devWalletAddress, cachedPolygonAddress, polygonAddress])

  return {
    address,
    shortAddress: shortenAddress(address),
    isResolving: isResolving && !address,
  }
}
