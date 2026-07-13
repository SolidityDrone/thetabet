import {
  calcAverageWinOdds,
  calcRoiPercent,
  calcWinRate,
} from '@/config/theta'
import { ponderQuery } from '@/services/ponder/client'
import { fetchTipsterByAddress } from '@/services/ponder/tipster-names'
import { resolveWalletTipsterHandle } from '@/services/tipster-handle'
import type { DiscoveryVault, VaultSortKey } from '@/types/vault-discovery'

type PonderVaultRow = {
  id: string
  address: string
  tipster: string
  tipsterHandle: string
  name: string
  symbol: string
  freeBalance: string
  totalAssets: string
  shareSupply: string
  openBets: number
  pendingClaimable: string
  settledWins: number
  settledLosses: number
  totalStaked: string
  totalPayout: string
  createdAt: string
  isMocked?: boolean
  positions?: { totalCount: number }
  bets?: {
    items: Array<{ stake: string; payout: string; lifecycle: number }>
  }
}

type DiscoverVaultsResponse = {
  vaults: {
    totalCount: number
    items: PonderVaultRow[]
  }
}

type VaultDetailResponse = {
  vault: PonderVaultRow | null
}

const DISCOVER_VAULTS_QUERY = `
  query DiscoverVaults($limit: Int!, $orderBy: String, $orderDirection: String) {
    vaults(limit: $limit, orderBy: $orderBy, orderDirection: $orderDirection) {
      totalCount
      items {
        id
        address
        tipster
        tipsterHandle
        name
        symbol
        freeBalance
        totalAssets
        shareSupply
        openBets
        pendingClaimable
        settledWins
        settledLosses
        totalStaked
        totalPayout
        createdAt
        isMocked
        positions(where: { shares_gt: "0" }, limit: 1) {
          totalCount
        }
        bets(where: { lifecycle: 4 }, limit: 12, orderBy: "closedAt", orderDirection: "desc") {
          items {
            stake
            payout
            lifecycle
          }
        }
      }
    }
  }
`

const VAULT_DETAIL_QUERY = `
  query VaultDetail($id: BigInt!) {
    vault(id: $id) {
      id
      address
      tipster
      tipsterHandle
      name
      symbol
      freeBalance
      totalAssets
      shareSupply
      openBets
      pendingClaimable
      settledWins
      settledLosses
      totalStaked
      totalPayout
      createdAt
      isMocked
      positions(where: { shares_gt: "0" }, limit: 1) {
        totalCount
      }
      bets(where: { lifecycle: 4 }, limit: 24, orderBy: "closedAt", orderDirection: "desc") {
        items {
          stake
          payout
          lifecycle
        }
      }
    }
  }
`

function mapDiscoveryVault(row: PonderVaultRow): DiscoveryVault {
  const totalStaked = BigInt(row.totalStaked || '0')
  const totalPayout = BigInt(row.totalPayout || '0')
  const bets = row.bets?.items ?? []

  return {
    id: row.id,
    address: row.address,
    tipster: row.tipster,
    tipsterHandle: row.tipsterHandle,
    name: row.name,
    symbol: row.symbol,
    freeBalance: row.freeBalance,
    totalAssets: row.totalAssets,
    shareSupply: row.shareSupply,
    openBets: row.openBets,
    pendingClaimable: row.pendingClaimable,
    settledWins: row.settledWins,
    settledLosses: row.settledLosses,
    totalStaked: row.totalStaked,
    totalPayout: row.totalPayout,
    createdAt: row.createdAt,
    isMocked: row.isMocked === true,
    subscriberCount: row.positions?.totalCount ?? 0,
    averageWinOdds: calcAverageWinOdds(bets),
    roiPercent: calcRoiPercent(totalStaked, totalPayout),
    winRatePercent: calcWinRate(row.settledWins, row.settledLosses),
  }
}

const tipsterHandleCache = new Map<string, string | null>()

async function resolveVaultTipsterHandle(tipster: string, indexedHandle?: string) {
  if (indexedHandle?.trim()) return indexedHandle.trim()

  const key = tipster.toLowerCase()
  if (tipsterHandleCache.has(key)) {
    return tipsterHandleCache.get(key) ?? ''
  }

  let handle: string | null = null
  try {
    const row = await fetchTipsterByAddress(tipster)
    handle = row?.name ?? null
  } catch {
    // Fall through to on-chain lookup.
  }

  if (!handle) {
    handle = await resolveWalletTipsterHandle(tipster)
  }

  tipsterHandleCache.set(key, handle)
  return handle ?? ''
}

export async function enrichDiscoveryVault(vault: DiscoveryVault): Promise<DiscoveryVault> {
  const tipsterHandle = await resolveVaultTipsterHandle(vault.tipster, vault.tipsterHandle)
  if (!tipsterHandle || tipsterHandle === vault.tipsterHandle) {
    return vault
  }
  return { ...vault, tipsterHandle }
}

async function enrichDiscoveryVaults(vaults: DiscoveryVault[]) {
  return Promise.all(vaults.map((vault) => enrichDiscoveryVault(vault)))
}

function compareBigIntDesc(left: string, right: string) {
  const leftValue = BigInt(left || '0')
  const rightValue = BigInt(right || '0')
  if (leftValue === rightValue) return 0
  return leftValue > rightValue ? -1 : 1
}

function compareNullableNumberDesc(left: number | null, right: number | null) {
  const leftValue = left ?? Number.NEGATIVE_INFINITY
  const rightValue = right ?? Number.NEGATIVE_INFINITY
  if (leftValue === rightValue) return 0
  return leftValue > rightValue ? -1 : 1
}

function compareRealBeforeMocked(left: DiscoveryVault, right: DiscoveryVault) {
  const leftRank = left.isMocked ? 1 : 0
  const rightRank = right.isMocked ? 1 : 0
  if (leftRank !== rightRank) return leftRank - rightRank
  return 0
}

function compareBySortKey(left: DiscoveryVault, right: DiscoveryVault, sortKey: VaultSortKey) {
  switch (sortKey) {
    case 'newest':
      return compareBigIntDesc(left.createdAt, right.createdAt)
    case 'roi':
      return compareNullableNumberDesc(left.roiPercent, right.roiPercent)
    case 'winrate':
      return compareNullableNumberDesc(left.winRatePercent, right.winRatePercent)
    case 'avg-odds':
      return compareNullableNumberDesc(left.averageWinOdds, right.averageWinOdds)
    case 'subscribers':
      return (right.subscriberCount ?? 0) - (left.subscriberCount ?? 0)
    case 'liquidity':
      return compareBigIntDesc(left.totalAssets, right.totalAssets)
    case 'volume':
      return compareBigIntDesc(left.totalStaked, right.totalStaked)
    default:
      return 0
  }
}

export function sortDiscoveryVaults(vaults: DiscoveryVault[], sortKey: VaultSortKey) {
  const sorted = [...vaults]

  sorted.sort((left, right) => {
    const realFirst = compareRealBeforeMocked(left, right)
    if (realFirst !== 0) return realFirst
    return compareBySortKey(left, right, sortKey)
  })

  return sorted
}

function serverOrderForSort(sortKey: VaultSortKey) {
  switch (sortKey) {
    case 'newest':
      return { orderBy: 'createdAt', orderDirection: 'desc' as const }
    case 'liquidity':
      return { orderBy: 'totalAssets', orderDirection: 'desc' as const }
    case 'volume':
      return { orderBy: 'totalStaked', orderDirection: 'desc' as const }
    default:
      return { orderBy: 'createdAt', orderDirection: 'desc' as const }
  }
}

export async function fetchDiscoveryVaults(sortKey: VaultSortKey, limit = 100) {
  const { orderBy, orderDirection } = serverOrderForSort(sortKey)
  const data = await ponderQuery<DiscoverVaultsResponse>(DISCOVER_VAULTS_QUERY, {
    limit,
    orderBy,
    orderDirection,
  })

  // Keep discovery fast: rely on the indexed handle already returned by Ponder.
  // Per-vault enrichment adds N extra network requests and makes list loading feel slow.
  const vaults = data.vaults.items.map(mapDiscoveryVault)
  return {
    vaults: sortDiscoveryVaults(vaults, sortKey),
    totalCount: data.vaults.totalCount,
  }
}

export async function fetchDiscoveryVaultById(id: string) {
  const data = await ponderQuery<VaultDetailResponse>(VAULT_DETAIL_QUERY, { id })
  if (!data.vault) return null
  return enrichDiscoveryVault(mapDiscoveryVault(data.vault))
}
