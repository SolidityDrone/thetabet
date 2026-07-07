import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { formatAverageOdds, formatBetToken } from '@/config/theta'
import { formatTipsterHandle } from '@/hooks/use-profile-vaults'
import type { DiscoveryVault } from '@/types/vault-discovery'
import { ChevronRight } from 'lucide-react-native'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  vault: DiscoveryVault
  onPress?: () => void
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
    </View>
  )
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function formatWinRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

export function VaultCard({ vault, onPress }: Props) {
  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.tipster} numberOfLines={1}>
            {formatTipsterHandle(vault.tipsterHandle, vault.tipster)}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {vault.name}
            <Text style={styles.symbol}> · {vault.symbol}</Text>
          </Text>
        </View>
        {onPress ? <ChevronRight color={colors.textTertiary} size={18} /> : null}
      </View>

      <View style={styles.metricsRow}>
        <Metric label="ROI" value={formatPercent(vault.roiPercent)} accent />
        <Metric label="Win rate" value={formatWinRate(vault.winRatePercent)} />
        <Metric label="Avg odds" value={formatAverageOdds(vault.averageWinOdds)} />
        <Metric
          label="Subs"
          value={vault.subscriberCount === null ? '—' : String(vault.subscriberCount)}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {formatBetToken(vault.totalAssets)} BET liquidity · {vault.settledWins}W /{' '}
          {vault.settledLosses}L
        </Text>
      </View>
    </>
  )

  if (!onPress) {
    return <View style={styles.card}>{content}</View>
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {content}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  tipster: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  symbol: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metric: {
    minWidth: '22%',
    flexGrow: 1,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.cardDark,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  metricLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  metricValueAccent: {
    color: colors.primary,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
    paddingTop: 8,
  },
  footerText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
  },
})
