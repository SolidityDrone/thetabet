import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MatchDossier } from '@/services/qvac/match-scout'
import type { MatchPickSuggestion } from '@/services/qvac/match-outcomes'

const KEY_PREFIX = 'thetabet.match-scout.v1:'

export type CachedMatchScout = {
  gameId: string
  matchTitle: string
  updatedAt: number
  dossier: MatchDossier
  answer: string
  suggestions: MatchPickSuggestion[]
}

export async function loadMatchScoutCache(
  gameId: string
): Promise<CachedMatchScout | null> {
  if (!gameId) return null
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${gameId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedMatchScout
    if (!parsed?.dossier || typeof parsed.answer !== 'string') return null
    return {
      ...parsed,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    }
  } catch {
    return null
  }
}

export async function saveMatchScoutCache(entry: CachedMatchScout): Promise<void> {
  if (!entry.gameId) return
  await AsyncStorage.setItem(`${KEY_PREFIX}${entry.gameId}`, JSON.stringify(entry))
}

export async function clearMatchScoutCache(gameId: string): Promise<void> {
  if (!gameId) return
  await AsyncStorage.removeItem(`${KEY_PREFIX}${gameId}`)
}
