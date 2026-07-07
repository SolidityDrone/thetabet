import { colors } from '@/constants/colors'
import { azuroBetToken } from '@/config/azuro'
import { useBetHistory } from '@/hooks/use-bet-history'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useScreenTopPadding } from '@/hooks/use-screen-top-padding'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import type { BetHistoryDisplayStatus } from '@/services/azuro/bet-history'
import { ChevronLeft } from 'lucide-react-native'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return '0.00'
  return value.toFixed(2)
}

function statusColors(status: BetHistoryDisplayStatus) {
  switch (status) {
    case 'won':
      return {
        badge: colors.success,
        amount: colors.success,
        border: 'rgba(124, 255, 79, 0.35)',
        background: 'rgba(124, 255, 79, 0.08)',
      }
    case 'lost':
      return {
        badge: colors.danger,
        amount: colors.danger,
        border: colors.dangerBorder,
        background: colors.dangerBackground,
      }
    default:
      return {
        badge: colors.textSecondary,
        amount: colors.textSecondary,
        border: colors.border,
        background: colors.card,
      }
  }
}

function formatPnl(bet: {
  status: BetHistoryDisplayStatus
  stake: number
  profit: number
  payout: number | null
}) {
  if (bet.status === 'won') {
    const value = bet.payout ?? bet.stake + bet.profit
    return `+${formatMoney(value - bet.stake)} ${azuroBetToken.symbol}`
  }
  if (bet.status === 'lost') {
    return `-${formatMoney(bet.stake)} ${azuroBetToken.symbol}`
  }
  return `+${formatMoney(bet.profit)} ${azuroBetToken.symbol}`
}

export default function BetHistoryScreen() {
  const topPadding = useScreenTopPadding()
  const router = useDebouncedNavigation()
  const { address } = useWalletPortfolio()
  const { bets, isLoading, isRefreshing, error, refresh } = useBetHistory(
    (address as `0x${string}`) || ''
  )

  return (
    <View style={[styles.screen, { paddingTop: topPadding }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My bets</Text>
        <View style={styles.backButtonSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
        >
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {bets.length === 0 ? (
            <Text style={styles.emptyText}>No accepted bets for this wallet yet.</Text>
          ) : (
            bets.map((bet) => {
              const palette = statusColors(bet.status)
              const pnlLabel =
                bet.status === 'pending' ? 'Potential win' : bet.status === 'won' ? 'Won' : 'Result'

              return (
                <View
                  key={bet.id}
                  style={[
                    styles.card,
                    { borderColor: palette.border, backgroundColor: palette.background },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.titleBlock}>
                      <Text style={styles.league}>{bet.leagueName}</Text>
                      <Text style={styles.cardTitle}>{bet.gameTitle}</Text>
                    </View>
                    <Text style={[styles.status, { color: palette.badge }]}>{bet.statusLabel}</Text>
                  </View>

                  <Text style={styles.pick}>
                    {bet.marketTitle} · {bet.outcomeTitle}
                  </Text>

                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>Stake</Text>
                      <Text style={styles.statValue}>
                        {formatMoney(bet.stake)} {azuroBetToken.symbol}
                      </Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>Odds</Text>
                      <Text style={styles.statValue}>{formatMoney(bet.odds)}</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>{pnlLabel}</Text>
                      <Text style={[styles.statValue, { color: palette.amount }]}>
                        {formatPnl(bet)}
                      </Text>
                    </View>
                  </View>

                  {bet.status === 'pending' ? (
                    <Text style={styles.meta}>
                      Return {formatMoney(bet.potentialReturn)} {azuroBetToken.symbol} if it wins
                    </Text>
                  ) : null}
                </View>
              )
            })
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonSpacer: {
    width: 40,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  league: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  status: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pick: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
})
