/**
 * Azuro Polygon mainnet REST client — params verified against live API (Jul 2026).
 * Run: npm run test:azuro-api
 */

import type { ConditionDetailedData, GameData } from '@azuro-org/toolkit'
import { AZURO_API_BASE, AZURO_API_ENVIRONMENT } from '@/config/azuro'

type QueryRecord = Record<string, string | number>

const SPORTS_QUERY_KEYS = new Set([
  'environment',
  'gameState',
  'sportSlug',
  'sportId',
  'countrySlug',
  'leagueSlug',
  'topLeagueFilter',
  'numberOfGames',
  'orderBy',
  'orderDirection',
])

const NAVIGATION_QUERY_KEYS = new Set(['environment', 'sportHub', 'sportId'])

function toQueryString(allowedKeys: Set<string>, params: QueryRecord) {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Azuro query param "${key}" is not allowed for this endpoint`)
    }
    if (value === '' || value === undefined || value === null) continue
    search.append(key, String(value))
  }

  return search.toString()
}

async function azuroGet<T>(path: string, allowedKeys: Set<string>, params: QueryRecord): Promise<T> {
  const query = toQueryString(allowedKeys, {
    environment: AZURO_API_ENVIRONMENT,
    ...params,
  })
  const url = `${AZURO_API_BASE}${path}?${query}`

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(`Azuro GET ${path} → ${response.status}: ${bodyText.slice(0, 240)}`)
  }

  return JSON.parse(bodyText) as T
}

async function azuroPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${AZURO_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(`Azuro POST ${path} → ${response.status}: ${bodyText.slice(0, 240)}`)
  }

  return JSON.parse(bodyText) as T
}

export type AzuroSportsResponse = {
  sports: Array<{
    id: number
    slug: string
    name: string
    sportId: string
    countries: Array<{
      slug: string
      name: string
      leagues: Array<{
        slug: string
        name: string
        isTopLeague: boolean
        games: GameData[]
      }>
    }>
  }>
}

export type AzuroNavigationResponse = {
  sports: Array<{
    slug: string
    name: string
    countries: Array<{
      slug: string
      name: string
      leagues: Array<{
        slug: string
        name: string
        isTopLeague: boolean
      }>
    }>
  }>
}

export async function fetchAzuroSports(params: {
  gameState: 'Prematch' | 'Live'
  sportSlug?: string
  leagueSlug?: string
  numberOfGames?: number
}) {
  const leagueSlug = params.leagueSlug?.trim()
  const query: QueryRecord = {
    gameState: params.gameState,
    sportSlug: params.sportSlug ?? 'football',
    numberOfGames: Math.max(params.numberOfGames ?? 10, 10),
    orderBy: 'startsAt',
    orderDirection: 'asc',
  }

  if (leagueSlug) {
    query.leagueSlug = leagueSlug
  }

  return azuroGet<AzuroSportsResponse>('/market-manager/sports', SPORTS_QUERY_KEYS, query)
}

export async function fetchAzuroNavigation() {
  return azuroGet<AzuroNavigationResponse>('/market-manager/navigation', NAVIGATION_QUERY_KEYS, {
    sportHub: 'sports',
  })
}

/** POST body must NOT include environment (API rejects it). */
export async function fetchAzuroGamesByIds(gameIds: string[]) {
  const data = await azuroPost<{ games: GameData[] }>('/market-manager/games-by-ids', {
    gameIds,
  })
  return data.games ?? []
}

/** POST body must include environment. */
export async function fetchAzuroConditionsByGameIds(gameIds: string[], extended = true) {
  const data = await azuroPost<{ conditions: ConditionDetailedData[] }>(
    '/market-manager/conditions-by-game-ids',
    {
      environment: AZURO_API_ENVIRONMENT,
      gameIds,
      extended,
    }
  )
  return data.conditions ?? []
}
