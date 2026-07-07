import type { IndexedVault } from '@/types/indexed-vault'

export type VaultSortKey =
  | 'newest'
  | 'roi'
  | 'winrate'
  | 'avg-odds'
  | 'subscribers'
  | 'liquidity'
  | 'volume'

export type DiscoveryVault = IndexedVault & {
  createdAt: string
  averageWinOdds: number | null
  roiPercent: number | null
  winRatePercent: number | null
}

export type VaultSortOption = {
  key: VaultSortKey
  label: string
  hint: string
}

export const VAULT_SORT_OPTIONS: VaultSortOption[] = [
  { key: 'newest', label: 'Newest', hint: 'Recently created vaults' },
  { key: 'roi', label: 'Top ROI', hint: 'Highest return on staked volume' },
  { key: 'winrate', label: 'Win rate', hint: 'Highest settled win percentage' },
  { key: 'avg-odds', label: 'Avg odds', hint: 'Average decimal odds on winning bets' },
  { key: 'subscribers', label: 'Subscribers', hint: 'Most active investors' },
  { key: 'liquidity', label: 'Liquidity', hint: 'Largest vault TVL' },
  { key: 'volume', label: 'Volume', hint: 'Most total stake placed' },
]
