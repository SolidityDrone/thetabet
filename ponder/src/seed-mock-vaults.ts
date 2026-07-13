import {
  investorPosition,
  tipsterName,
  vault,
  vaultBet,
} from "ponder:schema";

import {
  MOCK_VAULTS,
  mockBetValues,
  mockInvestorsForVault,
  mockPositionValues,
  mockTipsterNameValues,
  mockVaultValues,
} from "./mock-vaults";

type SeedContext = {
  db: {
    insert: Function;
  };
};

export async function seedMockVaults(context: SeedContext) {
  if (process.env.PONDER_MOCK_VAULTS === "0") {
    return;
  }

  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  for (const seed of MOCK_VAULTS) {
    const values = mockVaultValues(seed, nowSec);

    await context.db
      .insert(vault)
      .values(values)
      .onConflictDoUpdate({
        address: values.address,
        tipster: values.tipster,
        tipsterHandle: values.tipsterHandle,
        name: values.name,
        symbol: values.symbol,
        freeBalance: values.freeBalance,
        totalAssets: values.totalAssets,
        shareSupply: values.shareSupply,
        openBets: values.openBets,
        pendingClaimable: values.pendingClaimable,
        settledWins: values.settledWins,
        settledLosses: values.settledLosses,
        totalStaked: values.totalStaked,
        totalPayout: values.totalPayout,
        isMocked: true,
        createdAt: values.createdAt,
        updatedAt: values.updatedAt,
      });

    await context.db
      .insert(tipsterName)
      .values(mockTipsterNameValues(seed, nowSec))
      .onConflictDoUpdate({
        name: seed.tipsterHandle,
        nameKey: seed.tipsterHandle.toLowerCase(),
        pubKeyX:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        pubKeyY:
          "0x0000000000000000000000000000000000000000000000000000000000000002",
        registeredAt: nowSec - BigInt(seed.createdAtDaysAgo * 86_400),
      });

    const investors = mockInvestorsForVault(seed.subscriberCount);
    for (const [index, investor] of investors.entries()) {
      const sharesUsdt = Math.max(0.15, Math.round((seed.totalAssetsUsdt / (index + 3)) * 100) / 100);
      const position = mockPositionValues(seed, investor, sharesUsdt, nowSec);

      await context.db
        .insert(investorPosition)
        .values(position)
        .onConflictDoUpdate({
          vaultId: position.vaultId,
          vaultAddress: position.vaultAddress,
          investor: position.investor,
          shares: position.shares,
          updatedAt: position.updatedAt,
        });
    }

    for (const [index, bet] of seed.winningBets.entries()) {
      const closedAt = nowSec - BigInt((index + 1) * 86_400);
      const openedAt = closedAt - 7_200n;
      const betValues = mockBetValues(seed, bet, openedAt, closedAt);

      await context.db
        .insert(vaultBet)
        .values(betValues)
        .onConflictDoUpdate({
          vaultId: betValues.vaultId,
          vaultAddress: betValues.vaultAddress,
          tipster: betValues.tipster,
          azuroTokenId: betValues.azuroTokenId,
          core: betValues.core,
          conditionId: betValues.conditionId,
          outcomeId: betValues.outcomeId,
          stake: betValues.stake,
          payout: betValues.payout,
          lifecycle: betValues.lifecycle,
          openedAt: betValues.openedAt,
          closedAt: betValues.closedAt,
        });
    }
  }
}
