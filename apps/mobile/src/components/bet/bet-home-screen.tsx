import { EventCard } from '@/components/bet/event-card'
import { CompetitionBadge } from '@/components/bet/competition-badge'
import { CompetitionSidebar } from '@/components/bet/competition-sidebar'
import { BrandHeader } from '@/components/ui/brand-header'
import { MatchCardSkeleton } from '@/components/ui/skeleton'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { AZURO_WORLD_CUP_LEAGUE_SLUG } from '@/config/azuro'
import { useAzuroFootballFeed } from '@/hooks/use-azuro-football-feed'
import { sortFootballSections } from '@/services/azuro/feed'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useTabBarHeight } from '@/hooks/use-tab-bar-height'
import type { AzuroFootballSection } from '@/types/azuro'
import type { GameData } from '@azuro-org/toolkit'
import { History, ListFilter } from 'lucide-react-native'
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

const INITIAL_VISIBLE_GAMES = 50
const LOAD_MORE_GAMES = 50

type ListItem =
  | { key: string; type: 'error' }
  | { key: string; type: 'section-title'; title: string }
  | { key: string; type: 'league-header'; section: AzuroFootballSection }
  | { key: string; type: 'game'; game: GameData; compact?: boolean; large?: boolean }
  | { key: string; type: 'empty' }
  | { key: string; type: 'market-alert' }
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

  return sortFootballSections(Array.from(byLeague.values()))
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
  const tabBarHeight = useTabBarHeight()
  const router = useDebouncedNavigation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedLeagueSlug, setSelectedLeagueSlug] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_GAMES)

  const {
    liveGames,
    upcomingGames,
    sections,
    leagues,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    refresh,
    marketSnapshot,
  } = useAzuroFootballFeed(selectedLeagueSlug)

  const worldCupGames = useMemo(() => {
    if (selectedLeagueSlug) return []

    const seen = new Set<string>()
    const games: GameData[] = []

    for (const game of [...liveGames, ...upcomingGames]) {
      if (game.league?.slug !== AZURO_WORLD_CUP_LEAGUE_SLUG) continue
      if (seen.has(game.id)) continue
      seen.add(game.id)
      games.push(game)
    }

    return games.sort((left, right) => Number(left.startsAt) - Number(right.startsAt))
  }, [liveGames, selectedLeagueSlug, upcomingGames])

  const worldCupIds = useMemo(
    () => new Set(worldCupGames.map((game) => game.id)),
    [worldCupGames]
  )

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_GAMES)
  }, [selectedLeagueSlug])

  const selectedLeagueLabel = useMemo(() => {
    if (!selectedLeagueSlug) return 'All football'
    const league = leagues.find((item) => item.slug === selectedLeagueSlug)
    return league ? `${league.name}` : 'Competition'
  }, [leagues, selectedLeagueSlug])

  const flatUpcoming = useMemo(() => {
    if (selectedLeagueSlug) {
      return sections.flatMap((section) => section.games)
    }
    return upcomingGames.filter((game) => !worldCupIds.has(game.id))
  }, [sections, selectedLeagueSlug, upcomingGames, worldCupIds])

  const liveGamesExcludingWorldCup = useMemo(
    () =>
      selectedLeagueSlug
        ? liveGames
        : liveGames.filter((game) => !worldCupIds.has(game.id)),
    [liveGames, selectedLeagueSlug, worldCupIds]
  )

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

    if (
      marketSnapshot &&
      marketSnapshot.footballBettable === 0 &&
      marketSnapshot.previewFootballListed > 0
    ) {
      items.push({ key: 'market-alert', type: 'market-alert' })
    }

    if (worldCupGames.length > 0) {
      const worldCupSection: AzuroFootballSection = {
        league: {
          slug: AZURO_WORLD_CUP_LEAGUE_SLUG,
          name: worldCupGames[0]?.league?.name ?? 'World Cup',
          countrySlug: worldCupGames[0]?.country?.slug ?? '',
          countryName: worldCupGames[0]?.country?.name ?? '',
          isTopLeague: true,
        },
        games: worldCupGames,
      }
      items.push({
        key: 'league-world-cup',
        type: 'league-header',
        section: worldCupSection,
      })
      for (const game of worldCupGames) {
        items.push({ key: `wc-${game.id}`, type: 'game', game, compact: true })
      }
    }

    if (liveGamesExcludingWorldCup.length > 0) {
      items.push({ key: 'live-title', type: 'section-title', title: 'Live now' })
      for (const game of liveGamesExcludingWorldCup) {
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

    if (
      !error &&
      worldCupGames.length === 0 &&
      visibleSections.length === 0 &&
      liveGamesExcludingWorldCup.length === 0
    ) {
      items.push({ key: 'empty', type: 'empty' })
    }

    if (hasMore || isLoadingMore) {
      items.push({ key: 'loading-more', type: 'loading-more' })
    }

    return items
  }, [
    error,
    hasMore,
    isLoadingMore,
    liveGamesExcludingWorldCup,
    marketSnapshot,
    visibleSections,
    worldCupGames,
  ])

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
        case 'market-alert':
          return (
            <View style={styles.alertCard}>
              <Text style={styles.alertTitle}>No football bets on Polygon right now</Text>
              <Text style={styles.alertText}>
                Azuro lists {marketSnapshot?.previewFootballListed ?? 0} football matches as preview odds,
                but 0 are deployed on-chain on Polygon mainnet. Bets will revert until Azuro opens
                markets.
                {marketSnapshot && Object.keys(marketSnapshot.otherBettableBySport).length > 0
                  ? ` Other sports open now: ${Object.entries(marketSnapshot.otherBettableBySport)
                      .map(([sport, count]) => `${sport} (${count})`)
                      .join(', ')}.`
                  : ''}
              </Text>
            </View>
          )
        case 'empty':
          return (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No bettable football markets on Polygon</Text>
              <Text style={styles.emptyText}>
                Azuro has no on-chain football markets open right now. Check back later or try
                another competition from the sidebar.
              </Text>
            </View>
          )
        case 'loading-more':
          return (
            <View style={styles.loadMoreRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadMoreText}>
                {isLoadingMore
                  ? 'Loading more matches…'
                  : `Loading more events (${visibleCount} of ${totalUpcoming})`}
              </Text>
            </View>
          )
        default:
          return null
      }
    },
    [error, isLoadingMore, marketSnapshot, openEvent, refresh, totalUpcoming, visibleCount]
  )

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />
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

      {isLoading ? (
        <View style={styles.skeletonList}>
          <MatchCardSkeleton compact />
          <MatchCardSkeleton compact />
          <MatchCardSkeleton compact />
          <MatchCardSkeleton compact />
          <MatchCardSkeleton compact />
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
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: 14,
    gap: 8,
  },
  alertCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.card,
    padding: 14,
    gap: 6,
  },
  alertTitle: {
    color: colors.gold,
    fontSize: 15,
    fontWeight: '800',
  },
  alertText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonList: {
    paddingHorizontal: theme.spacing.lg,
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
    borderColor: colors.gold,
    backgroundColor: colors.card,
    padding: 14,
    gap: 4,
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
