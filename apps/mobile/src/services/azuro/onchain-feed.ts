import { AZURO_CHAIN_ID, azuroChainConfig } from '@/config/azuro'

/** Polygon mainnet (137) Azuro feed subgraph — not Amoy. */
const FEED_GRAPHQL = azuroChainConfig.graphql.feed

if (__DEV__ && !FEED_GRAPHQL.includes('polygon')) {
  console.warn(
    `[Azuro] Feed URL does not look like Polygon mainnet (chain ${AZURO_CHAIN_ID}): ${FEED_GRAPHQL}`
  )
}

type GraphqlResponse<T> = {
  data?: T
  errors?: Array<{ message: string }>
}

type OnChainConditionRow = {
  conditionId: string
  state: string
  isPrematchEnabled: boolean
  isLiveEnabled: boolean
  outcomes: Array<{ outcomeId: string; currentOdds: string }>
}

type OnChainGameRow = {
  gameId: string
  state: string
  conditions: OnChainConditionRow[]
}

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

async function queryFeed<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(FEED_GRAPHQL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(`Azuro feed GraphQL → ${response.status}: ${bodyText.slice(0, 200)}`)
  }

  const json = JSON.parse(bodyText) as GraphqlResponse<T>
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join(' · '))
  }
  if (!json.data) {
    throw new Error('Azuro feed GraphQL returned no data')
  }

  return json.data
}

const MARKET_STATUS_QUERY = `
  query AzuroOnChainMarketStatus($gameId: String!, $conditionId: String!) {
    games(where: { gameId: $gameId }) {
      gameId
      state
      conditions(where: { conditionId: $conditionId }) {
        conditionId
        state
        isPrematchEnabled
        isLiveEnabled
        outcomes {
          outcomeId
          currentOdds
        }
      }
    }
  }
`

export async function getAzuroOnChainMarketStatus(params: {
  gameId: string
  conditionId: string
  outcomeId: string
}): Promise<AzuroOnChainMarketStatus> {
  const data = await queryFeed<{ games: OnChainGameRow[] }>(MARKET_STATUS_QUERY, {
    gameId: params.gameId,
    conditionId: params.conditionId,
  })

  const game = data.games[0]
  if (!game) {
    return {
      gameOnChain: false,
      conditionOnChain: false,
      outcomeOnChain: false,
      isBettable: false,
      reason:
        'This match is not on Polygon yet. Azuro lists odds early, but bets only work after the market is deployed on-chain.',
    }
  }

  const condition = game.conditions[0]
  if (!condition) {
    return {
      gameOnChain: true,
      gameState: game.state,
      conditionOnChain: false,
      outcomeOnChain: false,
      isBettable: false,
      reason: 'This market is not on-chain yet. Pull to refresh and pick another outcome.',
    }
  }

  const outcome = condition.outcomes.find(
    (row) => String(row.outcomeId) === String(params.outcomeId)
  )

  if (!outcome) {
    return {
      gameOnChain: true,
      gameState: game.state,
      conditionOnChain: true,
      conditionState: condition.state,
      outcomeOnChain: false,
      isBettable: false,
      reason: 'This outcome is not available on-chain. Pick another selection.',
    }
  }

  if (condition.state !== 'Active') {
    return {
      gameOnChain: true,
      gameState: game.state,
      conditionOnChain: true,
      conditionState: condition.state,
      outcomeOnChain: true,
      onChainOdds: outcome.currentOdds,
      isBettable: false,
      reason: `Market is ${condition.state.toLowerCase()} on-chain — betting is closed for this line.`,
    }
  }

  return {
    gameOnChain: true,
    gameState: game.state,
    conditionOnChain: true,
    conditionState: condition.state,
    outcomeOnChain: true,
    onChainOdds: outcome.currentOdds,
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

const GAME_ON_CHAIN_QUERY = `
  query AzuroGameOnChain($gameId: String!) {
    games(where: { gameId: $gameId }) {
      gameId
      state
    }
  }
`

export async function isAzuroGameOnChain(gameId: string): Promise<boolean> {
  const data = await queryFeed<{ games: Array<{ gameId: string }> }>(GAME_ON_CHAIN_QUERY, {
    gameId,
  })
  return data.games.length > 0
}

type OnChainBettableGameRow = {
  gameId: string
  conditions: Array<{
    conditionId: string
    isPrematchEnabled: boolean
    isLiveEnabled: boolean
  }>
}

const BETTABLE_GAMES_QUERY = `
  query AzuroOnChainBettableGames($gameIds: [String!]!) {
    games(where: { gameId_in: $gameIds }) {
      gameId
      conditions(where: { state: Active }) {
        conditionId
        isPrematchEnabled
        isLiveEnabled
      }
    }
  }
`

const ON_CHAIN_BATCH_SIZE = 40

function isGameBettableOnChain(row: OnChainBettableGameRow): boolean {
  return row.conditions.some(
    (condition) => condition.isPrematchEnabled || condition.isLiveEnabled
  )
}

/** Batch-resolve which REST game ids are bettable on Polygon mainnet (feed subgraph). */
export async function fetchOnChainBettableGameIds(gameIds: string[]): Promise<Set<string>> {
  const uniqueIds = [...new Set(gameIds.filter(Boolean))]
  if (uniqueIds.length === 0) return new Set()

  const bettable = new Set<string>()

  for (let offset = 0; offset < uniqueIds.length; offset += ON_CHAIN_BATCH_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + ON_CHAIN_BATCH_SIZE)
    const data = await queryFeed<{ games: OnChainBettableGameRow[] }>(BETTABLE_GAMES_QUERY, {
      gameIds: chunk,
    })

    for (const game of data.games) {
      if (isGameBettableOnChain(game)) {
        bettable.add(game.gameId)
      }
    }
  }

  return bettable
}

type OnChainFootballGameRow = {
  gameId: string
  startsAt: string
  conditions: Array<{
    isPrematchEnabled: boolean
    isLiveEnabled: boolean
  }>
}

const ON_CHAIN_FOOTBALL_PREMATCH_QUERY = `
  query OnChainFootballPrematch($skip: Int!, $first: Int!) {
    games(
      first: $first
      skip: $skip
      orderBy: startsAt
      orderDirection: asc
      where: { sport_: { slug: "football" }, state: Prematch }
    ) {
      gameId
      startsAt
      conditions(where: { state: Active }) {
        isPrematchEnabled
        isLiveEnabled
      }
    }
  }
`

const ON_CHAIN_FOOTBALL_LIVE_QUERY = `
  query OnChainFootballLive($skip: Int!, $first: Int!) {
    games(
      first: $first
      skip: $skip
      orderBy: startsAt
      orderDirection: desc
      where: { sport_: { slug: "football" }, state: Live }
    ) {
      gameId
      startsAt
      conditions(where: { state: Active }) {
        isPrematchEnabled
        isLiveEnabled
      }
    }
  }
`

/**
 * Football ids on the Polygon mainnet Azuro feed with active markets.
 * Azuro REST /sports preview catalog is a disjoint set — use this for real betting lists.
 */
export async function fetchOnChainFootballBettableGameIds(params?: {
  gameState?: 'Prematch' | 'Live'
  limit?: number
}): Promise<string[]> {
  const gameState = params?.gameState ?? 'Prematch'
  const limit = params?.limit ?? 80
  const query =
    gameState === 'Live' ? ON_CHAIN_FOOTBALL_LIVE_QUERY : ON_CHAIN_FOOTBALL_PREMATCH_QUERY

  const ids: string[] = []
  let skip = 0

  while (ids.length < limit) {
    const first = Math.min(100, limit - ids.length + 20)
    const data = await queryFeed<{ games: OnChainFootballGameRow[] }>(query, { skip, first })
    const batch = data.games ?? []
    if (batch.length === 0) break

    for (const game of batch) {
      if (!isGameBettableOnChain(game)) continue
      ids.push(game.gameId)
      if (ids.length >= limit) break
    }

    if (batch.length < first) break
    skip += first
  }

  return ids
}
