import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import type { LiveMatchStats } from '@/services/sports-media/live-match'
import { formatLiveMatchScore, formatLiveMinuteLabel } from '@/services/sports-media/live-match'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

type Props = {
  stats: LiveMatchStats | null
  isLoading?: boolean
  homeName?: string
  awayName?: string
  compact?: boolean
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statChipLabel}>{label}</Text>
      <Text style={styles.statChipValue}>{value}</Text>
    </View>
  )
}

export function LiveMatchStatsPanel({
  stats,
  isLoading = false,
  homeName,
  awayName,
  compact = false,
}: Props) {
  const scoreText = formatLiveMatchScore(stats)
  const minuteLabel = formatLiveMinuteLabel(stats)

  if (!stats && isLoading) {
    return (
      <View style={[styles.card, compact && styles.cardCompact]}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={styles.loadingText}>Loading live stats…</Text>
      </View>
    )
  }

  if (!stats) return null

  const cards = stats.cards
  const hasCards =
    cards &&
    cards.homeYellow + cards.awayYellow + cards.homeRed + cards.awayRed > 0
  const hasCorners = Boolean(stats.corners)

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <Text style={styles.liveTag}>LIVE</Text>
        <Text style={styles.minuteText}>{minuteLabel}</Text>
        {stats.statusLabel && stats.statusLabel !== minuteLabel ? (
          <Text style={styles.statusText}>{stats.statusLabel}</Text>
        ) : null}
      </View>

      {scoreText ? (
        <View style={styles.scoreRow}>
          <Text style={styles.teamSide} numberOfLines={1}>
            {homeName ?? 'Home'}
          </Text>
          <Text style={styles.scoreText}>{scoreText}</Text>
          <Text style={[styles.teamSide, styles.teamSideAway]} numberOfLines={1}>
            {awayName ?? 'Away'}
          </Text>
        </View>
      ) : (
        <Text style={styles.scorePending}>Score updating…</Text>
      )}

      {hasCards || hasCorners ? (
        <View style={styles.statsRow}>
          {hasCards ? (
            <StatChip
              label="Cards"
              value={`${cards!.homeYellow}-${cards!.awayYellow} Y · ${cards!.homeRed}-${cards!.awayRed} R`}
            />
          ) : null}
          {hasCorners ? (
            <StatChip
              label="Corners"
              value={`${stats.corners!.home} - ${stats.corners!.away}`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: 12,
    gap: 10,
  },
  cardCompact: {
    padding: 10,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveTag: {
    color: colors.live,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  minuteText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamSide: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  teamSideAway: {
    textAlign: 'left',
  },
  scoreText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    minWidth: 72,
    textAlign: 'center',
  },
  scorePending: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statChip: {
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.cardDark,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  statChipLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statChipValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
})
