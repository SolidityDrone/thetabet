import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { formatAverageOdds } from '@/config/theta'
import { formatTipsterHandle } from '@/hooks/use-profile-vaults'
import type { DiscoveryVault } from '@/types/vault-discovery'
import { ChevronRight, Flame, TrendingUp } from 'lucide-react-native'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  vault: DiscoveryVault
  rank?: number
  onPress?: () => void
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function formatWinRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(0)}%`
}

function betTokenToNumber(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return n / 1e6
}

function abbreviateLiquidity(raw: string): string {
  const n = betTokenToNumber(raw)
  if (!Number.isFinite(n) || n === 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function avatarLetter(handle: string, fallback: string): string {
  const base = handle && handle !== 'Unknown' ? handle : fallback
  const match = base?.match(/[a-zA-Z0-9]/)
  return match ? match[0].toUpperCase() : '?'
}

const RANK_COLORS: Record<number, string> = {
  1: colors.gold,
  2: 'rgba(192, 196, 204, 0.9)',
  3: 'rgba(180, 112, 60, 0.95)',
}

function RoiPill({ roi }: { roi: number | null }) {
  if (roi === null || !Number.isFinite(roi)) {
    return <View style={[styles.roiPill, styles.roiPillNeutral]}><Text style={styles.roiPillText}>ROI —</Text></View>
  }
  const positive = roi >= 0
  return (
    <View style={[styles.roiPill, positive ? styles.roiPillUp : styles.roiPillDown]}>
      {positive ? <TrendingUp size={11} color={colors.primary} /> : <TrendingUp size={11} color={colors.danger} style={{ transform: [{ rotate: '180deg' }] }} />}
      <Text style={[styles.roiPillText, positive ? styles.roiPillTextUp : styles.roiPillTextDown]}>
        {formatPercent(roi)}
      </Text>
    </View>
  )
}

export function VaultCard({ vault, rank, onPress }: Props) {
  const handle = formatTipsterHandle(vault.tipsterHandle, vault.tipster).replace(/^@/, '')
  const hasOpenBets = vault.openBets > 0
  const totalSettled = vault.settledWins + vault.settledLosses

  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.rankCol}>
          {rank && rank <= 3 ? (
            <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[rank] }]}>
              <Text style={styles.rankBadgeText}>{rank}</Text>
            </View>
          ) : (
            <Text style={styles.rankText}>{rank ?? ''}</Text>
          )}
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{avatarLetter(handle, vault.name)}</Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.tipster} numberOfLines={1}>
            {formatTipsterHandle(vault.tipsterHandle, vault.tipster)}
          </Text>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{vault.name}</Text>
            <Text style={styles.symbol}> · {vault.symbol}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <RoiPill roi={vault.roiPercent} />
          {onPress ? <ChevronRight color={colors.textTertiary} size={16} /> : null}
        </View>
      </View>

      <View style={styles.metricsRow}>
        <Metric label="Win" value={formatWinRate(vault.winRatePercent)} />
        <Metric label="Odds" value={formatAverageOdds(vault.averageWinOdds)} />
        <Metric label="Subs" value={vault.subscriberCount == null ? '—' : String(vault.subscriberCount)} />
        <Metric label="TVL" value={abbreviateLiquidity(vault.totalAssets)} accent />
      </View>

      <View style={styles.footer}>
        <View style={styles.recordRow}>
          {hasOpenBets ? (
            <View style={styles.openBadge}>
              <Flame size={10} color={colors.warning} />
              <Text style={styles.openBadgeText}>{vault.openBets} open</Text>
            </View>
          ) : null}
          <Text style={styles.footerText}>
            {vault.settledWins}W · {vault.settledLosses}L{totalSettled === 0 ? ' · no settled bets yet' : ''}
          </Text>
        </View>
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

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent && styles.metricValueAccent]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.lg,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankText: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    minWidth: 16,
    textAlign: 'center',
  },
  rankBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '900',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neonMuted,
    borderWidth: 1,
    borderColor: colors.borderNeon,
  },
  avatarLetter: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '900',
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  symbol: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roiPillUp: {
    backgroundColor: colors.neonMuted,
  },
  roiPillDown: {
    backgroundColor: colors.dangerBackground,
  },
  roiPillNeutral: {
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roiPillText: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  roiPillTextUp: { color: colors.primary },
  roiPillTextDown: { color: colors.danger },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metric: {
    flex: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.cardDark,
    paddingHorizontal: 8,
    paddingVertical: 7,
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
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.warningBackground,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  openBadgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '800',
  },
  footerText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
  },
})
