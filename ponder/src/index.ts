import { eq } from "ponder";
import { ponder } from "ponder:registry";

import {
  depositEvent,
  investorPosition,
  tipsterName,
  vault,
  vaultBet,
  withdrawEvent,
} from "ponder:schema";

import { seedMockVaults } from "./seed-mock-vaults";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function eventId(event: { transaction: { hash: string }; log: { logIndex: number } }) {
  return `${event.transaction.hash}-${event.log.logIndex}`;
}

async function findVaultIdByAddress(
  context: { db: { sql: { select: Function } } },
  vaultAddress: `0x${string}`
) {
  const rows = await context.db.sql
    .select({ id: vault.id })
    .from(vault)
    .where(eq(vault.address, vaultAddress))
    .limit(1);
  return rows[0]?.id;
}

async function adjustShares(
  context: {
    db: {
      insert: Function;
      sql: { select: Function };
    };
  },
  params: {
    vaultId: bigint;
    vaultAddress: `0x${string}`;
    investor: `0x${string}`;
    delta: bigint;
    timestamp: bigint;
  }
) {
  const positionId = `${params.vaultAddress}-${params.investor}`.toLowerCase();
  const existing = await context.db.sql
    .select({ shares: investorPosition.shares })
    .from(investorPosition)
    .where(eq(investorPosition.id, positionId))
    .limit(1);

  const nextShares = (existing[0]?.shares ?? 0n) + params.delta;
  if (nextShares < 0n) {
    return;
  }

  if (nextShares === 0n) {
    await context.db.sql.delete(investorPosition).where(eq(investorPosition.id, positionId));
    return;
  }

  await context.db
    .insert(investorPosition)
    .values({
      id: positionId,
      vaultId: params.vaultId,
      vaultAddress: params.vaultAddress,
      investor: params.investor,
      shares: nextShares,
      updatedAt: params.timestamp,
    })
    .onConflictDoUpdate({
      shares: nextShares,
      updatedAt: params.timestamp,
    });
}

ponder.on("ThetaSingleton:VaultCreated", async ({ event, context }) => {
  const timestamp = BigInt(event.block.timestamp);
  await context.db.insert(vault).values({
    id: event.args.vaultId,
    address: event.args.vault,
    tipster: event.args.tipster,
    name: event.args.name,
    symbol: event.args.symbol,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

ponder.on("ThetaSingleton:TipsterNameRegistered", async ({ event, context }) => {
  const timestamp = BigInt(event.block.timestamp);
  const nameKey = event.args.name.toLowerCase();

  await context.db
    .insert(tipsterName)
    .values({
      address: event.args.tipster,
      name: event.args.name,
      nameKey,
      pubKeyX: event.args.pubKeyX,
      pubKeyY: event.args.pubKeyY,
      registeredAt: timestamp,
    })
    .onConflictDoUpdate({
      name: event.args.name,
      nameKey,
      pubKeyX: event.args.pubKeyX,
      pubKeyY: event.args.pubKeyY,
      registeredAt: timestamp,
    });

  await context.db.sql
    .update(vault)
    .set({
      tipsterHandle: event.args.name,
      updatedAt: timestamp,
    })
    .where(eq(vault.tipster, event.args.tipster));
});

ponder.on("ThetaSingleton:VaultMetrics", async ({ event, context }) => {
  const timestamp = BigInt(event.block.timestamp);
  await context.db.sql
    .update(vault)
    .set({
      freeBalance: event.args.freeBalance,
      totalAssets: event.args.totalAssets,
      shareSupply: event.args.shareSupply,
      openBets: Number(event.args.openBets),
      pendingClaimable: event.args.pendingClaimable,
      settledWins: Number(event.args.settledWins),
      settledLosses: Number(event.args.settledLosses),
      updatedAt: timestamp,
    })
    .where(eq(vault.id, event.args.vaultId));
});

ponder.on("ThetaSingleton:setup", async ({ context }) => {
  await seedMockVaults(context);
});

ponder.on("ThetaSingleton:VaultDeposit", async ({ event, context }) => {
  const timestamp = BigInt(event.block.timestamp);
  await context.db.insert(depositEvent).values({
    id: eventId(event),
    vaultId: event.args.vaultId,
    vaultAddress: event.args.vault,
    investor: event.args.investor,
    assets: event.args.assets,
    sharesMinted: event.args.sharesMinted,
    timestamp,
  });
});

ponder.on("ThetaSingleton:VaultWithdraw", async ({ event, context }) => {
  const timestamp = BigInt(event.block.timestamp);
  await context.db.insert(withdrawEvent).values({
    id: eventId(event),
    vaultId: event.args.vaultId,
    vaultAddress: event.args.vault,
    investor: event.args.investor,
    sharesBurned: event.args.sharesBurned,
    assetsOut: event.args.assetsOut,
    timestamp,
  });
});

ponder.on("ThetaSingleton:VaultBetOpened", async ({ event, context }) => {
  const timestamp = BigInt(event.block.timestamp);
  const stake = BigInt(event.args.stake);

  await context.db.insert(vaultBet).values({
    id: event.args.betId,
    vaultId: event.args.vaultId,
    vaultAddress: event.args.vault,
    tipster: event.args.tipster,
    azuroTokenId: event.args.azuroTokenId,
    core: event.args.core,
    conditionId: event.args.conditionId,
    outcomeId: BigInt(event.args.outcomeId),
    stake,
    lifecycle: 0,
    openedAt: timestamp,
  });

  const rows = await context.db.sql
    .select({ totalStaked: vault.totalStaked })
    .from(vault)
    .where(eq(vault.id, event.args.vaultId))
    .limit(1);

  await context.db.sql
    .update(vault)
    .set({
      totalStaked: (rows[0]?.totalStaked ?? 0n) + stake,
      updatedAt: timestamp,
    })
    .where(eq(vault.id, event.args.vaultId));
});

ponder.on("ThetaSingleton:VaultBetClosed", async ({ event, context }) => {
  const timestamp = BigInt(event.block.timestamp);
  const lifecycle = Number(event.args.lifecycle);
  const payout = BigInt(event.args.payout);

  await context.db.sql
    .update(vaultBet)
    .set({
      payout,
      lifecycle,
      closedAt: timestamp,
    })
    .where(eq(vaultBet.id, event.args.betId));

  if (lifecycle === 4 && payout > 0n) {
    const rows = await context.db.sql
      .select({ totalPayout: vault.totalPayout })
      .from(vault)
      .where(eq(vault.id, event.args.vaultId))
      .limit(1);

    await context.db.sql
      .update(vault)
      .set({
        totalPayout: (rows[0]?.totalPayout ?? 0n) + payout,
        updatedAt: timestamp,
      })
      .where(eq(vault.id, event.args.vaultId));
  }
});

ponder.on("TipsterVault:Transfer", async ({ event, context }) => {
  const vaultAddress = event.log.address;
  const vaultId = await findVaultIdByAddress(context, vaultAddress);
  if (vaultId === undefined) {
    return;
  }

  const timestamp = BigInt(event.block.timestamp);
  const { from, to, value } = event.args;

  if (from !== ZERO_ADDRESS) {
    await adjustShares(context, {
      vaultId,
      vaultAddress,
      investor: from,
      delta: -value,
      timestamp,
    });
  }

  if (to !== ZERO_ADDRESS) {
    await adjustShares(context, {
      vaultId,
      vaultAddress,
      investor: to,
      delta: value,
      timestamp,
    });
  }
});
