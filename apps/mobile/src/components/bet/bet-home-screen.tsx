import { EventCard } from '@/components/bet/event-card'
import { CompetitionBadge } from '@/components/bet/competition-badge'
import { CompetitionSidebar } from '@/components/bet/competition-sidebar'
import { BrandHeader } from '@/components/ui/brand-header'
import { PitchBackdrop } from '@/components/ui/pitch-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useAzuroFootballFeed } from '@/hooks/use-azuro-football-feed'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useTabBarHeight } from '@/hooks/use-tab-bar-height'
import type { AzuroFootballSection } from '@/types/azuro'
import type { GameData } from '@azuro-org/toolkit'
import { History, ListFilter, ShieldCheck } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const INITIAL_VISIBLE_GAMES = 50
const LOAD_MORE_GAMES = 50

type ListItem =
  | { key: string; type: 'error' }
  | { key: string; type: 'top'; game: GameData }
  | { key: string; type: 'section-title'; title: string }
  | { key: string; type: 'league-header'; section: AzuroFootballSection }
  | { key: string; type: 'game'; game: GameData; compact?: boolean; large?: boolean }
  | { key: string; type: 'empty' }
  | { key: string; type: 'loading-more' }

function groupGamesByLeague(games: GameData[]): AzuroFootballSection[] {
  const byLeague = new Map<string, AzuroFootballSection>()

  for (const game of games) {
    const slug = game.league?.slug ?? 'other'
    const existing = byLeague.get(slug)
    if (existing) {
      existing.games.push(game)
      continue
    }
    byLeague.set(slug, {
      league: {
        slug,
        name: game.league?.name ?? 'Other',
        countrySlug: game.country?.slug ?? '',
        countryName: game.country?.name ?? '',
        isTopLeague: game.league?.isTopLeague ?? false,
      },
      games: [game],
    })
  }

  return Array.from(byLeague.values())
}

function buildVisibleSections(
  visibleGames: GameData[],
  selectedLeagueSlug: string | null,
  sections: AzuroFootballSection[]
): AzuroFootballSection[] {
  if (visibleGames.length === 0) return []

  const visibleIds = new Set(visibleGames.map((game) => game.id))

  if (selectedLeagueSlug) {
    return sections
      .map((section) => ({
        ...section,
        games: section.games.filter((game) => visibleIds.has(game.id)),
      }))
      .filter((section) => section.games.length > 0)
  }

  return groupGamesByLeague(visibleGames)
}

export function BetHomeScreen() {
  const insets = useSafeAreaInsets()
  const tabBarHeight = useTabBarHeight()
  const router = useDebouncedNavigation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedLeagueSlug, setSelectedLeagueSlug] = useState<string | null>(null)
  const [bettableOnly, setBettableOnly] = useState(true)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_GAMES)

  const {
    topEvent,
    liveGames,
    upcomingGames,
    sections,
    leagues,
    isLoading,
    isRefreshing,
    error,
    refresh,
  } = useAzuroFootballFeed(selectedLeagueSlug, bettableOnly)

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_GAMES)
  }, [selectedLeagueSlug, bettableOnly])

  const bettableCount = liveGames.length + upcomingGames.length + (topEvent ? 1 : 0)

  const selectedLeagueLabel = useMemo(() => {
    if (!selectedLeagueSlug) return 'All football'
    const league = leagues.find((item) => item.slug === selectedLeagueSlug)
    return league ? `${league.name}` : 'Competition'
  }, [leagues, selectedLeagueSlug])

  const flatUpcoming = useMemo(() => {
    if (selectedLeagueSlug) {
      return sections.flatMap((section) => section.games)
    }
    if (!topEvent) return upcomingGames
    return upcomingGames.filter((game) => game.id !== topEvent.id)
  }, [sections, selectedLeagueSlug, topEvent, upcomingGames])

  const totalUpcoming = flatUpcoming.length
  const hasMore = visibleCount < totalUpcoming

  const visibleUpcoming = useMemo(
    () => flatUpcoming.slice(0, visibleCount),
    [flatUpcoming, visibleCount]
  )

  const visibleSections = useMemo(
    () => buildVisibleSections(visibleUpcoming, selectedLeagueSlug, sections),
    [visibleUpcoming, selectedLeagueSlug, sections]
  )

  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = []

    if (error) {
      items.push({ key: 'error', type: 'error' })
    }

    if (topEvent) {
      items.push({ key: `top-${topEvent.id}`, type: 'top', game: topEvent })
    }

    if (liveGames.length > 0) {
      items.push({ key: 'live-title', type: 'section-title', title: 'Live now' })
      for (const game of liveGames) {
        items.push({ key: `live-${game.id}`, type: 'game', game, compact: true })
      }
    }

    for (const section of visibleSections) {
      items.push({
        key: `league-${section.league.slug}`,
        type: 'league-header',
        section,
      })
      for (const game of section.games) {
        items.push({ key: `game-${game.id}`, type: 'game', game, compact: true })
      }
    }

    if (!error && !topEvent && visibleSections.length === 0 && liveGames.length === 0) {
      items.push({ key: 'empty', type: 'empty' })
    }

    if (hasMore) {
      items.push({ key: 'loading-more', type: 'loading-more' })
    }

    return items
  }, [error, hasMore, liveGames, topEvent, visibleSections])

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isRefreshing) return
    setVisibleCount((current) => Math.min(current + LOAD_MORE_GAMES, totalUpcoming))
  }, [hasMore, isLoading, isRefreshing, totalUpcoming])

  const openEvent = useCallback(
    (gameId: string) => {
      router.push({
        pathname: '/bet/event/[id]',
        params: { id: gameId },
      })
    },
    [router]
  )

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      switch (item.type) {
        case 'error':
          return (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Could not load Azuro feed</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={refresh}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )
        case 'top':
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top event</Text>
              <EventCard game={item.game} onPress={() => openEvent(item.game.id)} />
            </View>
          )
        case 'section-title':
          return <Text style={styles.sectionTitle}>{item.title}</Text>
        case 'league-header':
          return (
            <CompetitionBadge
              leagueName={item.section.league.name}
              countryName={item.section.league.countryName}
              countrySlug={item.section.league.countrySlug}
            />
          )
        case 'game':
          return (
            <EventCard
              game={item.game}
              compact={item.compact}
              large={item.large}
              onPress={() => openEvent(item.game.id)}
            />
          )
        case 'empty':
          return (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {bettableOnly ? 'No bettable markets on Polygon' : 'No football markets right now'}
              </Text>
              <Text style={styles.emptyText}>
                {bettableOnly
                  ? 'No football markets are deployed on Polygon Azuro right now. Try preview mode or pull to refresh.'
                  : 'Pull to refresh or pick another competition from the sidebar.'}
              </Text>
            </View>
          )
        case 'loading-more':
          return (
            <View style={styles.loadMoreRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadMoreText}>
                Loading more events ({visibleCount} of {totalUpcoming})
              </Text>
            </View>
          )
        default:
          return null
      }
    },
    [bettableOnly, error, openEvent, refresh, totalUpcoming, visibleCount]
  )

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PitchBackdrop />
      <BrandHeader
        title="Matches"
        subtitle="Football · Azuro on Polygon"
        right={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.push('/bet/history')}
            >
              <History color={colors.primary} size={18} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => setSidebarOpen(true)}>
              <ListFilter color={colors.primary} size={18} />
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.filterBar}>
        <Text style={styles.filterLabel}>{selectedLeagueLabel}</Text>
        {selectedLeagueSlug ? (
          <TouchableOpacity onPress={() => setSelectedLeagueSlug(null)}>
            <Text style={styles.clearFilter}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.onChainBar}>
        <TouchableOpacity
          style={[styles.onChainToggle, bettableOnly && styles.onChainToggleActive]}
          onPress={() => setBettableOnly((current) => !current)}
          activeOpacity={0.85}
        >
          <ShieldCheck color={bettableOnly ? colors.background : colors.primary} size={16} />
          <Text style={[styles.onChainToggleText, bettableOnly && styles.onChainToggleTextActive]}>
            Bettable on Polygon
          </Text>
          {bettableOnly && !isLoading ? (
            <Text style={styles.onChainCount}>{bettableCount}</Text>
          ) : null}
        </TouchableOpacity>
        {bettableOnly ? (
          <Text style={styles.onChainHint}>
            Loaded from Polygon on-chain Azuro feed. Preview odds (off) are not bettable.
          </Text>
        ) : (
          <Text style={styles.onChainHint}>
            Showing Azuro preview catalog — most matches cannot be bet on Polygon yet.
          </Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 16 }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      <CompetitionSidebar
        visible={sidebarOpen}
        leagues={leagues}
        selectedLeagueSlug={selectedLeagueSlug}
        onClose={() => setSidebarOpen(false)}
        onSelect={setSelectedLeagueSlug}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterLabel: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  clearFilter: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  onChainBar: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 10,
    gap: 6,
  },
  onChainToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.cardDark,
  },
  onChainToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  onChainToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  onChainToggleTextActive: {
    color: colors.background,
  },
  onChainCount: {
    minWidth: 18,
    textAlign: 'center',
    color: colors.background,
    fontSize: 11,
    fontWeight: '800',
  },
  onChainHint: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  onChainError: {
    color: colors.danger,
    fontSize: 11,
    lineHeight: 15,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
  },
  separator: {
    height: 8,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    ...theme.typography.title,
    fontSize: 15,
    marginBottom: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: 14,
    gap: 8,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: colors.text,
    fontSize: 13,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  retryText: {
    color: colors.primary,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    gap: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  loadMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  loadMoreText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
})
