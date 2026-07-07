import { formatBetToken } from '@/config/theta'
import { ponderQuery } from '@/services/ponder/client'
import type { VaultBetRecord } from '@/types/vault-bet'

type VaultBetsResponse = {
  vaultBets: {
    items: Array<{
      id: string
      stake: string
      payout: string
      lifecycle: number
      conditionId: string
      outcomeId: string
      openedAt: string
      closedAt: string | null
    }>
    totalCount: number
  }
}

const VAULT_BETS_QUERY = `
  query VaultBets($vaultId: BigInt!, $limit: Int!, $offset: Int!) {
    vaultBets(
      where: { vaultId: $vaultId }
      orderBy: "openedAt"
      orderDirection: "desc"
      limit: $limit
      offset: $offset
    ) {
      totalCount
      items {
        id
        stake
        payout
        lifecycle
        conditionId
        outcomeId
        openedAt
        closedAt
      }
    }
  }
`

export async function fetchVaultBets(vaultId: string, limit = 20, offset = 0) {
  const data = await ponderQuery<VaultBetsResponse>(VAULT_BETS_QUERY, {
    vaultId,
    limit,
    offset,
  })

  const items: VaultBetRecord[] = data.vaultBets.items.map((row) => ({
    id: row.id,
    stake: row.stake,
    payout: row.payout,
    lifecycle: row.lifecycle,
    conditionId: row.conditionId,
    outcomeId: row.outcomeId,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
  }))

  return {
    bets: items,
    totalCount: data.vaultBets.totalCount,
    hasMore: offset + items.length < data.vaultBets.totalCount,
  }
}

export function vaultBetStatusLabel(lifecycle: number) {
  switch (lifecycle) {
    case 0:
      return 'Open'
    case 1:
      return 'Won'
    case 2:
      return 'Lost'
    case 3:
      return 'Canceled'
    case 4:
      return 'Won'
    default:
      return 'Unknown'
  }
}

export function vaultBetDisplayStatus(lifecycle: number): 'open' | 'won' | 'lost' | 'canceled' {
  switch (lifecycle) {
    case 0:
    case 1:
      return lifecycle === 0 ? 'open' : 'won'
    case 2:
      return 'lost'
    case 3:
      return 'canceled'
    case 4:
      return 'won'
    default:
      return 'open'
  }
}

export function formatVaultBetPnl(bet: VaultBetRecord) {
  const stake = Number(formatBetToken(bet.stake, 4))
  const payout = Number(formatBetToken(bet.payout, 4))
  const status = vaultBetDisplayStatus(bet.lifecycle)

  if (status === 'open') {
    return { label: 'At stake', value: `${stake.toFixed(2)} USDT`, tone: 'neutral' as const }
  }
  if (status === 'lost' || status === 'canceled') {
    return { label: 'PnL', value: `-${stake.toFixed(2)} USDT`, tone: 'loss' as const }
  }
  const profit = payout - stake
  return {
    label: 'PnL',
    value: `${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDT`,
    tone: profit >= 0 ? ('win' as const) : ('loss' as const),
  }
}

export function formatVaultBetOdds(bet: VaultBetRecord) {
  const stake = BigInt(bet.stake || '0')
  const payout = BigInt(bet.payout || '0')
  if (stake <= 0n || payout <= 0n) return null
  return Number(payout) / Number(stake)
}
