export type VaultBetRecord = {
  id: string
  stake: string
  payout: string
  lifecycle: number
  conditionId: string
  outcomeId: string
  openedAt: string
  closedAt: string | null
}
