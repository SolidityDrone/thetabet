import { GameState, type GameData, type ConditionDetailedData } from '@azuro-org/toolkit'
import { AZURO_FOOTBALL_SLUG } from '@/config/azuro'
import {
  fetchAzuroConditionsByGameIds,
  fetchAzuroGamesByIds,
  fetchAzuroNavigation,
  fetchAzuroSports,
} from '@/services/azuro/api-client'
import { fetchOnChainFootballBettableGameIds } from '@/services/azuro/onchain-feed'
import type { AzuroFootballSection, AzuroLeagueRef } from '@/types/azuro'

export function isRealFootballGame(game: GameData): boolean {
  const haystack = [
    game.title,
    ...game.participants.map((participant) => participant.name),
    game.league?.name ?? '',
  ]
    .join(' ')
    .toLowerCase()

  if (haystack.includes('(esports)') || haystack.includes('efootball')) {
    return false
  }

  return game.sport?.slug === AZURO_FOOTBALL_SLUG
}

function sortByKickoff(games: GameData[]) {
  return [...games].sort(
    (left, right) => Number(left.startsAt) - Number(right.startsAt)
  )
}

function flattenSportsTree(
  sports: Awaited<ReturnType<typeof fetchAzuroSports>>['sports'],
  gameStateFilter?: 'Prematch' | 'Live'
) {
  const football = sports.find((sport) => sport.slug === AZURO_FOOTBALL_SLUG)
  if (!football) {
    return { sections: [] as AzuroFootballSection[], leagues: [] as AzuroLeagueRef[], games: [] as GameData[] }
  }

  const leagues: AzuroLeagueRef[] = []
  const sections: AzuroFootballSection[] = []
  const games: GameData[] = []

  for (const country of football.countries ?? []) {
    for (const league of country.leagues ?? []) {
      const leagueRef: AzuroLeagueRef = {
        slug: league.slug,
        name: league.name,
        countrySlug: country.slug,
        countryName: country.name,
        isTopLeague: league.isTopLeague,
      }
      leagues.push(leagueRef)

      const leagueGames = sortByKickoff(
        (league.games ?? []).filter((game) => {
          if (!isRealFootballGame(game)) return false
          if (!gameStateFilter) return true
          return game.state === gameStateFilter
        })
      )

      if (leagueGames.length > 0) {
        sections.push({ league: leagueRef, games: leagueGames })
        games.push(...leagueGames)
      }
    }
  }

  return { sections, leagues, games }
}

export async function fetchFootballSportsFeed(params?: {
  gameState?: 'Prematch' | 'Live'
  leagueSlug?: string
  numberOfGames?: number
}) {
  const gameState = params?.gameState ?? 'Prematch'
  const leagueSlug = params?.leagueSlug?.trim() || undefined
  const numberOfGames = params?.numberOfGames ?? 20

  const data = await fetchAzuroSports({
    gameState,
    sportSlug: AZURO_FOOTBALL_SLUG,
    leagueSlug,
    numberOfGames,
  })

  return flattenSportsTree(data.sports, gameState)
}

function gamesToFootballFeed(games: GameData[], gameState: 'Prematch' | 'Live') {
  const filtered = sortByKickoff(
    games.filter((game) => isRealFootballGame(game) && game.state === gameState)
  )

  const leagues: AzuroLeagueRef[] = []
  const sections: AzuroFootballSection[] = []
  const byLeague = new Map<string, AzuroFootballSection>()

  for (const game of filtered) {
    const slug = game.league?.slug ?? 'other'
    let section = byLeague.get(slug)
    if (!section) {
      const leagueRef: AzuroLeagueRef = {
        slug,
        name: game.league?.name ?? 'Other',
        countrySlug: game.country?.slug ?? '',
        countryName: game.country?.name ?? '',
        isTopLeague: game.league?.isTopLeague ?? false,
      }
      section = { league: leagueRef, games: [] }
      byLeague.set(slug, section)
      leagues.push(leagueRef)
      sections.push(section)
    }
    section.games.push(game)
  }

  return { sections, leagues, games: filtered }
}

async function hydrateGamesByIds(gameIds: string[]) {
  const games: GameData[] = []
  const seen = new Set<string>()

  for (let offset = 0; offset < gameIds.length; offset += 20) {
    const chunk = gameIds.slice(offset, offset + 20)
    const batch = await fetchAzuroGamesByIds(chunk)
    for (const game of batch) {
      const id = String(game.id)
      if (seen.has(id)) continue
      seen.add(id)
      games.push(game)
    }
  }

  return games
}

/** Bettable football from Polygon on-chain feed (not the REST preview catalog). */
export async function fetchBettableFootballFromChain(params?: {
  gameState?: 'Prematch' | 'Live'
  leagueSlug?: string
  numberOfGames?: number
}) {
  const gameState = params?.gameState ?? 'Prematch'
  const numberOfGames = params?.numberOfGames ?? 30
  const leagueSlug = params?.leagueSlug?.trim()

  const ids = await fetchOnChainFootballBettableGameIds({
    gameState,
    limit: leagueSlug ? numberOfGames * 6 : numberOfGames * 3,
  })

  let games = await hydrateGamesByIds(ids)
  if (leagueSlug) {
    games = games.filter((game) => game.league?.slug === leagueSlug)
  }

  games = sortByKickoff(games.filter((game) => game.state === gameState)).slice(0, numberOfGames)
  return gamesToFootballFeed(games, gameState)
}

export async function fetchFootballNavigation() {
  const data = await fetchAzuroNavigation()
  const football = data.sports.find((sport) => sport.slug === AZURO_FOOTBALL_SLUG)
  if (!football) {
    return []
  }

  const leagues: AzuroLeagueRef[] = []
  for (const country of football.countries ?? []) {
    for (const league of country.leagues ?? []) {
      leagues.push({
        slug: league.slug,
        name: league.name,
        countrySlug: country.slug,
        countryName: country.name,
        isTopLeague: league.isTopLeague,
      })
    }
  }

  return leagues.sort((left, right) => {
    if (left.isTopLeague !== right.isTopLeague) {
      return left.isTopLeague ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })
}

export async function fetchGameById(gameId: string) {
  const games = await fetchAzuroGamesByIds([gameId])
  return games[0] ?? null
}

export async function fetchGameConditions(gameId: string) {
  const conditions = await fetchAzuroConditionsByGameIds([gameId], true)

  return conditions.filter(
    (condition) =>
      condition.outcomes.some((outcome) => outcome.state === 'Active') &&
      (condition.isPrematchEnabled || condition.isLiveEnabled)
  ) as ConditionDetailedData[]
}

export function pickTopEvent(games: GameData[]): GameData | null {
  if (games.length === 0) return null

  const ranked = [...games].sort((left, right) => {
    const leftTop = left.league?.isTopLeague ? 1 : 0
    const rightTop = right.league?.isTopLeague ? 1 : 0
    if (leftTop !== rightTop) return rightTop - leftTop

    const leftLive = left.state === GameState.Live ? 1 : 0
    const rightLive = right.state === GameState.Live ? 1 : 0
    if (leftLive !== rightLive) return rightLive - leftLive

    return Number(left.startsAt) - Number(right.startsAt)
  })

  return ranked[0] ?? null
}

export function formatKickoff(startsAt: string) {
  const date = new Date(Number(startsAt) * 1000)
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getLiveLabel(game: GameData) {
  if (game.state === GameState.Live) {
    return 'LIVE'
  }
  if (game.state === GameState.Finished) {
    return 'FT'
  }
  if (game.state === GameState.Canceled) {
    return 'Canceled'
  }
  return formatKickoff(game.startsAt)
}
