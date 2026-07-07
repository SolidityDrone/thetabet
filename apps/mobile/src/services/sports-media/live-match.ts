import { isApiFootballConfigured } from '@/config/api-football'
import { THE_SPORTS_DB_BASE } from '@/config/sports-media'
import {
  formatApiFootballMinute,
  resolveApiFootballLiveSnapshot,
} from '@/services/sports-media/api-football-live'
import { fetchSportsDbJson } from '@/services/sports-media/api-client'
import {
  normalizeTeamSearchName,
  scoreNameMatch,
} from '@/services/sports-media/name-utils'
import type { GameData } from '@azuro-org/toolkit'

export type LiveMatchCards = {
  homeYellow: number
  awayYellow: number
  homeRed: number
  awayRed: number
}

export type LiveMatchStats = {
  eventId: string
  homeScore: number | null
  awayScore: number | null
  minuteLabel: string | null
  statusLabel: string | null
  cards: LiveMatchCards | null
  corners: { home: number; away: number } | null
  updatedAt: number
  /** Whether the minute shown is the real match clock (API-Football). */
  hasExactClock: boolean
}

type SportsDbEvent = {
  idEvent?: string
  idAPIfootball?: string | null
  strHomeTeam?: string
  strAwayTeam?: string
  strEvent?: string
  dateEvent?: string
  strTime?: string
  strTimestamp?: string
  intHomeScore?: string | null
  intAwayScore?: string | null
  strStatus?: string | null
  strProgress?: string | null
}

type SportsDbTimeline = {
  strTimeline?: string
  strTimelineDetail?: string
  strHome?: string
  intTime?: string | null
}

type SportsDbStatistic = {
  strStat?: string
  intHome?: string | null
  intAway?: string | null
}

const EVENT_ID_TTL_MS = 6 * 60 * 60 * 1000
const STATS_TTL_MS = 20 * 1000

const eventIdCache = new Map<
  string,
  { sportsDbId: string; apiFootballId: string | null; expiresAt: number }
>()
const statsCache = new Map<string, { stats: LiveMatchStats; expiresAt: number }>()
const inFlight = new Map<string, Promise<LiveMatchStats | null>>()

function parseScore(value?: string | null): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCount(value?: string | null): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatGameDateKey(startsAt: string) {
  const date = new Date(Number(startsAt) * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildSearchSlug(homeName: string, awayName: string) {
  return `${normalizeTeamSearchName(homeName)}_vs_${normalizeTeamSearchName(awayName)}`
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
}

function scoreEventMatch(game: GameData, event: SportsDbEvent): number {
  const [home, away] = game.participants ?? []
  const homeName = home?.name ?? ''
  const awayName = away?.name ?? ''
  if (!homeName || !awayName || !event.strHomeTeam || !event.strAwayTeam) return 0

  const homeScore = scoreNameMatch(homeName, event.strHomeTeam)
  const awayScore = scoreNameMatch(awayName, event.strAwayTeam)
  if (homeScore < 35 || awayScore < 35) return 0

  let total = homeScore + awayScore
  const targetDate = formatGameDateKey(game.startsAt)
  if (targetDate && event.dateEvent === targetDate) {
    total += 25
  }
  return total
}

function pickBestEvent(game: GameData, events: SportsDbEvent[]): SportsDbEvent | null {
  const ranked = [...events]
    .map((event) => ({ event, score: scoreEventMatch(game, event) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.event ?? null
}

async function searchEventsByTeams(homeName: string, awayName: string) {
  const slug = encodeURIComponent(buildSearchSlug(homeName, awayName))
  const data = await fetchSportsDbJson<{ event: SportsDbEvent[] | null }>(
    `${THE_SPORTS_DB_BASE}/searchevents.php?e=${slug}`
  )
  return data?.event ?? []
}

async function searchEventsByDay(game: GameData) {
  const date = formatGameDateKey(game.startsAt)
  if (!date) return []

  const data = await fetchSportsDbJson<{ events: SportsDbEvent[] | null }>(
    `${THE_SPORTS_DB_BASE}/eventsday.php?d=${date}&s=Soccer`
  )
  return data?.events ?? []
}

async function resolveSportsDbEventLink(game: GameData): Promise<{
  sportsDbId: string
  apiFootballId: string | null
} | null> {
  const cacheKey = game.id
  const cached = eventIdCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return {
      sportsDbId: cached.sportsDbId,
      apiFootballId: cached.apiFootballId,
    }
  }

  const [home, away] = game.participants ?? []
  const homeName = home?.name ?? ''
  const awayName = away?.name ?? ''
  if (!homeName || !awayName) return null

  const searchHits = await searchEventsByTeams(homeName, awayName)
  let best = pickBestEvent(game, searchHits)

  if (!best) {
    const dayHits = await searchEventsByDay(game)
    best = pickBestEvent(game, dayHits)
  }

  if (!best?.idEvent) return null

  const link = {
    sportsDbId: best.idEvent,
    apiFootballId: best.idAPIfootball?.trim() || null,
  }

  eventIdCache.set(cacheKey, {
    ...link,
    expiresAt: Date.now() + EVENT_ID_TTL_MS,
  })
  return link
}

function formatStatusLabel(status?: string | null): string | null {
  const normalized = status?.trim()
  if (!normalized) return null

  const map: Record<string, string> = {
    NS: 'Not started',
    '1H': '1st half',
    HT: 'Half time',
    '2H': '2nd half',
    ET: 'Extra time',
    P: 'Penalties',
    FT: 'Full time',
    AET: 'After extra time',
    PEN: 'After penalties',
    BT: 'Break',
    CANC: 'Cancelled',
    POST: 'Postponed',
  }

  return map[normalized] ?? normalized
}

function parseProgressMinute(progress?: string | null): string | null {
  if (!progress?.trim()) return null
  if (/^final$/i.test(progress.trim())) return 'FT'

  const clockMatch = progress.match(/^(\d{1,3})(?::\d{2})?/)
  if (clockMatch?.[1]) {
    return `${clockMatch[1]}'`
  }

  return progress.trim()
}

function deriveMinuteLabel(event: SportsDbEvent): string | null {
  const fromProgress = parseProgressMinute(event.strProgress)
  if (fromProgress) return fromProgress

  const status = event.strStatus?.trim() ?? ''
  if (status === 'HT') return 'HT'
  if (status === 'FT' || status === 'AET' || status === 'PEN') return 'FT'
  if (status === '2H') return '2nd half'
  if (status === '1H') return '1st half'
  if (status === 'ET') return 'Extra time'
  if (status === 'P') return 'Penalties'

  return null
}

function countCardsFromTimeline(
  timeline: SportsDbTimeline[],
  homeTeam?: string,
  awayTeam?: string
): LiveMatchCards {
  const cards: LiveMatchCards = {
    homeYellow: 0,
    awayYellow: 0,
    homeRed: 0,
    awayRed: 0,
  }

  for (const entry of timeline) {
    if (entry.strTimeline?.toLowerCase() !== 'card') continue

    const detail = entry.strTimelineDetail?.toLowerCase() ?? ''
    const isRed = detail.includes('red')
    const isYellow = detail.includes('yellow')
    if (!isRed && !isYellow) continue

    const isHome =
      entry.strHome === 'Yes' ||
      (homeTeam && entry.strHome !== 'No' && scoreNameMatch(homeTeam, entry.strHome ?? '') >= 80)

    if (isHome) {
      if (isRed) cards.homeRed += 1
      else cards.homeYellow += 1
    } else {
      if (isRed) cards.awayRed += 1
      else cards.awayYellow += 1
    }
  }

  return cards
}

function pickCornersFromStats(stats: SportsDbStatistic[]) {
  const cornerStat = stats.find((stat) => /corner/i.test(stat.strStat ?? ''))
  if (!cornerStat) return null

  return {
    home: parseCount(cornerStat.intHome),
    away: parseCount(cornerStat.intAway),
  }
}

function pickCardsFromStats(stats: SportsDbStatistic[]): LiveMatchCards | null {
  const yellow = stats.find((stat) => /yellow\s*card/i.test(stat.strStat ?? ''))
  const red = stats.find((stat) => /red\s*card/i.test(stat.strStat ?? ''))
  if (!yellow && !red) return null

  return {
    homeYellow: parseCount(yellow?.intHome),
    awayYellow: parseCount(yellow?.intAway),
    homeRed: parseCount(red?.intHome),
    awayRed: parseCount(red?.intAway),
  }
}

async function fetchEventSnapshot(eventId: string): Promise<SportsDbEvent | null> {
  const data = await fetchSportsDbJson<{ events: SportsDbEvent[] | null }>(
    `${THE_SPORTS_DB_BASE}/lookupevent.php?id=${eventId}`
  )
  return data?.events?.[0] ?? null
}

async function fetchTimeline(eventId: string) {
  const data = await fetchSportsDbJson<{ timeline: SportsDbTimeline[] | null }>(
    `${THE_SPORTS_DB_BASE}/lookuptimeline.php?id=${eventId}`
  )
  return data?.timeline ?? []
}

async function fetchEventStats(eventId: string) {
  const data = await fetchSportsDbJson<{ eventstats: SportsDbStatistic[] | null }>(
    `${THE_SPORTS_DB_BASE}/lookupeventstats.php?id=${eventId}`
  )
  return data?.eventstats ?? []
}

function buildStatsFromEvent(
  eventId: string,
  event: SportsDbEvent,
  timeline: SportsDbTimeline[],
  eventStats: SportsDbStatistic[],
  apiFootball?: Awaited<ReturnType<typeof resolveApiFootballLiveSnapshot>> | null
): LiveMatchStats {
  const timelineCards = countCardsFromTimeline(
    timeline,
    event.strHomeTeam,
    event.strAwayTeam
  )
  const statsCards = pickCardsFromStats(eventStats)
  const hasTimelineCards =
    timelineCards.homeYellow +
      timelineCards.awayYellow +
      timelineCards.homeRed +
      timelineCards.awayRed >
    0

  const apiMinute = apiFootball ? formatApiFootballMinute(apiFootball) : null
  const sportsDbMinute = deriveMinuteLabel(event)
  const minuteLabel = apiMinute ?? sportsDbMinute
  const hasExactClock = Boolean(apiMinute)

  return {
    eventId,
    homeScore: apiFootball?.homeScore ?? parseScore(event.intHomeScore),
    awayScore: apiFootball?.awayScore ?? parseScore(event.intAwayScore),
    minuteLabel,
    statusLabel: apiFootball?.statusLong ?? formatStatusLabel(event.strStatus),
    cards: hasTimelineCards ? timelineCards : statsCards,
    corners: pickCornersFromStats(eventStats),
    updatedAt: Date.now(),
    hasExactClock,
  }
}

async function fetchLiveMatchStatsByEventId(
  eventLink: { sportsDbId: string; apiFootballId: string | null },
  game: GameData,
  options?: { force?: boolean }
): Promise<LiveMatchStats | null> {
  const [event, timeline, eventStats, apiFootball] = await Promise.all([
    fetchEventSnapshot(eventLink.sportsDbId),
    fetchTimeline(eventLink.sportsDbId),
    fetchEventStats(eventLink.sportsDbId),
    isApiFootballConfigured()
      ? resolveApiFootballLiveSnapshot({
          apiFootballId: eventLink.apiFootballId,
          homeName: game.participants[0]?.name,
          awayName: game.participants[1]?.name,
          force: options?.force,
        })
      : Promise.resolve(null),
  ])

  if (!event) return null

  return buildStatsFromEvent(
    eventLink.sportsDbId,
    event,
    timeline,
    eventStats,
    apiFootball
  )
}

export async function fetchLiveMatchStats(
  game: GameData,
  options?: { force?: boolean }
): Promise<LiveMatchStats | null> {
  const cacheKey = game.id
  if (!options?.force) {
    const cached = statsCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.stats
    }
  }

  const existing = inFlight.get(cacheKey)
  if (existing) return existing

  const task = (async () => {
    const eventLink = await resolveSportsDbEventLink(game)
    if (!eventLink) return null

    const stats = await fetchLiveMatchStatsByEventId(eventLink, game, options)
    if (!stats) return null

    statsCache.set(cacheKey, {
      stats,
      expiresAt: Date.now() + STATS_TTL_MS,
    })
    return stats
  })().finally(() => {
    inFlight.delete(cacheKey)
  })

  inFlight.set(cacheKey, task)
  return task
}

export function formatLiveMatchScore(stats: LiveMatchStats | null | undefined) {
  if (!stats || stats.homeScore === null || stats.awayScore === null) return null
  return `${stats.homeScore} - ${stats.awayScore}`
}

export function formatLiveMinuteLabel(
  stats: LiveMatchStats | null | undefined,
  fallback = 'LIVE'
) {
  if (!stats) return fallback
  return stats.minuteLabel ?? stats.statusLabel ?? fallback
}
