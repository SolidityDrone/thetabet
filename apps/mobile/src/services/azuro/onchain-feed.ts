import { fetchAzuroGamesByFilters } from '@/services/azuro/api-client'
import { AZURO_CHAIN_ID, AZURO_FOOTBALL_SLUG, AZURO_MIN_PER_PAGE } from '@/config/azuro'
import { getConditionsState } from '@azuro-org/toolkit'

export type AzuroOnChainMarketStatus = {
  gameOnChain: boolean
  gameState?: string
  conditionOnChain: boolean
  conditionState?: string
  outcomeOnChain: boolean
  onChainOdds?: string
  isBettable: boolean
  reason?: string
}

export async function getAzuroOnChainMarketStatus(params: {
  gameId: string
  conditionId: string
  outcomeId: string
}): Promise<AzuroOnChainMarketStatus> {
  let states: Awaited<ReturnType<typeof getConditionsState>>
  try {
    states = await getConditionsState({
      chainId: AZURO_CHAIN_ID,
      conditionIds: [params.conditionId],
    })
  } catch (error) {
    return {
      gameOnChain: false,
      conditionOnChain: false,
      outcomeOnChain: false,
      isBettable: false,
      reason:
        error instanceof Error
          ? error.message
          : 'Could not verify this market with Azuro right now.',
    }
  }

  const condition = states[0]
  if (!condition) {
    return {
      gameOnChain: false,
      conditionOnChain: false,
      outcomeOnChain: false,
      isBettable: false,
      reason:
        'This match is not open for on-chain betting. Pull to refresh and pick another market.',
    }
  }

  if (condition.state !== 'Active') {
    return {
      gameOnChain: true,
      conditionOnChain: true,
      conditionState: condition.state,
      outcomeOnChain: false,
      isBettable: false,
      reason: `Market is ${condition.state.toLowerCase()} — betting is closed for this line.`,
    }
  }

  const outcome = condition.outcomes.find(
    (row) => String(row.outcomeId) === String(params.outcomeId)
  )

  if (!outcome) {
    return {
      gameOnChain: true,
      conditionOnChain: true,
      conditionState: condition.state,
      outcomeOnChain: false,
      isBettable: false,
      reason: 'This outcome is not available. Pick another selection.',
    }
  }

  if (outcome.state !== 'Active') {
    return {
      gameOnChain: true,
      conditionOnChain: true,
      conditionState: condition.state,
      outcomeOnChain: true,
      onChainOdds: outcome.odds,
      isBettable: false,
      reason: `Outcome is ${outcome.state.toLowerCase()} — pick another line.`,
    }
  }

  return {
    gameOnChain: true,
    conditionOnChain: true,
    conditionState: condition.state,
    outcomeOnChain: true,
    onChainOdds: outcome.odds,
    isBettable: true,
  }
}

export async function assertAzuroMarketIsOnChain(params: {
  gameId: string
  conditionId: string
  outcomeId: string
}): Promise<AzuroOnChainMarketStatus> {
  const status = await getAzuroOnChainMarketStatus(params)
  if (!status.isBettable) {
    throw new Error(
      status.reason ??
        'This market cannot be bet on-chain right now. Try another match or check back later.'
    )
  }
  return status
}

export type AzuroChainMarketSnapshot = {
  footballBettable: number
  otherBettableBySport: Record<string, number>
  previewFootballListed: number
}

/** Counts from Azuro betting API (`games-by-filters`), not the stale data-feed subgraph. */
export async function fetchPolygonAzuroMarketSnapshot(): Promise<AzuroChainMarketSnapshot> {
  const [prematch, live] = await Promise.all([
    fetchAzuroGamesByFilters({
      gameState: 'Prematch',
      sportSlug: AZURO_FOOTBALL_SLUG,
      perPage: AZURO_MIN_PER_PAGE,
      page: 1,
    }),
    fetchAzuroGamesByFilters({
      gameState: 'Live',
      sportSlug: AZURO_FOOTBALL_SLUG,
      perPage: AZURO_MIN_PER_PAGE,
      page: 1,
    }),
  ])

  let previewFootballListed = 0
  try {
    const api = 'https://api.onchainfeed.org/api/v1/public'
    const qs = new URLSearchParams({
      environment: 'PolygonUSDT',
      gameState: 'Prematch',
      sportSlug: 'football',
      numberOfGames: '200',
    })
    const rest = await fetch(`${api}/market-manager/sports?${qs}`).then((r) => r.json())
    for (const sport of rest.sports ?? []) {
      for (const country of sport.countries ?? []) {
        for (const league of country.leagues ?? []) {
          previewFootballListed += (league.games ?? []).length
        }
      }
    }
  } catch {
    previewFootballListed = 0
  }

  return {
    footballBettable: (prematch.total ?? 0) + (live.total ?? 0),
    otherBettableBySport: {},
    previewFootballListed,
  }
}
