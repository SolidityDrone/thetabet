import { AZURO_COUNTRY_TO_SPORTSDB } from '@/config/sports-media'

/** Strip esports suffixes and noise from Azuro participant names. */
export function normalizeTeamSearchName(name: string): string {
  return name
    .replace(/\s*\(esports\)\s*/gi, ' ')
    .replace(/\s*\(.*?pikalicaaa.*?\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeLeagueSearchName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function scoreNameMatch(query: string, candidate: string): number {
  const left = normalizeForMatch(query)
  const right = normalizeForMatch(candidate)
  if (!left || !right) return 0
  if (left === right) return 100
  if (right.includes(left) || left.includes(right)) return 80

  const leftTokens = left.split(' ').filter(Boolean)
  const rightTokens = new Set(right.split(' ').filter(Boolean))
  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length
  return (overlap / Math.max(leftTokens.length, 1)) * 60
}

export function pickSportsDbCountry(
  countrySlug?: string | null,
  countryName?: string | null,
  leagueName?: string | null
): string | undefined {
  const league = leagueName?.toLowerCase() ?? ''
  if (
    league.includes('champions league') ||
    league.includes('europa league') ||
    league.includes('conference league') ||
    league.includes('uefa')
  ) {
    return 'Europe'
  }

  if (countrySlug) {
    const mapped = AZURO_COUNTRY_TO_SPORTSDB[countrySlug.toLowerCase()]
    if (mapped) return mapped
  }

  if (countryName?.trim()) {
    return countryName.trim()
  }

  return undefined
}
