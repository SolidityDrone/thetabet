import AsyncStorage from '@react-native-async-storage/async-storage'
import { getBetsByBettor, getBetStatus, type BetOrderData } from '@azuro-org/toolkit'
import type { Address } from 'viem'
import { AZURO_CHAIN_ID } from '@/config/azuro'
import type { AzuroPlacedBetRecord } from '@/types/azuro'

const LOCAL_BETS_KEY = 'thetabet:azuro:bets'

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

export async function fetchRemoteBets(bettor: Address) {
  const orders = await getBetsByBettor({
    chainId: AZURO_CHAIN_ID,
    bettor,
    limit: 100,
  })

  return orders ?? []
}

export function summarizeBetOrder(order: BetOrderData) {
  const selection = order.conditions?.[0]
  const status = getBetStatus({
    games: [],
    orderState: order.state,
    graphStatus: null,
  })

  return {
    id: order.id,
    state: order.state,
    status,
    amount: String(order.amount),
    createdAt: order.createdAt,
    result: order.result,
    gameTitle: selection ? `Game ${selection.gameId}` : 'Azuro bet',
    outcomeTitle: selection ? `Outcome ${selection.outcomeId}` : 'Selection',
    rawOdds: String(order.odds),
    errorMessage: order.errorMessage,
  }
}
