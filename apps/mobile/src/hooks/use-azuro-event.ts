import { useCallback, useEffect, useState } from 'react'
import { fetchGameById, fetchGameConditions } from '@/services/azuro/feed'
import {
  getAzuroOnChainMarketStatus,
  type AzuroOnChainMarketStatus,
} from '@/services/azuro/onchain-feed'
import type { ConditionDetailedData, GameData } from '@azuro-org/toolkit'

export function useAzuroEvent(gameId: string | undefined) {
  const [game, setGame] = useState<GameData | null>(null)
  const [conditions, setConditions] = useState<ConditionDetailedData[]>([])
  const [isOnChain, setIsOnChain] = useState<boolean | null>(null)
  const [marketStatus, setMarketStatus] = useState<AzuroOnChainMarketStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!gameId) {
      setGame(null)
      setConditions([])
      setIsOnChain(null)
      setMarketStatus(null)
      setIsLoading(false)
      setIsLoadingMarkets(false)
      return
    }

    setIsRefreshing(true)
    setError(null)
    setIsLoadingMarkets(true)

    try {
      const nextGame = await fetchGameById(gameId)
      setGame(nextGame)
      setIsLoading(false)

      const nextConditions = await fetchGameConditions(gameId)
      setConditions(nextConditions)
      setIsOnChain(nextConditions.length > 0)
      setMarketStatus(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      setIsLoading(false)
    } finally {
      setIsLoadingMarkets(false)
      setIsRefreshing(false)
    }
  }, [gameId])

  const refreshMarketStatus = useCallback(
    async (selection: { conditionId: string; outcomeId: string }) => {
      if (!gameId) {
        setMarketStatus(null)
        return null
      }

      try {
        const status = await getAzuroOnChainMarketStatus({
          gameId,
          conditionId: selection.conditionId,
          outcomeId: selection.outcomeId,
        })
        setMarketStatus(status)
        return status
      } catch (statusError) {
        console.warn('Azuro on-chain market check failed:', statusError)
        setMarketStatus(null)
        return null
      }
    },
    [gameId]
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    game,
    conditions,
    isOnChain,
    marketStatus,
    isLoading,
    isLoadingMarkets,
    isRefreshing,
    error,
    refresh,
    refreshMarketStatus,
  }
}
