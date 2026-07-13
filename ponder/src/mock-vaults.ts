type MockBet = {
  id: bigint
  stakeUsdt: number
  payoutUsdt: number
}

export type MockVaultSeed = {
  id: bigint
  address: `0x${string}`
  tipster: `0x${string}`
  tipsterHandle: string
  name: string
  symbol: string
  freeBalanceUsdt: number
  totalAssetsUsdt: number
  shareSupplyUsdt: number
  openBets: number
  pendingClaimableUsdt: number
  settledWins: number
  settledLosses: number
  totalStakedUsdt: number
  totalPayoutUsdt: number
  createdAtDaysAgo: number
  subscriberCount: number
  winningBets: MockBet[]
}

const MOCK_VAULT_BASE_ID = 9_000_001n
const MOCK_BET_BASE_ID = 9_000_000_001n

function usdt(amount: number) {
  return BigInt(Math.round(amount * 1_000_000))
}

function mockAddress(kind: "vault" | "tipster", index: number): `0x${string}` {
  const suffix = (0x8000 + index).toString(16).padStart(4, "0")
  return `0x000000000000000000000000000000000000${suffix}` as `0x${string}`
}

function mockInvestor(index: number): `0x${string}` {
  const suffix = (0x7000 + index).toString(16).padStart(4, "0")
  return `0x000000000000000000000000000000000000${suffix}` as `0x${string}`
}

export const MOCK_VAULTS: MockVaultSeed[] = [
  {
    id: MOCK_VAULT_BASE_ID,
    address: mockAddress("vault", 1),
    tipster: mockAddress("tipster", 1),
    tipsterHandle: "ace_striker",
    name: "Premier Edge Vault",
    symbol: "ACE",
    freeBalanceUsdt: 1.85,
    totalAssetsUsdt: 4.2,
    shareSupplyUsdt: 4.05,
    openBets: 1,
    pendingClaimableUsdt: 0.12,
    settledWins: 5,
    settledLosses: 2,
    totalStakedUsdt: 8.4,
    totalPayoutUsdt: 9.65,
    createdAtDaysAgo: 42,
    subscriberCount: 3,
    winningBets: [
      { id: MOCK_BET_BASE_ID, stakeUsdt: 0.5, payoutUsdt: 1.25 },
      { id: MOCK_BET_BASE_ID + 1n, stakeUsdt: 0.35, payoutUsdt: 0.77 },
    ],
  },
  {
    id: MOCK_VAULT_BASE_ID + 1n,
    address: mockAddress("vault", 2),
    tipster: mockAddress("tipster", 2),
    tipsterHandle: "value_hunter",
    name: "Underdog Alpha",
    symbol: "DOG",
    freeBalanceUsdt: 0.95,
    totalAssetsUsdt: 2.8,
    shareSupplyUsdt: 2.7,
    openBets: 0,
    pendingClaimableUsdt: 0.05,
    settledWins: 3,
    settledLosses: 2,
    totalStakedUsdt: 4.1,
    totalPayoutUsdt: 4.55,
    createdAtDaysAgo: 28,
    subscriberCount: 2,
    winningBets: [
      { id: MOCK_BET_BASE_ID + 10n, stakeUsdt: 0.25, payoutUsdt: 0.68 },
      { id: MOCK_BET_BASE_ID + 11n, stakeUsdt: 0.4, payoutUsdt: 1.04 },
    ],
  },
  {
    id: MOCK_VAULT_BASE_ID + 2n,
    address: mockAddress("vault", 3),
    tipster: mockAddress("tipster", 3),
    tipsterHandle: "clutch_plays",
    name: "Live Fire Syndicate",
    symbol: "FIRE",
    freeBalanceUsdt: 2.1,
    totalAssetsUsdt: 6.5,
    shareSupplyUsdt: 6.2,
    openBets: 2,
    pendingClaimableUsdt: 0.28,
    settledWins: 7,
    settledLosses: 4,
    totalStakedUsdt: 11.2,
    totalPayoutUsdt: 11.85,
    createdAtDaysAgo: 63,
    subscriberCount: 4,
    winningBets: [
      { id: MOCK_BET_BASE_ID + 20n, stakeUsdt: 0.6, payoutUsdt: 1.08 },
      { id: MOCK_BET_BASE_ID + 21n, stakeUsdt: 0.45, payoutUsdt: 0.76 },
    ],
  },
  {
    id: MOCK_VAULT_BASE_ID + 3n,
    address: mockAddress("vault", 4),
    tipster: mockAddress("tipster", 4),
    tipsterHandle: "calm_bankroll",
    name: "Steady Yield Pool",
    symbol: "STY",
    freeBalanceUsdt: 3.4,
    totalAssetsUsdt: 8.75,
    shareSupplyUsdt: 8.5,
    openBets: 0,
    pendingClaimableUsdt: 0,
    settledWins: 4,
    settledLosses: 1,
    totalStakedUsdt: 6.3,
    totalPayoutUsdt: 6.62,
    createdAtDaysAgo: 95,
    subscriberCount: 5,
    winningBets: [
      { id: MOCK_BET_BASE_ID + 30n, stakeUsdt: 0.75, payoutUsdt: 0.98 },
      { id: MOCK_BET_BASE_ID + 31n, stakeUsdt: 0.55, payoutUsdt: 0.66 },
    ],
  },
  {
    id: MOCK_VAULT_BASE_ID + 4n,
    address: mockAddress("vault", 5),
    tipster: mockAddress("tipster", 5),
    tipsterHandle: "longshot_lab",
    name: "Parlay Lab",
    symbol: "LAB",
    freeBalanceUsdt: 0.42,
    totalAssetsUsdt: 1.25,
    shareSupplyUsdt: 1.2,
    openBets: 1,
    pendingClaimableUsdt: 0.08,
    settledWins: 2,
    settledLosses: 3,
    totalStakedUsdt: 2.4,
    totalPayoutUsdt: 2.15,
    createdAtDaysAgo: 17,
    subscriberCount: 1,
    winningBets: [
      { id: MOCK_BET_BASE_ID + 40n, stakeUsdt: 0.15, payoutUsdt: 0.52 },
      { id: MOCK_BET_BASE_ID + 41n, stakeUsdt: 0.2, payoutUsdt: 0.6 },
    ],
  },
  {
    id: MOCK_VAULT_BASE_ID + 5n,
    address: mockAddress("vault", 6),
    tipster: mockAddress("tipster", 6),
    tipsterHandle: "euro_nights",
    name: "Midweek Momentum",
    symbol: "MID",
    freeBalanceUsdt: 1.15,
    totalAssetsUsdt: 3.6,
    shareSupplyUsdt: 3.45,
    openBets: 1,
    pendingClaimableUsdt: 0.14,
    settledWins: 5,
    settledLosses: 3,
    totalStakedUsdt: 5.8,
    totalPayoutUsdt: 6.25,
    createdAtDaysAgo: 51,
    subscriberCount: 2,
    winningBets: [
      { id: MOCK_BET_BASE_ID + 50n, stakeUsdt: 0.3, payoutUsdt: 0.57 },
      { id: MOCK_BET_BASE_ID + 51n, stakeUsdt: 0.42, payoutUsdt: 0.71 },
    ],
  },
  {
    id: MOCK_VAULT_BASE_ID + 6n,
    address: mockAddress("vault", 7),
    tipster: mockAddress("tipster", 7),
    tipsterHandle: "fresh_start",
    name: "Rising Tipster Fund",
    symbol: "NEW",
    freeBalanceUsdt: 0.85,
    totalAssetsUsdt: 0.85,
    shareSupplyUsdt: 0.82,
    openBets: 0,
    pendingClaimableUsdt: 0,
    settledWins: 0,
    settledLosses: 0,
    totalStakedUsdt: 0,
    totalPayoutUsdt: 0,
    createdAtDaysAgo: 3,
    subscriberCount: 1,
    winningBets: [],
  },
  {
    id: MOCK_VAULT_BASE_ID + 7n,
    address: mockAddress("vault", 8),
    tipster: mockAddress("tipster", 8),
    tipsterHandle: "high_vol",
    name: "Turbo Variance",
    symbol: "TUR",
    freeBalanceUsdt: 0.55,
    totalAssetsUsdt: 2.15,
    shareSupplyUsdt: 2.05,
    openBets: 1,
    pendingClaimableUsdt: 0.18,
    settledWins: 4,
    settledLosses: 4,
    totalStakedUsdt: 7.1,
    totalPayoutUsdt: 7.45,
    createdAtDaysAgo: 74,
    subscriberCount: 2,
    winningBets: [
      { id: MOCK_BET_BASE_ID + 60n, stakeUsdt: 0.38, payoutUsdt: 0.87 },
      { id: MOCK_BET_BASE_ID + 61n, stakeUsdt: 0.28, payoutUsdt: 0.62 },
    ],
  },
]

export function mockVaultValues(seed: MockVaultSeed, nowSec: bigint) {
  const createdAt = nowSec - BigInt(seed.createdAtDaysAgo * 86_400)

  return {
    id: seed.id,
    address: seed.address,
    tipster: seed.tipster,
    tipsterHandle: seed.tipsterHandle,
    name: seed.name,
    symbol: seed.symbol,
    freeBalance: usdt(seed.freeBalanceUsdt),
    totalAssets: usdt(seed.totalAssetsUsdt),
    shareSupply: usdt(seed.shareSupplyUsdt),
    openBets: seed.openBets,
    pendingClaimable: usdt(seed.pendingClaimableUsdt),
    settledWins: seed.settledWins,
    settledLosses: seed.settledLosses,
    totalStaked: usdt(seed.totalStakedUsdt),
    totalPayout: usdt(seed.totalPayoutUsdt),
    createdAt,
    updatedAt: nowSec,
    isMocked: true,
  }
}

export function mockPositionValues(
  seed: MockVaultSeed,
  investor: `0x${string}`,
  sharesUsdt: number,
  nowSec: bigint
) {
  return {
    id: `${seed.address}-${investor}`.toLowerCase(),
    vaultId: seed.id,
    vaultAddress: seed.address,
    investor,
    shares: usdt(sharesUsdt),
    updatedAt: nowSec,
  }
}

export function mockBetValues(
  seed: MockVaultSeed,
  bet: MockBet,
  openedAt: bigint,
  closedAt: bigint
) {
  return {
    id: bet.id,
    vaultId: seed.id,
    vaultAddress: seed.address,
    tipster: seed.tipster,
    azuroTokenId: bet.id,
    core: "0x0000000000000000000000000000000000000001" as `0x${string}`,
    conditionId: bet.id,
    outcomeId: 1n,
    stake: usdt(bet.stakeUsdt),
    payout: usdt(bet.payoutUsdt),
    lifecycle: 4,
    openedAt,
    closedAt,
  }
}

export function mockTipsterNameValues(seed: MockVaultSeed, nowSec: bigint) {
  return {
    address: seed.tipster,
    name: seed.tipsterHandle,
    nameKey: seed.tipsterHandle.toLowerCase(),
    pubKeyX: "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
    pubKeyY: "0x0000000000000000000000000000000000000000000000000000000000000002" as `0x${string}`,
    registeredAt: nowSec - BigInt(seed.createdAtDaysAgo * 86_400),
  }
}

export function mockInvestorsForVault(subscriberCount: number) {
  return Array.from({ length: subscriberCount }, (_, index) => mockInvestor(index + 1))
}
