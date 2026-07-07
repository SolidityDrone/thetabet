import { THE_SPORTS_DB_BASE } from '@/config/sports-media'
import {
  normalizeLeagueSearchName,
  normalizeTeamSearchName,
  pickSportsDbCountry,
  scoreNameMatch,
} from '@/services/sports-media/name-utils'
import { getCachedLogo, setCachedLogo } from '@/services/sports-media/logo-cache'

type SportsDbTeam = {
  strTeam?: string
  strTeamAlternate?: string
  strBadge?: string
  strLogo?: string
}

type SportsDbLeague = {
  strLeague?: string
  strLeagueAlternate?: string
  strBadge?: string
  strLogo?: string
  strCountry?: string
}

const leagueListsByCountry = new Map<string, SportsDbLeague[]>()
const inFlight = new Map<string, Promise<string | undefined>>()

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

function pickTeamBadge(team?: SportsDbTeam | null) {
  return team?.strBadge || team?.strLogo || undefined
}

function pickLeagueBadge(league?: SportsDbLeague | null) {
  return league?.strBadge || league?.strLogo || undefined
}

async function searchTeamOnSportsDb(teamName: string) {
  const query = encodeURIComponent(normalizeTeamSearchName(teamName))
  const data = await fetchJson<{ teams: SportsDbTeam[] | null }>(
    `${THE_SPORTS_DB_BASE}/searchteams.php?t=${query}`
  )
  const teams = data?.teams ?? []
  if (teams.length === 0) return undefined

  const ranked = [...teams].sort(
    (left, right) =>
      scoreNameMatch(teamName, right.strTeam ?? '') -
      scoreNameMatch(teamName, left.strTeam ?? '')
  )
  return pickTeamBadge(ranked[0])
}

async function loadLeaguesForCountry(country: string) {
  const cacheKey = country.toLowerCase()
  if (leagueListsByCountry.has(cacheKey)) {
    return leagueListsByCountry.get(cacheKey) ?? []
  }

  const data = await fetchJson<{ countries: SportsDbLeague[] | null }>(
    `${THE_SPORTS_DB_BASE}/search_all_leagues.php?s=Soccer&c=${encodeURIComponent(country)}`
  )
  const leagues = data?.countries ?? []
  leagueListsByCountry.set(cacheKey, leagues)
  return leagues
}

async function searchLeagueOnSportsDb(
  leagueName: string,
  countryName?: string | null,
  countrySlug?: string | null
) {
  const country = pickSportsDbCountry(countrySlug, countryName, leagueName)
  if (!country) return undefined

  const leagues = await loadLeaguesForCountry(country)
  if (leagues.length === 0) return undefined

  const target = normalizeLeagueSearchName(leagueName)
  const ranked = [...leagues].sort((left, right) => {
    const leftScore = Math.max(
      scoreNameMatch(target, left.strLeague ?? ''),
      scoreNameMatch(target, left.strLeagueAlternate ?? '')
    )
    const rightScore = Math.max(
      scoreNameMatch(target, right.strLeague ?? ''),
      scoreNameMatch(target, right.strLeagueAlternate ?? '')
    )
    return rightScore - leftScore
  })

  const best = ranked[0]
  if (!best) return undefined

  const bestScore = Math.max(
    scoreNameMatch(target, best.strLeague ?? ''),
    scoreNameMatch(target, best.strLeagueAlternate ?? '')
  )
  if (bestScore < 40) return undefined

  return pickLeagueBadge(best)
}

async function resolveWithDedupe(
  cacheKind: 'team' | 'league',
  cacheKey: string,
  resolver: () => Promise<string | undefined>
) {
  const existing = inFlight.get(cacheKey)
  if (existing) return existing

  const task = (async () => {
    const cached = await getCachedLogo(cacheKind, cacheKey)
    if (cached !== undefined) {
      return cached ?? undefined
    }

    const resolved = await resolver()
    await setCachedLogo(cacheKind, cacheKey, resolved ?? null)
    return resolved
  })().finally(() => {
    inFlight.delete(cacheKey)
  })

  inFlight.set(cacheKey, task)
  return task
}

/** Resolve a team badge from TheSportsDB. Azuro CDN urls are tried in `TeamLogo` first. */
export async function resolveTeamLogo(teamName?: string | null): Promise<string | undefined> {
  const name = normalizeTeamSearchName(teamName ?? '')
  if (!name) return undefined

  return resolveWithDedupe('team', name, () => searchTeamOnSportsDb(name))
}

export async function resolveLeagueLogo(
  leagueName?: string | null,
  countryName?: string | null,
  countrySlug?: string | null
): Promise<string | undefined> {
  const league = normalizeLeagueSearchName(leagueName ?? '')
  if (!league) return undefined

  const cacheKey = `${countrySlug ?? countryName ?? 'world'}:${league}`
  return resolveWithDedupe('league', cacheKey, () =>
    searchLeagueOnSportsDb(league, countryName, countrySlug)
  )
}

export function isLikelyValidLogoUri(uri?: string | null) {
  if (!uri) return false
  return /^https?:\/\//i.test(uri)
}
