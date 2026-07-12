import { useAzuroFootballFeed } from '@/hooks/use-azuro-football-feed'
import {
  buildMatchCatalog,
  dedupeGames,
  filterCatalogGames,
} from '@/services/tipster-notes/match-catalog'
import {
  fetchBettableFootballPage,
  mergeFootballGames,
} from '@/services/azuro/feed'
import type { GameData } from '@azuro-org/toolkit'
import { useCallback, useEffect, useMemo, useState } from 'react'

export function useAzuroMatchCatalog() {
  const feed = useAzuroFootballFeed(null)
  const [leagueGames, setLeagueGames] = useState<GameData[]>([])
  const [loadingLeagueGames, setLoadingLeagueGames] = useState(false)
  const [activeLeagueSlug, setActiveLeagueSlug] = useState<string | null>(null)

  const snapshotGames = useMemo(
    () => dedupeGames([...feed.liveGames, ...feed.upcomingGames]),
    [feed.liveGames, feed.upcomingGames]
  )

  const loadLeagueGames = useCallback(async (leagueSlug: string) => {
    const slug = leagueSlug.trim()
    if (!slug) return

    setActiveLeagueSlug(slug)
    setLoadingLeagueGames(true)
    try {
      const [prematch, live] = await Promise.all([
        fetchBettableFootballPage({ leagueSlug: slug, page: 1, perPage: 50 }),
        fetchBettableFootballPage({
          leagueSlug: slug,
          gameState: 'Live',
          page: 1,
          perPage: 20,
        }).catch(() => ({ games: [] as GameData[], hasMore: false })),
      ])
      setLeagueGames(mergeFootballGames(prematch.games, live.games))
    } catch (error) {
      console.warn('Failed to load league matches for tipster picker:', error)
      setLeagueGames([])
    } finally {
      setLoadingLeagueGames(false)
    }
  }, [])

  useEffect(() => {
    if (!activeLeagueSlug) {
      setLeagueGames([])
    }
  }, [activeLeagueSlug])

  const gamesForCatalog = activeLeagueSlug ? leagueGames : snapshotGames

  const catalog = useMemo(
    () => buildMatchCatalog(feed.leagues, gamesForCatalog),
    [feed.leagues, gamesForCatalog]
  )

  const getTeamsForLeague = useCallback(
    (leagueSlug: string | null) => {
      if (!leagueSlug) return []
      return catalog.teamsByLeague[leagueSlug] ?? []
    },
    [catalog.teamsByLeague]
  )

  const getMatchesFor = useCallback(
    (leagueSlug: string | null, teamKey: string | null) =>
      filterCatalogGames(catalog.games, leagueSlug, teamKey),
    [catalog.games]
  )

  return {
    leagues: catalog.leagues,
    games: catalog.games,
    getTeamsForLeague,
    getMatchesFor,
    loadLeagueGames,
    loading: feed.isLoading,
    loadingLeagueGames,
    refreshing: feed.isRefreshing,
    error: feed.error,
    refresh: feed.refresh,
    activeLeagueSlug,
    setActiveLeagueSlug,
  }
}
