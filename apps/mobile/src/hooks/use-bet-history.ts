import type { Address } from 'viem'
import { useCallback, useEffect, useState } from 'react'
import { fetchAcceptedBetHistory, type BetHistoryItem } from '@/services/azuro/bet-history'

export function useBetHistory(bettor: Address | '') {
  const [bets, setBets] = useState<BetHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)

    try {
      if (!bettor) {
        setBets([])
        return
      }

      const history = await fetchAcceptedBetHistory(bettor)
      setBets(history)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [bettor])

  useEffect(() => {
    setIsLoading(true)
    refresh()
  }, [refresh])

  return {
    bets,
    isLoading,
    isRefreshing,
    error,
    refresh,
  }
}
