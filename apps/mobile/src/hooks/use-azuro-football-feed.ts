import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchFootballNavigation,
  fetchFootballSportsFeed,
  fetchBettableFootballFromChain,
  pickTopEvent,
} from '@/services/azuro/feed'
import type { AzuroFootballSection, AzuroLeagueRef } from '@/types/azuro'

export function useAzuroFootballFeed(
  selectedLeagueSlug?: string | null,
  bettableOnly = true
) {
  const [sections, setSections] = useState<AzuroFootballSection[]>([])
  const [leagues, setLeagues] = useState<AzuroLeagueRef[]>([])
  const [upcomingGames, setUpcomingGames] = useState<Awaited<
    ReturnType<typeof fetchFootballSportsFeed>
  >['games']>([])
  const [liveGames, setLiveGames] = useState<Awaited<
    ReturnType<typeof fetchFootballSportsFeed>
  >['games']>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)

    const leagueSlug = selectedLeagueSlug?.trim() || undefined

    try {
      const loadFeed = bettableOnly ? fetchBettableFootballFromChain : fetchFootballSportsFeed

      const prematch = await loadFeed({
        gameState: 'Prematch',
        leagueSlug,
        numberOfGames: 30,
      })

      let live = { sections: [] as AzuroFootballSection[], leagues: [] as AzuroLeagueRef[], games: [] as typeof prematch.games }
      try {
        live = await loadFeed({
          gameState: 'Live',
          leagueSlug,
          numberOfGames: 20,
        })
      } catch (liveError) {
        console.warn('Azuro live feed unavailable:', liveError)
      }

      let navigation: AzuroLeagueRef[] = []
      try {
        navigation = await fetchFootballNavigation()
      } catch (navError) {
        console.warn('Azuro navigation unavailable:', navError)
      }

      setSections(prematch.sections)
      setLeagues(navigation.length > 0 ? navigation : prematch.leagues)
      setUpcomingGames(prematch.games)
      setLiveGames(live.games)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [bettableOnly, selectedLeagueSlug])

  useEffect(() => {
    refresh()
  }, [refresh])

  const topEvent = useMemo(() => {
    return pickTopEvent([...liveGames, ...upcomingGames])
  }, [liveGames, upcomingGames])

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

    return Array.from(byLeague.values())
  }, [sections, selectedLeagueSlug, upcomingGames])

  return {
    topEvent,
    liveGames,
    upcomingGames,
    groupedUpcoming,
    sections,
    leagues,
    isLoading,
    isRefreshing,
    error,
    refresh,
    bettableOnly,
  }
}
