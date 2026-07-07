import { API_FOOTBALL_BASE, API_FOOTBALL_KEY, isApiFootballConfigured } from '@/config/api-football'
import { scoreNameMatch } from '@/services/sports-media/name-utils'

export type ApiFootballLiveSnapshot = {
  fixtureId: number
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  elapsed: number | null
  extra: number | null
  statusShort: string | null
  statusLong: string | null
}

type ApiFootballFixtureRow = {
  fixture?: {
    id?: number
    status?: {
      elapsed?: number | null
      extra?: number | null
      short?: string | null
      long?: string | null
    }
  }
  goals?: {
    home?: number | null
    away?: number | null
  }
  teams?: {
    home?: { name?: string | null }
    away?: { name?: string | null }
  }
}

type LiveFixturesResponse = {
  response?: ApiFootballFixtureRow[]
  errors?: Record<string, string>
}

const LIVE_CACHE_TTL_MS = 45_000

let cachedLive: ApiFootballLiveSnapshot[] | null = null
let cachedLiveExpiresAt = 0
let inFlightLive: Promise<ApiFootballLiveSnapshot[]> | null = null

function mapFixtureRow(row: ApiFootballFixtureRow): ApiFootballLiveSnapshot | null {
  const fixtureId = row.fixture?.id
  const homeTeam = row.teams?.home?.name?.trim()
  const awayTeam = row.teams?.away?.name?.trim()
  if (!fixtureId || !homeTeam || !awayTeam) return null

  return {
    fixtureId,
    homeTeam,
    awayTeam,
    homeScore: row.goals?.home ?? null,
    awayScore: row.goals?.away ?? null,
    elapsed: row.fixture?.status?.elapsed ?? null,
    extra: row.fixture?.status?.extra ?? null,
    statusShort: row.fixture?.status?.short ?? null,
    statusLong: row.fixture?.status?.long ?? null,
  }
}

async function fetchLiveFixturesUncached(): Promise<ApiFootballLiveSnapshot[]> {
  if (!isApiFootballConfigured()) return []

  const response = await fetch(`${API_FOOTBALL_BASE}/fixtures?live=all`, {
    headers: {
      Accept: 'application/json',
      'x-apisports-key': API_FOOTBALL_KEY,
    },
  })

  if (!response.ok) {
    throw new Error(`API-Football live feed HTTP ${response.status}`)
  }

  const json = (await response.json()) as LiveFixturesResponse
  if (json.errors && Object.keys(json.errors).length > 0) {
    const message = Object.values(json.errors).join(' · ')
    throw new Error(message || 'API-Football error')
  }

  return (json.response ?? [])
    .map(mapFixtureRow)
    .filter((row): row is ApiFootballLiveSnapshot => row !== null)
}

export async function fetchApiFootballLiveFixtures(force = false): Promise<ApiFootballLiveSnapshot[]> {
  if (!isApiFootballConfigured()) return []

  if (!force && cachedLive && cachedLiveExpiresAt > Date.now()) {
    return cachedLive
  }

  if (!force && inFlightLive) {
    return inFlightLive
  }

  const task = fetchLiveFixturesUncached()
    .then((fixtures) => {
      cachedLive = fixtures
      cachedLiveExpiresAt = Date.now() + LIVE_CACHE_TTL_MS
      return fixtures
    })
    .finally(() => {
      inFlightLive = null
    })

  inFlightLive = task
  return task
}

export function formatApiFootballMinute(snapshot: ApiFootballLiveSnapshot): string | null {
  const status = snapshot.statusShort?.trim() ?? ''
  if (status === 'HT') return 'HT'
  if (status === 'FT' || status === 'AET' || status === 'PEN') return 'FT'
  if (status === 'NS' || status === 'TBD') return null

  if (snapshot.elapsed !== null && snapshot.elapsed >= 0) {
    if (snapshot.extra && snapshot.extra > 0) {
      return `${snapshot.elapsed}+${snapshot.extra}'`
    }
    return `${snapshot.elapsed}'`
  }

  if (snapshot.statusLong) return snapshot.statusLong
  if (status === '1H') return '1st half'
  if (status === '2H') return '2nd half'
  if (status === 'ET') return 'Extra time'
  if (status === 'P') return 'Penalties'

  return null
}

function scoreTeamPair(
  homeName: string,
  awayName: string,
  fixture: ApiFootballLiveSnapshot
) {
  const homeScore = scoreNameMatch(homeName, fixture.homeTeam)
  const awayScore = scoreNameMatch(awayName, fixture.awayTeam)
  if (homeScore < 35 || awayScore < 35) return 0
  return homeScore + awayScore
}

export async function resolveApiFootballLiveSnapshot(params: {
  apiFootballId?: string | null
  homeName?: string | null
  awayName?: string | null
  force?: boolean
}): Promise<ApiFootballLiveSnapshot | null> {
  const fixtures = await fetchApiFootballLiveFixtures(params.force)
  if (fixtures.length === 0) return null

  if (params.apiFootballId) {
    const fixtureId = Number(params.apiFootballId)
    if (Number.isFinite(fixtureId)) {
      const byId = fixtures.find((fixture) => fixture.fixtureId === fixtureId)
      if (byId) return byId
    }
  }

  const homeName = params.homeName?.trim() ?? ''
  const awayName = params.awayName?.trim() ?? ''
  if (!homeName || !awayName) return null

  const ranked = fixtures
    .map((fixture) => ({
      fixture,
      score: scoreTeamPair(homeName, awayName, fixture),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.fixture ?? null
}
