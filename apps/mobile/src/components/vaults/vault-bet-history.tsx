import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { formatBetToken } from '@/config/theta'
import {
  formatVaultBetOdds,
  formatVaultBetPnl,
  vaultBetStatusLabel,
} from '@/services/ponder/vault-bets'
import type { VaultBetRecord } from '@/types/vault-bet'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  bets: VaultBetRecord[]
  totalCount: number
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  onLoadMore: () => void
}

function statusPalette(lifecycle: number) {
  switch (lifecycle) {
    case 0:
      return {
        badge: colors.textSecondary,
        border: colors.border,
        background: colors.cardDark,
      }
    case 1:
    case 4:
      return {
        badge: colors.success,
        border: 'rgba(124, 255, 79, 0.35)',
        background: 'rgba(124, 255, 79, 0.08)',
      }
    case 2:
      return {
        badge: colors.danger,
        border: colors.dangerBorder,
        background: colors.dangerBackground,
      }
    default:
      return {
        badge: colors.warning,
        border: colors.border,
        background: colors.cardDark,
      }
  }
}

function formatBetDate(openedAt: string, closedAt: string | null) {
  const timestamp = Number(closedAt || openedAt)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—'
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function BetRow({ bet }: { bet: VaultBetRecord }) {
  const palette = statusPalette(bet.lifecycle)
  const pnl = formatVaultBetPnl(bet)
  const odds = formatVaultBetOdds(bet)

  return (
    <View style={[styles.betRow, { borderColor: palette.border, backgroundColor: palette.background }]}>
      <View style={styles.betTop}>
        <Text style={[styles.statusBadge, { color: palette.badge }]}>
          {vaultBetStatusLabel(bet.lifecycle)}
        </Text>
        <Text style={styles.betDate}>{formatBetDate(bet.openedAt, bet.closedAt)}</Text>
      </View>

      <Text style={styles.betMarket} numberOfLines={1}>
        Outcome #{bet.outcomeId}
      </Text>

      <View style={styles.betMeta}>
        <Text style={styles.betStake}>
          Stake {formatBetToken(bet.stake)} USDT
          {odds ? ` · ${Number(odds).toFixed(2)}x` : ''}
        </Text>
        <Text
          style={[
            styles.betPnl,
            pnl.tone === 'win' && styles.betPnlWin,
            pnl.tone === 'loss' && styles.betPnlLoss,
          ]}
        >
          {pnl.value}
        </Text>
      </View>
    </View>
  )
}

export function VaultBetHistory({
  bets,
  totalCount,
  hasMore,
  isLoading,
  isLoadingMore,
  error,
  onLoadMore,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bet history</Text>
        <Text style={styles.count}>{totalCount} plays</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : bets.length === 0 ? (
        <Text style={styles.emptyText}>No bets placed from this vault yet.</Text>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent
            const nearBottom =
              layoutMeasurement.height + contentOffset.y >= contentSize.height - 48
            if (nearBottom) onLoadMore()
          }}
          scrollEventThrottle={200}
        >
          {bets.map((bet) => (
            <BetRow key={bet.id} bet={bet} />
          ))}

          {isLoadingMore ? (
            <View style={styles.loadMoreRow}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : hasMore ? (
            <TouchableOpacity style={styles.loadMoreButton} onPress={onLoadMore}>
              <Text style={styles.loadMoreText}>Load more</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  count: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
  },
  list: {
    maxHeight: 320,
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  centered: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  betRow: {
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  betTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  betDate: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '600',
  },
  betMarket: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  betMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  betStake: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  betPnl: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  betPnlWin: {
    color: colors.success,
  },
  betPnlLoss: {
    color: colors.danger,
  },
  loadMoreRow: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  loadMoreText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
})
