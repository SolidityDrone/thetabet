export type TipsterStreamStats = {
  tokensStreamed: number
  queriesReceived: number
  peersHelped: number
  avgReplySec: number
  uptimeHours: number
}

function seedFromAddress(address: string) {
  return Array.from(address.toLowerCase()).reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
}

/** Placeholder stats until real P2P metering ships. */
export function mockTipsterStreamStats(ownerId: string): TipsterStreamStats {
  const seed = ownerId ? seedFromAddress(ownerId) : 42
  return {
    tokensStreamed: 1400 + (seed % 6200),
    queriesReceived: 6 + (seed % 94),
    peersHelped: 2 + (seed % 28),
    avgReplySec: 11 + (seed % 19),
    uptimeHours: 3 + (seed % 40),
  }
}
