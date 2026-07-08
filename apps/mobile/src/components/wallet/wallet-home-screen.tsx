import { VaultShareRow } from '@/components/wallet/vault-share-row'
import { WalletActionRow } from '@/components/wallet/wallet-action-row'
import { WalletAssetRow } from '@/components/wallet/wallet-asset-row'
import { BrandHeader } from '@/components/ui/brand-header'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useAppMode } from '@/context/app-mode'
import { useConfirmSheet } from '@/context/confirm-sheet'
import { useProfileVaults } from '@/hooks/use-profile-vaults'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { Settings } from 'lucide-react-native'
import { useCallback } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

export function WalletHomeScreen() {
  const router = useDebouncedNavigation()
  const { alert, confirm } = useConfirmSheet()
  const { useRealWallet } = useAppMode()
  const {
    chain,
    address,
    shortAddress,
    hasSkippedWallet,
    canSend,
    assets,
    totalMatic,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useWalletPortfolio()
  const { positions: vaultPositions, refresh: refreshVaults } = useProfileVaults(address ?? '')

  const handleRefresh = useCallback(() => {
    void refresh()
    void refreshVaults()
  }, [refresh, refreshVaults])

  const handleReceive = useCallback(async () => {
    if (!address) {
      await alert({
        title: 'Address not ready',
        message: 'Your Polygon address is still loading. Wait a moment and try again.',
      })
      return
    }
    router.push({
      pathname: '/receive/details',
      params: {
        tokenName: chain.nativeSymbol,
        networkName: chain.name,
        address,
      },
    })
  }, [address, alert, chain.name, chain.nativeSymbol, router])

  const handleSend = useCallback(async () => {
    if (hasSkippedWallet) {
      const setup = await confirm({
        title: 'Send requires a real wallet',
        message: 'Dev skip wallet is read-only. Set up a WDK wallet to send tokens.',
        confirmLabel: 'Set up wallet',
      })
      if (setup) {
        await useRealWallet()
        router.replace('/onboarding')
      }
      return
    }
    if (!canSend) {
      router.replace('/authorize')
      return
    }
    router.push('/send/select-token')
  }, [canSend, confirm, hasSkippedWallet, router, useRealWallet])

  const handleSettings = useCallback(async () => {
    if (hasSkippedWallet) {
      const setup = await confirm({
        title: 'Dev wallet',
        message: 'Using stub address on Polygon. Set up a real wallet for signing and sending.',
        confirmLabel: 'Set up wallet',
        cancelLabel: 'OK',
      })
      if (setup) {
        await useRealWallet()
        router.replace('/onboarding')
      }
      return
    }
    router.push('/settings')
  }, [confirm, hasSkippedWallet, router, useRealWallet])

  return (
    <View style={styles.container}>
      <ScreenBackdrop />
      <BrandHeader
        title="Wallet"
        subtitle={`${chain.name} · ${shortAddress || 'No address'}`}
        compact
        right={
          <TouchableOpacity style={styles.settingsButton} onPress={handleSettings}>
            <Settings size={20} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <View style={styles.chainPillRow}>
        <View style={styles.chainPill}>
          <Text style={styles.chainPillText}>{chain.name}</Text>
        </View>
        {hasSkippedWallet ? (
          <View style={[styles.chainPill, styles.devPill]}>
            <Text style={styles.devPillText}>Dev wallet</Text>
          </View>
        ) : null}
      </View>

      {address ? (
        <Text style={styles.addressLine} selectable>
          {address}
        </Text>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.balanceCard}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <>
              <Text style={styles.balanceLabel}>Total balance</Text>
              <Text style={styles.balanceValue}>
                {totalMatic.toLocaleString(undefined, { maximumFractionDigits: 4 })} {chain.nativeSymbol}
              </Text>
              <Text style={styles.balanceHint}>Polygon mainnet</Text>
            </>
          )}
        </View>

        <WalletActionRow onReceive={handleReceive} onSend={handleSend} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assets</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {assets.map((item) => (
            <WalletAssetRow key={item.asset.id} item={item} />
          ))}
          {vaultPositions.map((position) => (
            <VaultShareRow key={position.id} position={position} />
          ))}
          {assets.every((item) => item.balanceNumber === 0) && vaultPositions.length === 0 ? (
            <Text style={styles.emptyHint}>
              Fund this address with USDT and POL on Polygon to see balances update.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  chainIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  walletName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  address: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 13,
    marginTop: 2,
  },
  settingsButton: {
    padding: 8,
  },
  chainPillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  chainPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chainPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  addressLine: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  devPill: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBackground,
  },
  devPillText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  balanceCard: {
    backgroundColor: colors.card,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 20,
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 108,
    justifyContent: 'center',
  },
  balanceLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  balanceValue: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  balanceHint: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 8,
  },
  section: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionTitle: {
    ...theme.typography.caption,
    color: colors.gold,
    marginBottom: 4,
  },
  emptyHint: {
    color: colors.textTertiary,
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 16,
    textAlign: 'center',
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    marginBottom: 8,
  },
})
