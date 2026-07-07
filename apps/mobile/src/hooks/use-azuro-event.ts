import { useCallback, useEffect, useState } from 'react'
import { fetchGameById, fetchGameConditions } from '@/services/azuro/feed'
import {
  getAzuroOnChainMarketStatus,
  isAzuroGameOnChain,
  type AzuroOnChainMarketStatus,
} from '@/services/azuro/onchain-feed'
import type { ConditionDetailedData, GameData } from '@azuro-org/toolkit'

export function useAzuroEvent(gameId: string | undefined) {
  const [game, setGame] = useState<GameData | null>(null)
  const [conditions, setConditions] = useState<ConditionDetailedData[]>([])
  const [isOnChain, setIsOnChain] = useState<boolean | null>(null)
  const [marketStatus, setMarketStatus] = useState<AzuroOnChainMarketStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!gameId) {
      setGame(null)
      setConditions([])
      setIsOnChain(null)
      setMarketStatus(null)
      setIsLoading(false)
      return
    }

    setIsRefreshing(true)
    setError(null)
    try {
      const [nextGame, nextConditions, onChain] = await Promise.all([
        fetchGameById(gameId),
        fetchGameConditions(gameId),
        isAzuroGameOnChain(gameId),
      ])
      setGame(nextGame)
      setConditions(nextConditions)
      setIsOnChain(onChain)
      setMarketStatus(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setIsLoading(false)
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
    isRefreshing,
    error,
    refresh,
    refreshMarketStatus,
  }
}
