import { fetchLiveMatchStats, type LiveMatchStats } from '@/services/sports-media/live-match'
import type { GameData } from '@azuro-org/toolkit'
import { GameState } from '@azuro-org/toolkit'
import { useCallback, useEffect, useState } from 'react'

const LIVE_POLL_MS = 30_000

export function useLiveMatchStats(game?: GameData | null) {
  const [stats, setStats] = useState<LiveMatchStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLive = game?.state === GameState.Live

  const refresh = useCallback(async () => {
    if (!game || !isLive) {
      setStats(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const next = await fetchLiveMatchStats(game, { force: true })
      setStats(next)
      setError(next ? null : 'Live stats unavailable')
    } catch {
      setError('Could not load live stats')
    } finally {
      setIsLoading(false)
    }
  }, [game, isLive])

  useEffect(() => {
    if (!game || !isLive) {
      setStats(null)
      setError(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    void fetchLiveMatchStats(game)
      .then((next) => {
        if (cancelled) return
        setStats(next)
        setError(next ? null : 'Live stats unavailable')
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not load live stats')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    const interval = setInterval(() => {
      void fetchLiveMatchStats(game, { force: true }).then((next) => {
        if (!cancelled && next) {
          setStats(next)
          setError(null)
        }
      })
    }, LIVE_POLL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [game?.id, isLive])

  return {
    stats,
    isLoading,
    error,
    refresh,
  }
}
