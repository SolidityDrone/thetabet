const DEFAULT_TTL_MS = 45_000

type CacheRow = {
  at: number
  ttl: number
  data: unknown
}

const store = new Map<string, CacheRow>()

export function getAzuroCache<T>(key: string): T | null {
  const row = store.get(key)
  if (!row) return null
  if (Date.now() - row.at > row.ttl) {
    store.delete(key)
    return null
  }
  return row.data as T
}

export function setAzuroCache(key: string, data: unknown, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { at: Date.now(), ttl: ttlMs, data })
}

export function azuroCacheKey(parts: Array<string | number | undefined>) {
  return parts.filter((part) => part !== undefined && part !== '').join(':')
}
