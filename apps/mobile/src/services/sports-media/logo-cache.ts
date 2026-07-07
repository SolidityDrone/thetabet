import AsyncStorage from '@react-native-async-storage/async-storage'

const CACHE_PREFIX = 'thetabet:sports-logo:v1:'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

type CacheEntry = {
  uri: string | null
  expiresAt: number
}

const memory = new Map<string, string | null>()

function cacheKey(kind: 'team' | 'league', key: string) {
  return `${CACHE_PREFIX}${kind}:${key}`
}

/** `undefined` = not cached, `null` = cached miss, `string` = hit */
export async function getCachedLogo(
  kind: 'team' | 'league',
  key: string
): Promise<string | null | undefined> {
  const normalizedKey = key.toLowerCase()
  if (memory.has(normalizedKey)) {
    return memory.get(normalizedKey) ?? null
  }

  const raw = await AsyncStorage.getItem(cacheKey(kind, normalizedKey))
  if (!raw) return undefined

  try {
    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() > entry.expiresAt) {
      await AsyncStorage.removeItem(cacheKey(kind, normalizedKey))
      return undefined
    }
    memory.set(normalizedKey, entry.uri)
    return entry.uri
  } catch {
    return undefined
  }
}

export async function setCachedLogo(
  kind: 'team' | 'league',
  key: string,
  uri?: string | null
) {
  const normalizedKey = key.toLowerCase()
  memory.set(normalizedKey, uri ?? null)

  const entry: CacheEntry = {
    uri: uri ?? null,
    expiresAt: Date.now() + TTL_MS,
  }
  await AsyncStorage.setItem(cacheKey(kind, normalizedKey), JSON.stringify(entry))
}
