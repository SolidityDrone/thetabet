import { BrandHeader } from '@/components/ui/brand-header'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { TIPSTER_NAME_PATTERN, TIPSTER_NAME_NO_EDGE_UNDERSCORE } from '@/config/theta'
import { shortenAddress } from '@/config/chains'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import { formatTipsterHandle, useProfileVaults, vaultStatsSummary } from '@/hooks/use-profile-vaults'
import { createTipsterVault, registerTipsterName } from '@/services/theta-vault'
import { isThetaDeployed, THETA_SINGLETON_ADDRESS } from '@/config/theta'
import { RefreshCw, TrendingUp } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

function VaultStatsCard({ title, vault }: { title: string; vault: NonNullable<ReturnType<typeof useProfileVaults>['tipsterVault']> }) {
  const stats = vaultStatsSummary(vault)
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.vaultName}>{vault.name}</Text>
      <Text style={styles.vaultMeta}>
        {formatTipsterHandle(vault.tipsterHandle, vault.tipster)} · {vault.symbol}
      </Text>
      <View style={styles.statsGrid}>
        <StatRow label="Subscribers" value={stats.subscribers} />
        <StatRow label="Total liquidity" value={`${stats.liquidity} BET`} />
        <StatRow label="Free liquidity" value={`${stats.freeLiquidity} BET`} />
        <StatRow label="Pending wins" value={`${stats.pendingWins} BET`} />
        <StatRow label="Open bets" value={String(stats.openBets)} />
        <StatRow label="Win rate" value={stats.winRate} />
        <StatRow label="ROI (all time)" value={stats.roi} />
        <StatRow label="Record" value={stats.record} />
      </View>
    </View>
  )
}

export function ProfileScreen() {
  const { address, shortAddress, hasSkippedWallet } = useWalletPortfolio()
  const { positions, tipsterVault, tipsterHandle, onChainHasVault, vaultFromIndexer, isTipster, isLoading, isIndexerLoading, error, refresh } =
    useProfileVaults(address)
  const [vaultName, setVaultName] = useState('')
  const [vaultSymbol, setVaultSymbol] = useState('')
  const [handle, setHandle] = useState('')
  const [isSettingUp, setIsSettingUp] = useState(false)

  const hasHandle = Boolean(tipsterHandle || tipsterVault?.tipsterHandle)
  const needsVault = !tipsterVault && !onChainHasVault
  const needsSetup = !isTipster

  const onSetupTipster = useCallback(async () => {
    if (!address || hasSkippedWallet) {
      Alert.alert(
        'Wallet required',
        hasSkippedWallet
          ? 'Connect a real wallet to set up your tipster profile on Polygon.'
          : 'Your Polygon address is not ready yet.'
      )
      return
    }
    if (!isThetaDeployed()) {
      Alert.alert('Contracts not deployed', `Deploy singleton first. Current: ${THETA_SINGLETON_ADDRESS}`)
      return
    }

    const normalized = handle.trim().toLowerCase()
    if (!hasHandle) {
      if (!TIPSTER_NAME_PATTERN.test(normalized) || !TIPSTER_NAME_NO_EDGE_UNDERSCORE.test(normalized)) {
        Alert.alert('Invalid handle', 'Use 3–20 lowercase letters, numbers, or underscores (not at the ends).')
        return
      }
    }
    if (needsVault && (!vaultName.trim() || !vaultSymbol.trim())) {
      Alert.alert('Missing fields', 'Enter a vault name and symbol to create your tipster vault.')
      return
    }

    setIsSettingUp(true)
    try {
      if (!hasHandle) {
        await registerTipsterName(address as `0x${string}`, normalized)
      }
      if (needsVault) {
        await createTipsterVault(address as `0x${string}`, vaultName, vaultSymbol)
      }
      Alert.alert('Profile updated', 'Transactions submitted. Pull to refresh after indexing.')
      setHandle('')
      setVaultName('')
      setVaultSymbol('')
      setTimeout(() => refresh(), 5000)
    } catch (setupError) {
      Alert.alert(
        'Setup failed',
        setupError instanceof Error ? setupError.message : String(setupError)
      )
    } finally {
      setIsSettingUp(false)
    }
  }, [address, handle, hasHandle, hasSkippedWallet, needsVault, refresh, tipsterVault, vaultName, vaultSymbol])

  return (
    <View style={styles.container}>
      <ScreenBackdrop />
      <BrandHeader
        title="Profile"
        subtitle={shortAddress || 'No wallet'}
        compact
        right={
          <Pressable onPress={refresh} style={styles.refreshButton} accessibilityLabel="Refresh profile">
            <RefreshCw color={colors.primary} size={18} />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isIndexerLoading}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
      >
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Indexer unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.hint}>
            USB Android uses `http://127.0.0.1:42069` via adb reverse (not the tunnel URL).
            Run `npm run dev:stack:tunnel`, then `adb reverse tcp:42069 tcp:42069`, reload.
            Rebuild once if needed: `npx expo run:android`.
          </Text>
        </View>
      ) : null}

      {!isThetaDeployed() ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Contracts not linked</Text>
          <Text style={styles.hint}>
            Deploy on Polygon with `pnpm contracts:deploy` — constants sync automatically.
          </Text>
        </View>
      ) : null}

      {isLoading && !tipsterVault && !onChainHasVault ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : null}

      {isIndexerLoading && tipsterVault && !vaultFromIndexer ? (
        <Text style={styles.indexerHint}>Syncing vault stats from indexer…</Text>
      ) : null}

      {needsSetup ? (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <TrendingUp color={colors.primary} size={18} />
            <Text style={styles.cardTitle}>Set up tipster profile</Text>
          </View>
          <Text style={styles.hint}>
            Register your @handle and create your vault on Polygon. One vault per wallet.
          </Text>
          {!hasHandle ? (
            <>
              <Text style={styles.fieldLabel}>@handle</Text>
              <TextInput
                style={styles.input}
                placeholder="pitch_king"
                placeholderTextColor={colors.textTertiary}
                value={handle}
                onChangeText={setHandle}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
            </>
          ) : (
            <View style={styles.handleBadge}>
              <Text style={styles.handleText}>
                {formatTipsterHandle(tipsterHandle ?? tipsterVault?.tipsterHandle, address)}
              </Text>
            </View>
          )}
          {!needsVault ? null : (
            <>
              <Text style={styles.fieldLabel}>Vault name</Text>
              <TextInput
                style={styles.input}
                placeholder="Pitch King Vault"
                placeholderTextColor={colors.textTertiary}
                value={vaultName}
                onChangeText={setVaultName}
                autoCapitalize="words"
              />
              <Text style={styles.fieldLabel}>Vault symbol</Text>
              <TextInput
                style={styles.input}
                placeholder="PKING"
                placeholderTextColor={colors.textTertiary}
                value={vaultSymbol}
                onChangeText={setVaultSymbol}
                autoCapitalize="characters"
                maxLength={8}
              />
            </>
          )}
          {hasHandle && needsVault ? (
            <Text style={styles.hint}>
              Your @handle is already on-chain{tipsterHandle ? ` (@${tipsterHandle})` : ''}. Creating the vault deploys a
              new contract and needs POL for gas on mainnet.
            </Text>
          ) : null}
          <Pressable
            style={[styles.primaryButton, isSettingUp && styles.buttonDisabled]}
            onPress={onSetupTipster}
            disabled={isSettingUp}
          >
            {isSettingUp ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {!tipsterVault && !hasHandle
                  ? 'Register & create vault'
                  : !hasHandle
                    ? 'Register @handle'
                    : 'Create vault'}
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.handleBadge}>
            <Text style={styles.handleText}>
              {formatTipsterHandle(tipsterHandle ?? tipsterVault?.tipsterHandle, address)}
            </Text>
          </View>
          {tipsterVault ? <VaultStatsCard title="Your tipster vault" vault={tipsterVault} /> : null}
          {tipsterVault && !vaultFromIndexer ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Indexer catching up</Text>
              <Text style={styles.hint}>
                Showing on-chain vault balances. Bet history and ROI appear after Ponder indexes your vault —
                pull to refresh once `dev:stack` is running.
              </Text>
            </View>
          ) : null}
        </>
      )}

      <Text style={styles.sectionTitle}>Vaults you invested in</Text>
      {positions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No vault positions yet.</Text>
          <Text style={styles.hint}>Deposit into a tipster vault to see it here.</Text>
        </View>
      ) : (
        positions.map((position) => {
          const vault = position.vault
          if (!vault) return null
          const stats = vaultStatsSummary(vault)
          return (
            <View key={position.id} style={styles.card}>
              <Text style={styles.vaultName}>{vault.name}</Text>
              <Text style={styles.vaultMeta}>
                {formatTipsterHandle(vault.tipsterHandle, vault.tipster)} · {vault.symbol}
              </Text>
              <View style={styles.statsGrid}>
                <StatRow label="Your shares" value={position.shares} />
                <StatRow label="Vault liquidity" value={`${stats.liquidity} BET`} />
                <StatRow label="Pending wins" value={`${stats.pendingWins} BET`} />
                <StatRow label="Tipster ROI" value={stats.roi} />
                <StatRow label="Win rate" value={stats.winRate} />
              </View>
            </View>
          )
        })
      )}

      {isTipster ? null : (
        <Text style={styles.footerHint}>
          Already a tipster on another device? Pull to refresh after your vault is indexed.
        </Text>
      )}
    </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  vaultName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  vaultMeta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  statsGrid: {
    marginTop: 4,
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  statValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: theme.radius.sharp,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  footerHint: {
    color: colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  emptyText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  errorCard: {
    backgroundColor: colors.dangerBackground,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  errorTitle: {
    color: colors.error,
    fontWeight: '600',
  },
  errorText: {
    color: colors.text,
    fontSize: 13,
  },
  warningCard: {
    backgroundColor: colors.warningBackground,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  warningTitle: {
    color: colors.warning,
    fontWeight: '600',
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  loader: {
    marginVertical: 24,
  },
  indexerHint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  handleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tintedBackground,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  handleText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
})
