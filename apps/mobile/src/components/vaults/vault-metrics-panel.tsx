import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { formatAverageOdds, formatBetToken } from '@/config/theta'
import { formatTipsterHandle, vaultStatsSummary } from '@/hooks/use-profile-vaults'
import type { DiscoveryVault } from '@/types/vault-discovery'
import { StyleSheet, Text, View } from 'react-native'

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

export function VaultMetricsPanel({ vault }: { vault: DiscoveryVault }) {
  const stats = vaultStatsSummary(vault)
  const createdAt = Number(vault.createdAt)
  const createdLabel = Number.isFinite(createdAt)
    ? new Date(createdAt * 1000).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{vault.name}</Text>
      <Text style={styles.meta}>
        {formatTipsterHandle(vault.tipsterHandle, vault.tipster)} · {vault.symbol}
      </Text>

      <View style={styles.statsGrid}>
        <StatRow label="Created" value={createdLabel} />
        <StatRow label="Subscribers" value={stats.subscribers} />
        <StatRow label="Total liquidity" value={`${stats.liquidity} BET`} />
        <StatRow label="Free liquidity" value={`${stats.freeLiquidity} BET`} />
        <StatRow label="Pending wins" value={`${stats.pendingWins} BET`} />
        <StatRow label="Open bets" value={String(stats.openBets)} />
        <StatRow label="Win rate" value={stats.winRate} />
        <StatRow label="ROI (all time)" value={stats.roi} />
        <StatRow label="Avg win odds" value={formatAverageOdds(vault.averageWinOdds)} />
        <StatRow label="Record" value={stats.record} />
        <StatRow label="Total staked" value={`${formatBetToken(vault.totalStaked)} BET`} />
        <StatRow label="Total payout" value={`${formatBetToken(vault.totalPayout)} BET`} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    padding: 14,
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statsGrid: {
    gap: 8,
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
    paddingBottom: 8,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
})
