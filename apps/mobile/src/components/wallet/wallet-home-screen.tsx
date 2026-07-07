import { WalletActionRow } from '@/components/wallet/wallet-action-row'
import { WalletAssetRow } from '@/components/wallet/wallet-asset-row'
import { BrandHeader } from '@/components/ui/brand-header'
import { PitchBackdrop } from '@/components/ui/pitch-backdrop'
import {
  AZURO_BET_TOKEN_EXPLORER_URL,
  AZURO_BETTING_GUIDE_URL,
} from '@/config/azuro'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useAppMode } from '@/context/app-mode'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useTabBarHeight } from '@/hooks/use-tab-bar-height'
import { Settings, ExternalLink } from 'lucide-react-native'
import { useCallback } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
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
    if (!address) {
      Alert.alert(
        'Address not ready',
        'Your Polygon address is still loading. Wait a moment and try again.'
      )
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
  }, [address, chain.name, chain.nativeSymbol, router])

  const handleSend = useCallback(() => {
    if (hasSkippedWallet) {
      Alert.alert(
        'Send requires a real wallet',
        'Dev skip wallet is read-only. Set up a WDK wallet to send tokens.',
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
        'Using stub address on Polygon. Set up a real wallet for signing and sending.',
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

  const openFaucet = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open link', url)
    })
  }, [])

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PitchBackdrop />
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
            onRefresh={refresh}
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
          <Text style={styles.sectionTitle}>Funding</Text>
          <TouchableOpacity
            style={styles.faucetRow}
            onPress={() => openFaucet(AZURO_BETTING_GUIDE_URL)}
          >
            <View style={styles.faucetTextWrap}>
              <Text style={styles.faucetTitle}>Azuro betting guide</Text>
              <Text style={styles.faucetSubtitle}>How Azuro personal bets work on Polygon</Text>
            </View>
            <ExternalLink size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.faucetRow, styles.faucetRowLast]}
            onPress={() => openFaucet(AZURO_BET_TOKEN_EXPLORER_URL)}
          >
            <View style={styles.faucetTextWrap}>
              <Text style={styles.faucetTitle}>USDT on Polygon</Text>
              <Text style={styles.faucetSubtitle}>Azuro bet token on Polygonscan</Text>
            </View>
            <ExternalLink size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assets</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {assets.map((item) => (
            <WalletAssetRow key={item.asset.id} item={item} />
          ))}
          {assets.every((item) => item.balanceNumber === 0) ? (
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
    borderColor: colors.borderNeon,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
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
  faucetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  faucetRowLast: {
    borderBottomWidth: 0,
  },
  faucetTextWrap: {
    flex: 1,
    gap: 2,
  },
  faucetTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  faucetSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
  },
})
