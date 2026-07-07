import type { Address } from 'viem'
import { useCallback, useEffect, useState } from 'react'
import {
  fetchRemoteBets,
  loadLocalBets,
  summarizeBetOrder,
} from '@/services/azuro/bet-history'
import type { AzuroPlacedBetRecord } from '@/types/azuro'

export function useBetHistory(bettor: Address | '') {
  const [localBets, setLocalBets] = useState<AzuroPlacedBetRecord[]>([])
  const [remoteBets, setRemoteBets] = useState<ReturnType<typeof summarizeBetOrder>[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const local = await loadLocalBets()
      setLocalBets(local)

      if (bettor) {
        const remote = await fetchRemoteBets(bettor)
        setRemoteBets(remote.map(summarizeBetOrder))
      } else {
        setRemoteBets([])
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [bettor])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    localBets,
    remoteBets,
    isLoading,
    isRefreshing,
    error,
    refresh,
  }
}
