import type { AzuroLeagueRef } from '@/types/azuro'
import type { GameData } from '@azuro-org/toolkit'

export type MatchCatalogTeam = {
  key: string
  name: string
}

export type MatchCatalogGame = {
  id: string
  title: string
  leagueSlug: string
  leagueName: string
  countryName: string
  startsAt: string
  state: string
  homeName: string
  awayName: string
  teamKeys: string[]
}

export function normalizeTeamKey(name: string) {
  return name.trim().toLowerCase()
}

export function formatGameTitle(game: GameData): string {
  const [home, away] = game.participants ?? []
  if (home?.name && away?.name) return `${home.name} vs ${away.name}`
  return game.title ?? 'Match'
}

export function formatGameKickoff(startsAt: string): string {
  const ts = Number(startsAt)
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const date = new Date(ts * 1000)
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function gameToCatalogEntry(game: GameData): MatchCatalogGame {
  const [home, away] = game.participants ?? []
  const homeName = home?.name ?? 'Home'
  const awayName = away?.name ?? 'Away'
  const homeKey = normalizeTeamKey(homeName)
  const awayKey = normalizeTeamKey(awayName)

  return {
    id: game.id,
    title: formatGameTitle(game),
    leagueSlug: game.league?.slug ?? 'other',
    leagueName: game.league?.name ?? 'Other',
    countryName: game.country?.name ?? '',
    startsAt: String(game.startsAt),
    state: String(game.state),
    homeName,
    awayName,
    teamKeys: [homeKey, awayKey],
  }
}

export function dedupeGames(games: GameData[]): GameData[] {
  const seen = new Set<string>()
  const out: GameData[] = []
  for (const game of games) {
    if (seen.has(game.id)) continue
    seen.add(game.id)
    out.push(game)
  }
  return out
}

export function buildMatchCatalog(leagues: AzuroLeagueRef[], games: GameData[]) {
  const catalogGames = dedupeGames(games).map(gameToCatalogEntry)
  const teamsByLeague: Record<string, Map<string, MatchCatalogTeam>> = {}

  for (const game of catalogGames) {
    if (!teamsByLeague[game.leagueSlug]) {
      teamsByLeague[game.leagueSlug] = new Map()
    }
    const bucket = teamsByLeague[game.leagueSlug]
    bucket.set(game.teamKeys[0], { key: game.teamKeys[0], name: game.homeName })
    bucket.set(game.teamKeys[1], { key: game.teamKeys[1], name: game.awayName })
  }

  const teamsByLeagueSorted: Record<string, MatchCatalogTeam[]> = {}
  for (const [slug, map] of Object.entries(teamsByLeague)) {
    teamsByLeagueSorted[slug] = Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }

  const leagueBySlug = new Map(leagues.map((league) => [league.slug, league]))
  for (const game of catalogGames) {
    if (leagueBySlug.has(game.leagueSlug)) continue
    leagueBySlug.set(game.leagueSlug, {
      slug: game.leagueSlug,
      name: game.leagueName,
      countrySlug: '',
      countryName: game.countryName,
      isTopLeague: false,
    })
  }

  const mergedLeagues = Array.from(leagueBySlug.values()).sort((left, right) => {
    if (left.isTopLeague !== right.isTopLeague) return left.isTopLeague ? -1 : 1
    return left.name.localeCompare(right.name)
  })

  return {
    leagues: mergedLeagues,
    games: catalogGames.sort((left, right) => Number(left.startsAt) - Number(right.startsAt)),
    teamsByLeague: teamsByLeagueSorted,
  }
}

export function filterCatalogGames(
  games: MatchCatalogGame[],
  leagueSlug: string | null,
  teamKey: string | null
) {
  return games.filter((game) => {
    if (leagueSlug && game.leagueSlug !== leagueSlug) return false
    if (teamKey && !game.teamKeys.includes(teamKey)) return false
    return true
  })
}

export function findLeagueLabel(leagues: AzuroLeagueRef[], slug: string | null) {
  if (!slug) return 'Select competition'
  const league = leagues.find((item) => item.slug === slug)
  if (!league) return 'Competition'
  return `${league.name} · ${league.countryName}`
}
