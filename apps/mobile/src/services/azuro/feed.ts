import {
  GameState,
  getConditionsByGameIds,
  getConditionsState,
  getGamesByFilters,
  getGamesByIds,
  type ConditionDetailedData,
  type GameData,
} from '@azuro-org/toolkit'
import {
  AZURO_CHAIN_ID,
  AZURO_FOOTBALL_SLUG,
  AZURO_MIN_PER_PAGE,
  AZURO_WORLD_CUP_LEAGUE_SLUG,
} from '@/config/azuro'
import {
  fetchAzuroGamesByFilters,
  fetchAzuroNavigation,
  fetchAzuroSports,
  type AzuroGamesByFiltersResponse,
} from '@/services/azuro/api-client'
import { azuroCacheKey, getAzuroCache, setAzuroCache } from '@/services/azuro/cache'
import type { AzuroFootballSection, AzuroLeagueRef } from '@/types/azuro'

const GAMES_CACHE_TTL_MS = 60_000
const CONDITIONS_CACHE_TTL_MS = 30_000

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

export function sortFootballSections(sections: AzuroFootballSection[]) {
  const weight = (section: AzuroFootballSection) => {
    if (section.league.slug === AZURO_WORLD_CUP_LEAGUE_SLUG) return 0
    if (section.league.isTopLeague) return 1
    return 2
  }

  return [...sections].sort((left, right) => {
    const byLeague = weight(left) - weight(right)
    if (byLeague !== 0) return byLeague
    return left.league.name.localeCompare(right.league.name)
  })
}

/** World Cup and other headline leagues surface first in the all-football view. */
export function prioritizeFootballGames(games: GameData[]) {
  const weight = (game: GameData) => {
    if (game.league?.slug === AZURO_WORLD_CUP_LEAGUE_SLUG) return 0
    if (game.league?.isTopLeague) return 1
    return 2
  }

  return sortByKickoff(games).sort((left, right) => {
    const byLeague = weight(left) - weight(right)
    if (byLeague !== 0) return byLeague
    return Number(left.startsAt) - Number(right.startsAt)
  })
}

async function loadGamesByFilters(params: {
  gameState: 'Prematch' | 'Live'
  leagueSlug?: string
  page?: number
  perPage?: number
}): Promise<AzuroGamesByFiltersResponse> {
  const gameState = params.gameState
  const page = params.page ?? 1
  const perPage = Math.max(params.perPage ?? 15, AZURO_MIN_PER_PAGE)
  const leagueSlug = params.leagueSlug?.trim() || undefined

  const cacheKey = azuroCacheKey(['games', gameState, leagueSlug, page, perPage])
  const cached = getAzuroCache<AzuroGamesByFiltersResponse>(cacheKey)
  if (cached) return cached

  const directParams = {
    gameState,
    sportSlug: AZURO_FOOTBALL_SLUG,
    leagueSlug,
    page,
    perPage,
  }

  try {
    const result = await fetchAzuroGamesByFilters(directParams)
    setAzuroCache(cacheKey, result, GAMES_CACHE_TTL_MS)
    return result
  } catch {
    const state = gameState === 'Live' ? GameState.Live : GameState.Prematch
    const result = await getGamesByFilters({
      chainId: AZURO_CHAIN_ID,
      state,
      sportSlug: AZURO_FOOTBALL_SLUG,
      leagueSlug,
      page,
      perPage,
    })
    setAzuroCache(cacheKey, result, GAMES_CACHE_TTL_MS)
    return result
  }
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

export function gamesToFootballFeed(games: GameData[]) {
  const filtered = sortByKickoff(games.filter((game) => isRealFootballGame(game)))

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

  return {
    sections: sortFootballSections(sections),
    leagues,
    games: filtered,
  }
}

export type BettableFootballPage = ReturnType<typeof gamesToFootballFeed> & {
  page: number
  hasMore: boolean
  total: number
}

/** One page of bettable football from Azuro's betting API (games-by-filters). */
export async function fetchBettableFootballPage(params?: {
  gameState?: 'Prematch' | 'Live'
  leagueSlug?: string
  page?: number
  perPage?: number
}): Promise<BettableFootballPage> {
  const gameState = params?.gameState ?? 'Prematch'
  const page = params?.page ?? 1
  const perPage = Math.max(params?.perPage ?? 15, AZURO_MIN_PER_PAGE)
  const leagueSlug = params?.leagueSlug?.trim() || undefined

  const result = await loadGamesByFilters({
    gameState,
    leagueSlug,
    page,
    perPage,
  })

  const feed = gamesToFootballFeed(result.games ?? [])

  return {
    ...feed,
    page,
    hasMore: page < (result.totalPages ?? 1),
    total: result.total ?? feed.games.length,
  }
}

/**
 * Fast first paint: World Cup only (small, bettable, pinned to top).
 */
export async function fetchWorldCupFootballPage(): Promise<BettableFootballPage> {
  return fetchBettableFootballPage({
    leagueSlug: AZURO_WORLD_CUP_LEAGUE_SLUG,
    page: 1,
    perPage: 10,
  })
}

/**
 * Merge World Cup ahead of the general catalog for the all-football view.
 */
export async function fetchBettableFootballInitialBatch(params?: {
  leagueSlug?: string
  perPage?: number
}): Promise<BettableFootballPage> {
  const leagueSlug = params?.leagueSlug?.trim() || undefined
  const perPage = Math.max(params?.perPage ?? 12, AZURO_MIN_PER_PAGE)

  if (leagueSlug) {
    return fetchBettableFootballPage({ leagueSlug, page: 1, perPage })
  }

  const [main, worldCup] = await Promise.all([
    fetchBettableFootballPage({ page: 1, perPage }),
    fetchWorldCupFootballPage().catch((error) => {
      console.warn('Azuro World Cup feed unavailable:', error)
      return null
    }),
  ])

  const games = prioritizeFootballGames(
    mergeFootballGames(worldCup?.games ?? [], main.games)
  )
  const feed = gamesToFootballFeed(games)

  return {
    ...feed,
    page: 1,
    hasMore: main.hasMore,
    total: main.total + (worldCup?.total ?? 0),
  }
}

/** @deprecated Prefer fetchBettableFootballPage for progressive loading. */
export async function fetchBettableFootballFromChain(params?: {
  gameState?: 'Prematch' | 'Live'
  leagueSlug?: string
  numberOfGames?: number
}) {
  const page = await fetchBettableFootballPage({
    gameState: params?.gameState,
    leagueSlug: params?.leagueSlug,
    perPage: params?.numberOfGames ?? 30,
    page: 1,
  })
  return page
}

export function mergeFootballGames(existing: GameData[], incoming: GameData[]) {
  const seen = new Set(existing.map((game) => game.id))
  const merged = [...existing]
  for (const game of incoming) {
    if (seen.has(game.id)) continue
    seen.add(game.id)
    merged.push(game)
  }
  return sortByKickoff(merged.filter((game) => isRealFootballGame(game)))
}

async function verifyActiveConditions(
  conditions: ConditionDetailedData[]
): Promise<ConditionDetailedData[]> {
  if (conditions.length === 0) return []

  const states = await getConditionsState({
    chainId: AZURO_CHAIN_ID,
    conditionIds: conditions.map((condition) => condition.conditionId),
  })
  const stateById = new Map(states.map((row) => [row.conditionId, row]))

  return conditions
    .map((condition) => {
      const live = stateById.get(condition.conditionId)
      if (!live || live.state !== 'Active') return null

      const outcomes = condition.outcomes
        .map((outcome) => {
          const liveOutcome = live.outcomes.find(
            (row) => String(row.outcomeId) === String(outcome.outcomeId)
          )
          if (!liveOutcome || liveOutcome.state !== 'Active') return null
          return {
            ...outcome,
            odds: liveOutcome.odds,
            state: 'Active' as const,
          }
        })
        .filter(Boolean) as ConditionDetailedData['outcomes']

      if (outcomes.length === 0) return null

      return {
        ...condition,
        state: 'Active',
        outcomes,
      }
    })
    .filter(Boolean) as ConditionDetailedData[]
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
  const games = await getGamesByIds({ chainId: AZURO_CHAIN_ID, gameIds: [gameId] })
  return games[0] ?? null
}

/** Active markets for display — catalog games are already bettable; verify only when placing a bet. */
export async function fetchGameConditions(gameId: string, options?: { verify?: boolean }) {
  const cacheKey = azuroCacheKey(['conditions', gameId, options?.verify ? 'v' : 'f'])
  const cached = getAzuroCache<ConditionDetailedData[]>(cacheKey)
  if (cached) return cached

  const conditions = await getConditionsByGameIds({
    chainId: AZURO_CHAIN_ID,
    gameIds: [gameId],
    extended: true,
  })

  const active = conditions.filter(
    (condition) =>
      condition.outcomes.some((outcome) => outcome.state === 'Active') &&
      (condition.isPrematchEnabled || condition.isLiveEnabled)
  )

  const result = options?.verify ? await verifyActiveConditions(active) : active
  setAzuroCache(cacheKey, result, CONDITIONS_CACHE_TTL_MS)
  return result
}

export function pickTopEvent(games: GameData[]): GameData | null {
  if (games.length === 0) return null

  const ranked = prioritizeFootballGames(games).sort((left, right) => {
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
