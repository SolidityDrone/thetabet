import { index, onchainTable, relations } from "ponder";

export const vault = onchainTable(
  "vault",
  (t) => ({
    id: t.bigint().primaryKey(),
    address: t.hex().notNull(),
    tipster: t.hex().notNull(),
    tipsterHandle: t.text().notNull().default(""),
    name: t.text().notNull(),
    symbol: t.text().notNull(),
    freeBalance: t.bigint().notNull().default(0n),
    totalAssets: t.bigint().notNull().default(0n),
    shareSupply: t.bigint().notNull().default(0n),
    openBets: t.integer().notNull().default(0),
    pendingClaimable: t.bigint().notNull().default(0n),
    settledWins: t.integer().notNull().default(0),
    settledLosses: t.integer().notNull().default(0),
    totalStaked: t.bigint().notNull().default(0n),
    totalPayout: t.bigint().notNull().default(0n),
    createdAt: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    tipsterIdx: index().on(table.tipster),
    addressIdx: index().on(table.address),
    totalAssetsIdx: index().on(table.totalAssets),
  })
);

export const investorPosition = onchainTable(
  "investor_position",
  (t) => ({
    id: t.text().primaryKey(),
    vaultId: t.bigint().notNull(),
    vaultAddress: t.hex().notNull(),
    investor: t.hex().notNull(),
    shares: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    investorIdx: index().on(table.investor),
    vaultIdx: index().on(table.vaultId),
  })
);

export const vaultBet = onchainTable(
  "vault_bet",
  (t) => ({
    id: t.bigint().primaryKey(),
    vaultId: t.bigint().notNull(),
    vaultAddress: t.hex().notNull(),
    tipster: t.hex().notNull(),
    azuroTokenId: t.bigint().notNull(),
    core: t.hex().notNull(),
    conditionId: t.bigint().notNull(),
    outcomeId: t.bigint().notNull(),
    stake: t.bigint().notNull(),
    payout: t.bigint().notNull().default(0n),
    lifecycle: t.integer().notNull(),
    openedAt: t.bigint().notNull(),
    closedAt: t.bigint(),
  }),
  (table) => ({
    vaultIdx: index().on(table.vaultId),
    lifecycleIdx: index().on(table.lifecycle),
    tipsterIdx: index().on(table.tipster),
  })
);

export const tipsterName = onchainTable(
  "tipster_name",
  (t) => ({
    address: t.hex().primaryKey(),
    name: t.text().notNull(),
    nameKey: t.text().notNull(),
    pubKeyX: t.hex().notNull(),
    pubKeyY: t.hex().notNull(),
    registeredAt: t.bigint().notNull(),
  }),
  (table) => ({
    nameKeyIdx: index().on(table.nameKey),
  })
);

export const depositEvent = onchainTable(
  "deposit_event",
  (t) => ({
    id: t.text().primaryKey(),
    vaultId: t.bigint().notNull(),
    vaultAddress: t.hex().notNull(),
    investor: t.hex().notNull(),
    assets: t.bigint().notNull(),
    sharesMinted: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    investorIdx: index().on(table.investor),
    vaultIdx: index().on(table.vaultId),
  })
);

export const withdrawEvent = onchainTable(
  "withdraw_event",
  (t) => ({
    id: t.text().primaryKey(),
    vaultId: t.bigint().notNull(),
    vaultAddress: t.hex().notNull(),
    investor: t.hex().notNull(),
    sharesBurned: t.bigint().notNull(),
    assetsOut: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    investorIdx: index().on(table.investor),
    vaultIdx: index().on(table.vaultId),
  })
);

export const vaultRelations = relations(vault, ({ many }) => ({
  positions: many(investorPosition),
  bets: many(vaultBet),
}));

export const investorPositionRelations = relations(investorPosition, ({ one }) => ({
  vault: one(vault, { fields: [investorPosition.vaultId], references: [vault.id] }),
}));

export const vaultBetRelations = relations(vaultBet, ({ one }) => ({
  vault: one(vault, { fields: [vaultBet.vaultId], references: [vault.id] }),
}));
