import { resolveWalletTipsterHandle } from '@/services/tipster-handle'
import { useCallback, useEffect, useState } from 'react'

export function useOnChainHandle(walletAddress?: string) {
  const [handle, setHandle] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!walletAddress) {
      setHandle(null)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const next = await resolveWalletTipsterHandle(walletAddress)
      setHandle(next)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
      setHandle(null)
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    handle,
    hasHandle: Boolean(handle),
    isLoading,
    error,
    refresh,
  }
}
