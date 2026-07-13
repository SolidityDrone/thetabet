import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { formatAverageOdds } from '@/config/theta'
import { formatTipsterHandle, vaultStatsSummary } from '@/hooks/use-profile-vaults'
import { formatVaultLabel } from '@/services/ponder/vault-display'
import type { DiscoveryVault } from '@/types/vault-discovery'
import * as Clipboard from 'expo-clipboard'
import { Copy } from 'lucide-react-native'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { toast } from 'sonner-native'

function MetricChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metricChip}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
    </View>
  )
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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

async function copyToClipboard(value: string, label: string) {
  await Clipboard.setStringAsync(value)
  toast.success(`${label} copied`)
}

type Props = {
  vault: DiscoveryVault
  positionUsdt?: number
  positionSharesLabel?: string | null
}

export function VaultDetailHeader({ vault, positionUsdt, positionSharesLabel }: Props) {
  const stats = vaultStatsSummary(vault)
  const tipsterLabel = formatTipsterHandle(vault.tipsterHandle, vault.tipster)
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
      <View style={styles.ownerBlock}>
        <Text style={styles.ownerLabel}>Tipster</Text>
        <Text style={styles.ownerHandle}>{tipsterLabel}</Text>
        <Text style={styles.vaultMeta}>
          Vault <Text style={styles.vaultMetaStrong}>{formatVaultLabel(vault.name, vault.isMocked)}</Text> · token{' '}
          <Text style={styles.vaultMetaStrong}>{vault.symbol}</Text>
        </Text>
        <View style={styles.copyRow}>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={() => void copyToClipboard(vault.tipster, 'Wallet address')}
            activeOpacity={0.8}
          >
            <Copy color={colors.textSecondary} size={13} />
            <Text style={styles.copyButtonText}>Copy wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={() => void copyToClipboard(vault.address, 'Vault contract')}
            activeOpacity={0.8}
          >
            <Copy color={colors.textSecondary} size={13} />
            <Text style={styles.copyButtonText}>Copy contract</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <MetricChip label="ROI" value={formatPercent(vault.roiPercent)} accent />
        <MetricChip label="Win rate" value={formatWinRate(vault.winRatePercent)} />
        <MetricChip label="Avg odds" value={formatAverageOdds(vault.averageWinOdds)} />
        <MetricChip
          label="Subs"
          value={vault.subscriberCount === null ? '—' : String(vault.subscriberCount)}
        />
      </View>

      <View style={styles.detailsGrid}>
        <DetailCell label="TVL" value={`${stats.liquidity} USDT`} />
        <DetailCell label="Free liq." value={`${stats.freeLiquidity} USDT`} />
        <DetailCell label="Open bets" value={String(stats.openBets)} />
        <DetailCell label="Record" value={stats.record} />
        <DetailCell label="Pending wins" value={`${stats.pendingWins} USDT`} />
        <DetailCell label="Created" value={createdLabel} />
      </View>

      {positionUsdt !== undefined && positionUsdt > 0 ? (
        <View style={styles.positionBanner}>
          <Text style={styles.positionLabel}>Your position</Text>
          <Text style={styles.positionValue}>
            {positionUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
            {positionSharesLabel ? ` · ${positionSharesLabel}` : ''}
          </Text>
        </View>
      ) : null}
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
    gap: 12,
  },
  ownerBlock: {
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    padding: 10,
    gap: 6,
  },
  ownerLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  ownerHandle: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '900',
  },
  vaultMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  vaultMetaStrong: {
    color: colors.text,
    fontWeight: '800',
  },
  copyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  copyButtonText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricChip: {
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
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailCell: {
    width: '47%',
    flexGrow: 1,
    gap: 2,
  },
  detailLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positionBanner: {
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.neonMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  positionLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  positionValue: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
})
