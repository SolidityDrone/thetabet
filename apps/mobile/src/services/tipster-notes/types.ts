export type TipsterHintWeight = 'high' | 'med' | 'low'

export type TipsterHintLayer = 'thesis' | 'league' | 'team' | 'match'

export type TipsterHintLine = {
  layer: TipsterHintLayer
  weight: TipsterHintWeight
  text: string
  scope?: string
}

export type TipsterHintInputMode = 'voice' | 'paste'

export type TipsterMatchHint = {
  id: string
  raw: string
  sources?: string
  summary: TipsterHintLine[] | null
  summarizedAt: number | null
  createdAt: number
  inputMode: TipsterHintInputMode
}

export type TipsterNoteEntry = {
  raw: string
  summary: TipsterHintLine[] | null
  summarizedAt: number | null
  updatedAt: number
  matchTitle?: string
  league?: string
  hints?: TipsterMatchHint[]
}

export type TipsterNotesStore = {
  version: 1
  thesis: TipsterNoteEntry
  leagues: Record<string, TipsterNoteEntry>
  teams: Record<string, TipsterNoteEntry>
  matches: Record<string, TipsterNoteEntry>
}

export type MatchHintContext = {
  gameId?: string | null
  matchTitle?: string | null
  league?: string | null
}

export function emptyNoteEntry(): TipsterNoteEntry {
  return {
    raw: '',
    summary: null,
    summarizedAt: null,
    updatedAt: 0,
  }
}

export function emptyTipsterNotesStore(): TipsterNotesStore {
  return {
    version: 1,
    thesis: emptyNoteEntry(),
    leagues: {},
    teams: {},
    matches: {},
  }
}
