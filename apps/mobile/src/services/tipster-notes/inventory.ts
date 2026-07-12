import type { TipsterNotesStore } from '@/services/tipster-notes/types'
import { getMatchHints } from '@/services/tipster-notes/storage'

export type NoteInventoryStatus = 'ready' | 'draft' | 'empty'

export type NoteInventoryItem = {
  id: string
  kind: 'thesis' | 'league' | 'team' | 'match'
  label: string
  status: NoteInventoryStatus
  hintCount: number
  updatedAt?: number
}

function entryStatus(raw: string, summary: unknown[] | null): NoteInventoryStatus {
  if (!raw.trim()) return 'empty'
  if (summary?.length) return 'ready'
  return 'draft'
}

export function buildNotesInventory(store: TipsterNotesStore): NoteInventoryItem[] {
  const items: NoteInventoryItem[] = [
    {
      id: 'thesis',
      kind: 'thesis',
      label: 'Global thesis',
      status: entryStatus(store.thesis.raw, store.thesis.summary),
      hintCount: store.thesis.summary?.length ?? 0,
      updatedAt: store.thesis.updatedAt || undefined,
    },
  ]

  for (const [key, entry] of Object.entries(store.leagues)) {
    items.push({
      id: `league:${key}`,
      kind: 'league',
      label: entry.league ?? key,
      status: entryStatus(entry.raw, entry.summary),
      hintCount: entry.summary?.length ?? 0,
      updatedAt: entry.updatedAt || undefined,
    })
  }

  for (const [key, entry] of Object.entries(store.teams)) {
    items.push({
      id: `team:${key}`,
      kind: 'team',
      label: key.charAt(0).toUpperCase() + key.slice(1),
      status: entryStatus(entry.raw, entry.summary),
      hintCount: entry.summary?.length ?? 0,
      updatedAt: entry.updatedAt || undefined,
    })
  }

  for (const [key, entry] of Object.entries(store.matches)) {
    const hints = getMatchHints(entry)
    const lockedCount = hints.reduce((sum, hint) => sum + (hint.summary?.length ?? 0), 0)
    const hasDraft = hints.some((hint) => hint.raw.trim() && !hint.summary?.length)
    const hasRaw = hints.some((hint) => hint.raw.trim())
    const status: NoteInventoryStatus = !hasRaw ? 'empty' : lockedCount > 0 ? 'ready' : hasDraft ? 'draft' : 'empty'

    items.push({
      id: `match:${key}`,
      kind: 'match',
      label: entry.matchTitle ?? `Match ${key.slice(0, 8)}`,
      status,
      hintCount: lockedCount,
      updatedAt: entry.updatedAt || undefined,
    })
  }

  return items.sort((a, b) => {
    const rank = (s: NoteInventoryStatus) => (s === 'ready' ? 0 : s === 'draft' ? 1 : 2)
    return rank(a.status) - rank(b.status) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })
}

export function countReadyInventory(items: NoteInventoryItem[]) {
  return items.filter((item) => item.status === 'ready').length
}
