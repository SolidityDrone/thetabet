import { fetchVaultBets } from '@/services/ponder/vault-bets'
import type { VaultBetRecord } from '@/types/vault-bet'
import { useCallback, useEffect, useRef, useState } from 'react'

const PAGE_SIZE = 20

export function useVaultBets(vaultId?: string) {
  const [bets, setBets] = useState<VaultBetRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef(false)

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!vaultId || inFlightRef.current) return

      inFlightRef.current = true
      if (append) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }
      setError(null)

      try {
        const page = await fetchVaultBets(vaultId, PAGE_SIZE, offset)
        setTotalCount(page.totalCount)
        setHasMore(page.hasMore)
        setBets((current) => (append ? [...current, ...page.bets] : page.bets))
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
        if (!append) {
          setBets([])
          setTotalCount(0)
          setHasMore(false)
        }
      } finally {
        inFlightRef.current = false
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [vaultId]
  )

  useEffect(() => {
    setBets([])
    setTotalCount(0)
    setHasMore(false)
    void loadPage(0, false)
  }, [loadPage])

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isLoading) return
    void loadPage(bets.length, true)
  }, [bets.length, hasMore, isLoading, isLoadingMore, loadPage])

  const refresh = useCallback(() => loadPage(0, false), [loadPage])

  return {
    bets,
    totalCount,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    loadMore,
    refresh,
  }
}
