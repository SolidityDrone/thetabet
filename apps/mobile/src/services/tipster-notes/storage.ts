import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  emptyNoteEntry,
  emptyTipsterNotesStore,
  type MatchHintContext,
  type TipsterHintInputMode,
  type TipsterHintLine,
  type TipsterMatchHint,
  type TipsterNoteEntry,
  type TipsterNotesStore,
} from '@/services/tipster-notes/types'

const STORAGE_PREFIX = 'thetabet.tipsterNotes.v1.'

function storageKey(ownerId: string) {
  return `${STORAGE_PREFIX}${ownerId.toLowerCase()}`
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase()
}

function normalizeTeamNames(matchTitle: string | null | undefined): string[] {
  if (!matchTitle) return []
  const parts = matchTitle.split(/\s+[-–vs.]+\s+/i)
  return parts.map((p) => p.trim()).filter((p) => p.length > 1)
}

function createHintId() {
  return `hint_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function migrateMatchEntry(entry: TipsterNoteEntry): TipsterNoteEntry {
  if (entry.hints?.length) return entry
  if (!entry.raw.trim()) {
    return { ...entry, hints: entry.hints ?? [] }
  }
  return {
    ...entry,
    hints: [
      {
        id: createHintId(),
        raw: entry.raw,
        summary: entry.summary,
        summarizedAt: entry.summarizedAt,
        createdAt: entry.updatedAt || Date.now(),
        inputMode: 'paste',
      },
    ],
  }
}

function migrateStore(store: TipsterNotesStore): TipsterNotesStore {
  const matches: TipsterNotesStore['matches'] = {}
  for (const [key, entry] of Object.entries(store.matches)) {
    matches[key] = migrateMatchEntry(entry)
  }
  return { ...store, matches }
}

export async function loadTipsterNotes(ownerId: string): Promise<TipsterNotesStore> {
  if (!ownerId) return emptyTipsterNotesStore()
  try {
    const raw = await AsyncStorage.getItem(storageKey(ownerId))
    if (!raw) return emptyTipsterNotesStore()
    const parsed = JSON.parse(raw) as Partial<TipsterNotesStore>
    const store = {
      version: 1,
      thesis: parsed.thesis ?? emptyNoteEntry(),
      leagues: parsed.leagues ?? {},
      teams: parsed.teams ?? {},
      matches: parsed.matches ?? {},
    }
    return migrateStore(store)
  } catch {
    return emptyTipsterNotesStore()
  }
}

export async function saveTipsterNotes(ownerId: string, store: TipsterNotesStore): Promise<void> {
  if (!ownerId) return
  await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(store))
}

export async function updateThesisNote(
  ownerId: string,
  raw: string
): Promise<TipsterNotesStore> {
  const store = await loadTipsterNotes(ownerId)
  store.thesis = {
    ...store.thesis,
    raw,
    summary: raw.trim() ? store.thesis.summary : null,
    summarizedAt: raw.trim() ? store.thesis.summarizedAt : null,
    updatedAt: Date.now(),
  }
  await saveTipsterNotes(ownerId, store)
  return store
}

export async function updateLeagueNote(
  ownerId: string,
  league: string,
  raw: string
): Promise<TipsterNotesStore> {
  const key = normalizeKey(league)
  if (!key) throw new Error('League name required')
  const store = await loadTipsterNotes(ownerId)
  const prev = store.leagues[key] ?? emptyNoteEntry()
  store.leagues[key] = {
    ...prev,
    raw,
    summary: raw.trim() ? prev.summary : null,
    summarizedAt: raw.trim() ? prev.summarizedAt : null,
    updatedAt: Date.now(),
    league,
  }
  await saveTipsterNotes(ownerId, store)
  return store
}

export async function updateTeamNote(
  ownerId: string,
  team: string,
  raw: string
): Promise<TipsterNotesStore> {
  const key = normalizeKey(team)
  if (!key) throw new Error('Team name required')
  const store = await loadTipsterNotes(ownerId)
  const prev = store.teams[key] ?? emptyNoteEntry()
  store.teams[key] = {
    ...prev,
    raw,
    summary: raw.trim() ? prev.summary : null,
    summarizedAt: raw.trim() ? prev.summarizedAt : null,
    updatedAt: Date.now(),
  }
  await saveTipsterNotes(ownerId, store)
  return store
}

export async function updateMatchNote(
  ownerId: string,
  gameId: string,
  raw: string,
  meta?: { matchTitle?: string; league?: string }
): Promise<TipsterNotesStore> {
  const key = gameId.trim()
  if (!key) throw new Error('Match id required')
  const store = await loadTipsterNotes(ownerId)
  const prev = store.matches[key] ?? emptyNoteEntry()
  store.matches[key] = {
    ...prev,
    raw,
    summary: raw.trim() ? prev.summary : null,
    summarizedAt: raw.trim() ? prev.summarizedAt : null,
    updatedAt: Date.now(),
    matchTitle: meta?.matchTitle ?? prev.matchTitle,
    league: meta?.league ?? prev.league,
  }
  await saveTipsterNotes(ownerId, store)
  return store
}

export function getMatchHints(entry: TipsterNoteEntry | null | undefined): TipsterMatchHint[] {
  if (!entry) return []
  if (entry.hints?.length) return entry.hints
  if (!entry.raw.trim()) return []
  return [
    {
      id: 'legacy',
      raw: entry.raw,
      summary: entry.summary,
      summarizedAt: entry.summarizedAt,
      createdAt: entry.updatedAt || 0,
      inputMode: 'paste',
    },
  ]
}

function syncMatchAggregate(entry: TipsterNoteEntry): TipsterNoteEntry {
  const hints = getMatchHints(entry)
  const allSummary = hints.flatMap((hint) => hint.summary ?? [])
  const raw = hints.map((hint) => hint.raw.trim()).filter(Boolean).join('\n\n')
  const latestSummarized = hints
    .map((hint) => hint.summarizedAt ?? 0)
    .reduce((max, value) => Math.max(max, value), 0)

  return {
    ...entry,
    hints,
    raw,
    summary: allSummary.length ? allSummary : null,
    summarizedAt: latestSummarized || null,
    updatedAt: Date.now(),
  }
}

export async function addMatchHint(
  ownerId: string,
  gameId: string,
  payload: { raw: string; sources?: string; inputMode: TipsterHintInputMode },
  meta?: { matchTitle?: string; league?: string }
): Promise<{ store: TipsterNotesStore; hint: TipsterMatchHint }> {
  const key = gameId.trim()
  if (!key) throw new Error('Match id required')
  const trimmed = payload.raw.trim()
  if (!trimmed) throw new Error('Hint text is required')

  const store = await loadTipsterNotes(ownerId)
  const prev = store.matches[key] ?? emptyNoteEntry()
  const hint: TipsterMatchHint = {
    id: createHintId(),
    raw: trimmed,
    sources: payload.sources?.trim() || undefined,
    summary: null,
    summarizedAt: null,
    createdAt: Date.now(),
    inputMode: payload.inputMode,
  }

  const nextEntry = syncMatchAggregate({
    ...prev,
    hints: [...getMatchHints(prev), hint],
    matchTitle: meta?.matchTitle ?? prev.matchTitle,
    league: meta?.league ?? prev.league,
  })
  store.matches[key] = nextEntry
  await saveTipsterNotes(ownerId, store)
  return { store, hint }
}

export async function removeMatchHint(
  ownerId: string,
  gameId: string,
  hintId: string
): Promise<TipsterNotesStore> {
  const store = await loadTipsterNotes(ownerId)
  const entry = store.matches[gameId]
  if (!entry) return store

  store.matches[gameId] = syncMatchAggregate({
    ...entry,
    hints: getMatchHints(entry).filter((hint) => hint.id !== hintId),
  })
  await saveTipsterNotes(ownerId, store)
  return store
}

export async function setMatchHintSummary(
  ownerId: string,
  gameId: string,
  hintId: string,
  summary: TipsterHintLine[]
): Promise<TipsterNotesStore> {
  const store = await loadTipsterNotes(ownerId)
  const entry = store.matches[gameId]
  if (!entry) return store

  const now = Date.now()
  const hints = getMatchHints(entry).map((hint) =>
    hint.id === hintId ? { ...hint, summary, summarizedAt: now } : hint
  )
  store.matches[gameId] = syncMatchAggregate({ ...entry, hints })
  await saveTipsterNotes(ownerId, store)
  return store
}

export async function setNoteSummary(
  ownerId: string,
  target: { kind: 'thesis' } | { kind: 'league'; key: string } | { kind: 'team'; key: string } | { kind: 'match'; key: string },
  summary: TipsterHintLine[]
): Promise<TipsterNotesStore> {
  const store = await loadTipsterNotes(ownerId)
  const now = Date.now()

  if (target.kind === 'thesis') {
    store.thesis = { ...store.thesis, summary, summarizedAt: now }
  } else if (target.kind === 'league') {
    const entry = store.leagues[target.key]
    if (entry) store.leagues[target.key] = { ...entry, summary, summarizedAt: now }
  } else if (target.kind === 'team') {
    const entry = store.teams[target.key]
    if (entry) store.teams[target.key] = { ...entry, summary, summarizedAt: now }
  } else {
    const entry = store.matches[target.key]
    if (entry) store.matches[target.key] = { ...entry, summary, summarizedAt: now }
  }

  await saveTipsterNotes(ownerId, store)
  return store
}

export function collectRelevantHints(
  store: TipsterNotesStore,
  context: MatchHintContext
): TipsterHintLine[] {
  const lines: TipsterHintLine[] = []
  const seen = new Set<string>()

  const push = (line: TipsterHintLine) => {
    const key = `${line.layer}:${line.scope ?? ''}:${line.text}`
    if (seen.has(key)) return
    seen.add(key)
    lines.push(line)
  }

  for (const line of store.thesis.summary ?? []) push(line)

  const leagueKey = context.league ? normalizeKey(context.league) : null
  if (leagueKey && store.leagues[leagueKey]?.summary) {
    for (const line of store.leagues[leagueKey].summary!) push(line)
  }

  const teams = normalizeTeamNames(context.matchTitle)
  for (const team of teams) {
    const teamKey = normalizeKey(team)
    const entry = store.teams[teamKey]
    if (entry?.summary) {
      for (const line of entry.summary) push(line)
    }
  }

  const gameId = context.gameId?.trim()
  if (gameId) {
    const entry = store.matches[gameId]
    for (const hint of getMatchHints(entry)) {
      for (const line of hint.summary ?? []) push(line)
    }
    if (!entry?.hints?.length) {
      for (const line of entry?.summary ?? []) push(line)
    }
  }

  return lines
}

export function formatTipsterHintsBlock(lines: TipsterHintLine[]): string {
  if (!lines.length) return ''
  const body = lines
    .map((line) => {
      const weight = line.weight.toUpperCase()
      const scope = line.scope ? ` (${line.scope})` : ''
      return `[${line.layer.toUpperCase()}:${weight}]${scope} ${line.text}`
    })
    .join('\n')

  return [
    '=== TIPSTER CONVICTIONS (HIGH PRIORITY — override web scout when they conflict) ===',
    body,
    '=== END TIPSTER CONVICTIONS ===',
  ].join('\n')
}

export async function buildTipsterHintsPrompt(
  ownerId: string,
  context: MatchHintContext
): Promise<string> {
  if (!ownerId) return ''
  const store = await loadTipsterNotes(ownerId)
  const lines = collectRelevantHints(store, context)
  return formatTipsterHintsBlock(lines)
}

export function getNoteEntry(
  store: TipsterNotesStore,
  target: { kind: 'thesis' } | { kind: 'league'; key: string } | { kind: 'team'; key: string } | { kind: 'match'; key: string }
): TipsterNoteEntry | null {
  if (target.kind === 'thesis') return store.thesis
  if (target.kind === 'league') return store.leagues[target.key] ?? null
  if (target.kind === 'team') return store.teams[target.key] ?? null
  return store.matches[target.key] ?? null
}
