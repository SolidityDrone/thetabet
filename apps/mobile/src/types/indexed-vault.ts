export type IndexedVault = {
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
  /** Active investors with shares > 0; null when indexer has not loaded yet. */
  subscriberCount?: number | null
}

export type IndexedPosition = {
  id: string
  vaultId: string
  vaultAddress: string
  investor: string
  shares: string
  vault: IndexedVault | null
}
