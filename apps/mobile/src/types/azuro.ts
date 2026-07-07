import type { ConditionDetailedData, GameData } from '@azuro-org/toolkit'

export type AzuroLeagueRef = {
  slug: string
  name: string
  countrySlug: string
  countryName: string
  isTopLeague: boolean
}

export type AzuroFootballSection = {
  league: AzuroLeagueRef
  games: GameData[]
}

export type AzuroBetSelection = {
  gameId: string
  gameTitle: string
  gameStartsAt?: string
  conditionId: string
  conditionTitle: string
  outcomeId: string
  outcomeTitle: string
  rawOdds: string
  decimalOdds: number
}

export type AzuroBetMode = 'personal' | 'tipster'

export type AzuroPlacedBetRecord = {
  id: string
  state: string
  createdAt: number
  amount: string
  selection: AzuroBetSelection
  bettor: string
  errorMessage?: string
}

export type AzuroEventMarkets = {
  game: GameData
  conditions: ConditionDetailedData[]
}
