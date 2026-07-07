/** API-Football (api-sports.io) — free tier: 100 req/day. Sign up at https://www.api-football.com */
export const API_FOOTBALL_KEY = process.env.EXPO_PUBLIC_API_FOOTBALL_KEY?.trim() || ''

export const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io'

export function isApiFootballConfigured() {
  return API_FOOTBALL_KEY.length > 0
}
