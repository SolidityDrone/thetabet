import { VaultBetHistory } from '@/components/vaults/vault-bet-history'
import { VaultDetailHeader } from '@/components/vaults/vault-detail-header'
import { VaultPositionPanel } from '@/components/vaults/vault-position-panel'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { BET_TOKEN_DECIMALS } from '@/config/theta'
import { useAppMode } from '@/context/app-mode'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useScreenTopPadding } from '@/hooks/use-screen-top-padding'
import { useVaultBets } from '@/hooks/use-vault-bets'
import { useVaultDetail } from '@/hooks/use-vault-detail'
import { useVaultPosition } from '@/hooks/use-vault-position'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import { ChevronLeft } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatUnits } from 'viem'

export default function VaultDetailScreen() {
  const topPadding = useScreenTopPadding()
  const insets = useSafeAreaInsets()
  const router = useDebouncedNavigation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { hasSkippedWallet } = useAppMode()
  const { address } = useWalletPortfolio()
  const { vault, isLoading, isRefreshing, error, refresh } = useVaultDetail(id)
  const betHistory = useVaultBets(vault?.id)
  const position = useVaultPosition(vault?.address, address)
  const [positionExpanded, setPositionExpanded] = useState(false)

  const handleRefresh = useCallback(() => {
    void refresh()
    void betHistory.refresh()
    void position.refresh()
  }, [betHistory, position, refresh])

  const handleComplete = useCallback(() => {
    handleRefresh()
  }, [handleRefresh])

  const positionSharesLabel =
    position.shares > 0n
      ? `${formatUnits(position.shares, BET_TOKEN_DECIMALS)} ${vault?.symbol ?? 'shares'}`
      : null

  return (
    <View style={[styles.screen, { paddingTop: topPadding }]}>
      <ScreenBackdrop />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vault</Text>
        <View style={styles.backButtonSpacer} />
      </View>

      {isLoading && !vault ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: positionExpanded ? 280 : 24 },
            ]}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
            keyboardShouldPersistTaps="handled"
          >
            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {vault ? (
              <>
                <VaultDetailHeader
                  vault={vault}
                  positionUsdt={position.positionUsdtNumber}
                  positionSharesLabel={positionSharesLabel}
                />
                <VaultBetHistory
                  bets={betHistory.bets}
                  totalCount={betHistory.totalCount}
                  hasMore={betHistory.hasMore}
                  isLoading={betHistory.isLoading}
                  isLoadingMore={betHistory.isLoadingMore}
                  error={betHistory.error}
                  onLoadMore={betHistory.loadMore}
                />
              </>
            ) : null}
          </ScrollView>

          {vault ? (
            <View style={[styles.positionWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <VaultPositionPanel
                vault={vault}
                investorAddress={address}
                hasSkippedWallet={hasSkippedWallet}
                hasPosition={position.hasPosition}
                positionUsdtNumber={position.positionUsdtNumber}
                maxWithdrawNumber={position.maxWithdrawNumber}
                onComplete={handleComplete}
                expanded={positionExpanded}
                onExpandedChange={setPositionExpanded}
              />
            </View>
          ) : null}
        </>
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
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  positionWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 12,
  },
})
