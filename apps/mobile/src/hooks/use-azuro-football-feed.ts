import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchFootballNavigation,
  fetchBettableFootballPage,
  fetchWorldCupFootballPage,
  gamesToFootballFeed,
  mergeFootballGames,
  prioritizeFootballGames,
  sortFootballSections,
} from '@/services/azuro/feed'
import { fetchPolygonAzuroMarketSnapshot, type AzuroChainMarketSnapshot } from '@/services/azuro/onchain-feed'
import type { AzuroFootballSection, AzuroLeagueRef } from '@/types/azuro'
import type { GameData } from '@azuro-org/toolkit'

const PREMATCH_PAGE_SIZE = 10
const PREMATCH_TARGET = 30
const LIVE_PAGE_SIZE = 10

export function useAzuroFootballFeed(selectedLeagueSlug?: string | null) {
  const [sections, setSections] = useState<AzuroFootballSection[]>([])
  const [leagues, setLeagues] = useState<AzuroLeagueRef[]>([])
  const [upcomingGames, setUpcomingGames] = useState<GameData[]>([])
  const [liveGames, setLiveGames] = useState<GameData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [marketSnapshot, setMarketSnapshot] = useState<AzuroChainMarketSnapshot | null>(null)
  const refreshGeneration = useRef(0)

  const applyPrematchGames = useCallback((games: GameData[]) => {
    const feed = gamesToFootballFeed(prioritizeFootballGames(games))
    setSections(feed.sections)
    setUpcomingGames(feed.games)
    return feed
  }, [])

  const loadMorePrematch = useCallback(
    async (generation: number, leagueSlug: string | undefined, seedGames: GameData[]) => {
      const isStale = () => generation !== refreshGeneration.current
      if (seedGames.length >= PREMATCH_TARGET) return

      setIsLoadingMore(true)
      let games = [...seedGames]
      let page = 2

      try {
        while (games.length < PREMATCH_TARGET && page <= 3) {
          const nextPage = await fetchBettableFootballPage({
            gameState: 'Prematch',
            leagueSlug,
            page,
            perPage: PREMATCH_PAGE_SIZE,
          })

          if (isStale()) return

          games = mergeFootballGames(games, nextPage.games)
          applyPrematchGames(games)

          if (!nextPage.hasMore) break
          page += 1
        }
      } catch (loadError) {
        console.warn('Azuro prematch pagination unavailable:', loadError)
      } finally {
        if (!isStale()) {
          setIsLoadingMore(false)
        }
      }
    },
    [applyPrematchGames]
  )

  const refresh = useCallback(async () => {
    const generation = refreshGeneration.current + 1
    refreshGeneration.current = generation
    setIsRefreshing(true)
    setError(null)

    const leagueSlug = selectedLeagueSlug?.trim() || undefined
    const isStale = () => generation !== refreshGeneration.current

    try {
      if (leagueSlug) {
        const page = await fetchBettableFootballPage({
          leagueSlug,
          page: 1,
          perPage: PREMATCH_PAGE_SIZE,
        })
        if (isStale()) return
        const feed = applyPrematchGames(page.games)
        setLeagues(feed.leagues)
        setIsLoading(false)
        void loadMorePrematch(generation, leagueSlug, page.games)
      } else {
        const worldCup = await fetchWorldCupFootballPage().catch(() => null)
        if (isStale()) return

        if (worldCup && worldCup.games.length > 0) {
          const feed = applyPrematchGames(worldCup.games)
          setLeagues(feed.leagues)
          setIsLoading(false)
        }

        const main = await fetchBettableFootballPage({
          page: 1,
          perPage: PREMATCH_PAGE_SIZE,
        })
        if (isStale()) return

        const merged = prioritizeFootballGames(
          mergeFootballGames(worldCup?.games ?? [], main.games)
        )
        const feed = applyPrematchGames(merged)
        setLeagues(feed.leagues)
        setIsLoading(false)

        void loadMorePrematch(generation, undefined, merged)
      }

      void fetchBettableFootballPage({
        gameState: 'Live',
        leagueSlug,
        page: 1,
        perPage: LIVE_PAGE_SIZE,
      })
        .then((livePage) => {
          if (isStale()) return
          setLiveGames(livePage.games)
        })
        .catch((liveError) => {
          console.warn('Azuro live feed unavailable:', liveError)
        })

      void fetchFootballNavigation()
        .then((navigation) => {
          if (isStale()) return
          if (navigation.length > 0) {
            setLeagues(navigation)
          }
        })
        .catch((navError) => {
          console.warn('Azuro navigation unavailable:', navError)
        })

      void fetchPolygonAzuroMarketSnapshot()
        .then((snapshot) => {
          if (isStale()) return
          setMarketSnapshot(snapshot)
        })
        .catch((snapshotError) => {
          console.warn('Azuro market snapshot unavailable:', snapshotError)
        })
    } catch (refreshError) {
      if (!isStale()) {
        setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      }
    } finally {
      if (!isStale()) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [applyPrematchGames, loadMorePrematch, selectedLeagueSlug])

  useEffect(() => {
    setIsLoading(true)
    refresh()
  }, [refresh])

  const groupedUpcoming = useMemo(() => {
    if (selectedLeagueSlug) {
      return sections
    }

    const byLeague = new Map<string, AzuroFootballSection>()
    for (const game of upcomingGames) {
      const slug = game.league?.slug ?? 'other'
      const existing = byLeague.get(slug)
      if (existing) {
        existing.games.push(game)
        continue
      }
      byLeague.set(slug, {
        league: {
          slug,
          name: game.league?.name ?? 'Other',
          countrySlug: game.country?.slug ?? '',
          countryName: game.country?.name ?? '',
          isTopLeague: game.league?.isTopLeague ?? false,
        },
        games: [game],
      })
    }

    return sortFootballSections(Array.from(byLeague.values()))
  }, [sections, selectedLeagueSlug, upcomingGames])

  return {
    liveGames,
    upcomingGames,
    groupedUpcoming,
    sections,
    leagues,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    refresh,
    marketSnapshot,
  }
}
