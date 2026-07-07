import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  getBetsByBettor,
  getConditionsByGameIds,
  getGamesByIds,
  BetOrderResult,
  BetOrderState,
  type BetOrderData,
} from '@azuro-org/toolkit'
import type { Address } from 'viem'
import { AZURO_CHAIN_ID } from '@/config/azuro'
import type { AzuroPlacedBetRecord } from '@/types/azuro'

const LOCAL_BETS_KEY = 'thetabet:azuro:bets'

const ACCEPTED_ORDER_STATES = new Set<BetOrderState>([
  BetOrderState.Accepted,
  BetOrderState.Settled,
  BetOrderState.PendingCancel,
])

export type BetHistoryDisplayStatus = 'pending' | 'won' | 'lost' | 'canceled'

export type BetHistoryItem = {
  id: string
  status: BetHistoryDisplayStatus
  statusLabel: string
  gameTitle: string
  leagueName: string
  leagueSlug: string
  marketTitle: string
  outcomeTitle: string
  stake: number
  odds: number
  potentialReturn: number
  profit: number
  payout: number | null
  createdAt: string
}

export async function loadLocalBets(): Promise<AzuroPlacedBetRecord[]> {
  const raw = await AsyncStorage.getItem(LOCAL_BETS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as AzuroPlacedBetRecord[]
  } catch {
    return []
  }
}

export async function saveLocalBet(record: AzuroPlacedBetRecord) {
  const existing = await loadLocalBets()
  const next = [record, ...existing.filter((item) => item.id !== record.id)].slice(0, 100)
  await AsyncStorage.setItem(LOCAL_BETS_KEY, JSON.stringify(next))
  return next
}

export function resolveBetDisplayStatus(order: BetOrderData): BetHistoryDisplayStatus {
  if (order.result === BetOrderResult.Won) return 'won'
  if (order.result === BetOrderResult.Lost) return 'lost'
  if (order.result === BetOrderResult.Canceled || order.state === BetOrderState.Canceled) {
    return 'canceled'
  }
  return 'pending'
}

export function betStatusLabel(status: BetHistoryDisplayStatus): string {
  switch (status) {
    case 'won':
      return 'Won'
    case 'lost':
      return 'Lost'
    case 'canceled':
      return 'Canceled'
    default:
      return 'Pending'
  }
}

function isAcceptedOrder(order: BetOrderData): boolean {
  if (order.state === BetOrderState.Rejected) return false
  if (order.state === BetOrderState.Created || order.state === BetOrderState.Placed) return false
  if (order.state === BetOrderState.Sent) return false
  return ACCEPTED_ORDER_STATES.has(order.state) || order.state === BetOrderState.Settled
}

async function enrichBetOrders(orders: BetOrderData[]): Promise<BetHistoryItem[]> {
  if (orders.length === 0) return []

  const gameIds = [...new Set(orders.map((order) => order.conditions[0]?.gameId).filter(Boolean))]
  const [games, conditions] = await Promise.all([
    getGamesByIds({ chainId: AZURO_CHAIN_ID, gameIds }),
    getConditionsByGameIds({ chainId: AZURO_CHAIN_ID, gameIds, extended: true }),
  ])

  const gameById = new Map(games.map((game) => [String(game.id), game]))
  const conditionById = new Map(conditions.map((condition) => [condition.conditionId, condition]))

  return orders.map((order) => {
    const selection = order.conditions[0]
    const game = selection ? gameById.get(String(selection.gameId)) : undefined
    const condition = selection ? conditionById.get(selection.conditionId) : undefined
    const outcome = condition?.outcomes.find(
      (row) => String(row.outcomeId) === String(selection?.outcomeId)
    )

    const stake = Number(order.amount) || 0
    const odds = Number(selection?.price ?? order.odds) || 0
    const potentialReturn = stake * odds
    const profit = potentialReturn - stake
    const status = resolveBetDisplayStatus(order)

    return {
      id: order.id,
      status,
      statusLabel: betStatusLabel(status),
      gameTitle: game?.title ?? 'Unknown match',
      leagueName: game?.league?.name ?? 'Football',
      leagueSlug: game?.league?.slug ?? '',
      marketTitle: condition?.title ?? 'Market',
      outcomeTitle: outcome?.title ?? `Outcome ${selection?.outcomeId ?? '?'}`,
      stake,
      odds,
      potentialReturn,
      profit,
      payout: order.payout,
      createdAt: order.createdAt,
    }
  })
}

export async function fetchAcceptedBetHistory(
  bettor: Address,
  options?: { limit?: number }
): Promise<BetHistoryItem[]> {
  const orders = await getBetsByBettor({
    chainId: AZURO_CHAIN_ID,
    bettor,
    limit: options?.limit ?? 50,
  })

  const accepted = (orders ?? []).filter(isAcceptedOrder)
  return enrichBetOrders(accepted)
}
