import { VaultCard } from '@/components/vaults/vault-card'
import { VaultSortBar } from '@/components/vaults/vault-sort-bar'
import { BrandHeader } from '@/components/ui/brand-header'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useTabBarHeight } from '@/hooks/use-tab-bar-height'
import { useVaultDiscovery } from '@/hooks/use-vault-discovery'
import { RefreshCw } from 'lucide-react-native'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export function VaultDiscoveryScreen() {
  const tabBarHeight = useTabBarHeight()
  const router = useDebouncedNavigation()
  const { vaults, totalCount, sortKey, setSortKey, isLoading, isRefreshing, error, refresh } =
    useVaultDiscovery()

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

      <VaultSortBar sortKey={sortKey} onChange={setSortKey} />

      {isLoading && vaults.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading vaults…</Text>
        </View>
      ) : (
        <FlatList
          data={vaults}
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
              {totalCount > 0 ? `${totalCount} vault${totalCount === 1 ? '' : 's'} indexed` : 'No vaults indexed yet'}
            </Text>
          }
          ListEmptyComponent={
            error ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Indexer unavailable</Text>
                <Text style={styles.emptyText}>{error}</Text>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No vaults yet</Text>
                <Text style={styles.emptyText}>
                  Tipster vaults appear here after they are created and indexed by Ponder.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <VaultCard
              vault={item}
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
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderColor: colors.borderNeon,
    backgroundColor: colors.card,
    padding: 14,
    gap: 6,
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
  },
})
