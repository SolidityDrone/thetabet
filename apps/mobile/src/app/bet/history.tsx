import { colors } from '@/constants/colors'
import { azuroBetToken } from '@/config/azuro'
import { useBetHistory } from '@/hooks/use-bet-history'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import { formatUnits } from 'viem'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function BetHistoryScreen() {
  const insets = useSafeAreaInsets()
  const router = useDebouncedNavigation()
  const { address } = useWalletPortfolio()
  const { localBets, remoteBets, isLoading, isRefreshing, error, refresh } = useBetHistory(
    (address as `0x${string}`) || ''
  )

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
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

          <Text style={styles.sectionTitle}>Open & recent orders</Text>
          {remoteBets.length === 0 ? (
            <Text style={styles.emptyText}>No Azuro relayer orders for this wallet yet.</Text>
          ) : (
            remoteBets.map((bet) => (
              <View key={bet.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{bet.gameTitle}</Text>
                  <Text style={styles.status}>{bet.status}</Text>
                </View>
                <Text style={styles.meta}>
                  {bet.outcomeTitle} · odds {bet.rawOdds}
                </Text>
                <Text style={styles.meta}>
                  Stake {bet.amount} {azuroBetToken.symbol} · {bet.state}
                </Text>
                {bet.errorMessage ? (
                  <Text style={styles.errorMeta}>{bet.errorMessage}</Text>
                ) : null}
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Submitted from this app</Text>
          {localBets.length === 0 ? (
            <Text style={styles.emptyText}>No locally tracked bets yet.</Text>
          ) : (
            localBets.map((bet) => (
              <View key={bet.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{bet.selection.gameTitle}</Text>
                  <Text style={styles.status}>{bet.state}</Text>
                </View>
                <Text style={styles.meta}>
                  {bet.selection.conditionTitle} · {bet.selection.outcomeTitle}
                </Text>
                <Text style={styles.meta}>
                  Stake {formatUnits(BigInt(bet.amount), azuroBetToken.decimals)}{' '}
                  {azuroBetToken.symbol}
                </Text>
                {bet.errorMessage ? (
                  <Text style={styles.errorMeta}>{bet.errorMessage}</Text>
                ) : null}
              </View>
            ))
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
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  status: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  errorMeta: {
    color: colors.danger,
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
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
