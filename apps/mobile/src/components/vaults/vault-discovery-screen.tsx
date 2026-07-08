import { VaultCard } from '@/components/vaults/vault-card'
import { VaultSortBar } from '@/components/vaults/vault-sort-bar'
import { BrandHeader } from '@/components/ui/brand-header'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useTabBarHeight } from '@/hooks/use-tab-bar-height'
import { useVaultDiscovery } from '@/hooks/use-vault-discovery'
import { Landmark, RefreshCw, Search, TrendingUp, X } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

function betTokenToNumber(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return n / 1e6
}

function sumLiquidity(vaults: { totalAssets: string }[]): number {
  return vaults.reduce((acc, v) => acc + betTokenToNumber(v.totalAssets), 0)
}

function formatLiquidity(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

export function VaultDiscoveryScreen() {
  const tabBarHeight = useTabBarHeight()
  const router = useDebouncedNavigation()
  const { vaults, totalCount, sortKey, setSortKey, isLoading, isRefreshing, error, refresh } =
    useVaultDiscovery()
  const [query, setQuery] = useState('')

  const totalLiquidity = useMemo(() => sumLiquidity(vaults), [vaults])

  const filtered = useMemo(() => {
    if (!query) return vaults
    const q = query.toLowerCase()
    return vaults.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.symbol.toLowerCase().includes(q) ||
        v.tipsterHandle.toLowerCase().includes(q) ||
        v.tipster.toLowerCase().includes(q),
    )
  }, [vaults, query])

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />
      <BrandHeader
        title="Vaults"
        subtitle="Discover tipster vaults on Polygon"
        compact
        right={
          <Pressable onPress={refresh} style={styles.refreshButton} accessibilityLabel="Refresh vaults">
            <RefreshCw color={colors.primary} size={18} />
          </Pressable>
        }
      />

      <View style={styles.statStrip}>
        <View style={styles.stat}>
          <Landmark size={13} color={colors.textTertiary} />
          <Text style={styles.statValue}>{totalCount}</Text>
          <Text style={styles.statLabel}>vaults</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <TrendingUp size={13} color={colors.textTertiary} />
          <Text style={styles.statValue}>{formatLiquidity(totalLiquidity)}</Text>
          <Text style={styles.statLabel}>BET TVL</Text>
        </View>
      </View>

      <VaultSortBar sortKey={sortKey} onChange={setSortKey} />

      <View style={styles.searchRow}>
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tipster or vault"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <X size={16} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {isLoading && vaults.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading vaults…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: tabBarHeight + theme.spacing.lg },
          ]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <Text style={styles.countText}>
              {filtered.length > 0
                ? query
                  ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`
                  : `${totalCount} vault${totalCount === 1 ? '' : 's'} indexed`
                : ''}
            </Text>
          }
          ListEmptyComponent={
            error ? (
              <View style={styles.emptyCard}>
                <Landmark size={28} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>Indexer unavailable</Text>
                <Text style={styles.emptyText}>{error}</Text>
              </View>
            ) : query ? (
              <View style={styles.emptyCard}>
                <Search size={28} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>No matches</Text>
                <Text style={styles.emptyText}>No vaults match "{query}".</Text>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Landmark size={28} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>No vaults yet</Text>
                <Text style={styles.emptyText}>
                  Tipster vaults appear here once created and indexed by Ponder. Create one from Profile.
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <VaultCard
              vault={item}
              rank={index + 1}
              onPress={() => router.push(`/vault/${item.id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: theme.spacing.lg,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    padding: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    gap: 0,
  },
  countText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  separator: {
    height: 10,
  },
  emptyCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 22,
    gap: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
})
