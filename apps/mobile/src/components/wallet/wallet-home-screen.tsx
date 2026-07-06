import { WalletActionRow } from '@/components/wallet/wallet-action-row'
import { WalletAssetRow } from '@/components/wallet/wallet-asset-row'
import { colors } from '@/constants/colors'
import { useAppMode } from '@/context/app-mode'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { Settings } from 'lucide-react-native'
import { useCallback } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export function WalletHomeScreen() {
  const insets = useSafeAreaInsets()
  const router = useDebouncedNavigation()
  const { useRealWallet } = useAppMode()
  const {
    chain,
    address,
    shortAddress,
    walletLabel,
    hasSkippedWallet,
    canSend,
    assets,
    totalMatic,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useWalletPortfolio()

  const handleReceive = useCallback(() => {
    if (!address) return
    router.push({
      pathname: '/receive/details',
      params: {
        tokenName: chain.nativeSymbol,
        networkName: chain.name,
        address,
      },
    })
  }, [address, chain.name, chain.nativeSymbol, router])

  const handleSend = useCallback(() => {
    if (hasSkippedWallet) {
      Alert.alert(
        'Send requires a real wallet',
        'Dev skip wallet is read-only on Amoy. Set up a WDK wallet to send tokens.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Set up wallet',
            onPress: () => useRealWallet().then(() => router.replace('/onboarding')),
          },
        ]
      )
      return
    }
    if (!canSend) {
      router.replace('/authorize')
      return
    }
    router.push('/send/select-token')
  }, [canSend, hasSkippedWallet, router, useRealWallet])

  const handleSettings = useCallback(() => {
    if (hasSkippedWallet) {
      Alert.alert(
        'Dev wallet',
        'Using stub address on Polygon Amoy. Set up a real wallet for signing and sending.',
        [
          { text: 'OK' },
          {
            text: 'Set up wallet',
            onPress: () => useRealWallet().then(() => router.replace('/onboarding')),
          },
        ]
      )
      return
    }
    router.push('/settings')
  }, [hasSkippedWallet, router, useRealWallet])

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={chain.icon} style={styles.chainIcon} resizeMode="contain" />
          <View>
            <Text style={styles.walletName}>{walletLabel}</Text>
            <Text style={styles.address}>{shortAddress || 'No address'}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={handleSettings}>
          <Settings size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.chainPillRow}>
        <View style={styles.chainPill}>
          <Text style={styles.chainPillText}>{chain.name}</Text>
        </View>
        {hasSkippedWallet ? (
          <View style={[styles.chainPill, styles.devPill]}>
            <Text style={styles.devPillText}>Testnet · Dev</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.balanceCard}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={styles.balanceLabel}>Total balance</Text>
              <Text style={styles.balanceValue}>
                {totalMatic.toLocaleString(undefined, { maximumFractionDigits: 4 })} MATIC
              </Text>
              <Text style={styles.balanceHint}>Polygon Amoy testnet</Text>
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
          {assets.every((item) => item.balanceNumber === 0) ? (
            <Text style={styles.emptyHint}>
              Fund this address from a Polygon Amoy faucet to see balances update.
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
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 120,
    justifyContent: 'center',
  },
  balanceLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  balanceValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
  },
  balanceHint: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 8,
  },
  section: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
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
