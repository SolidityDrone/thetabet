import { BetSlipCart } from '@/components/bet/bet-slip-cart'
import { OddsBadge } from '@/components/bet/odds-badge'
import { EventCard } from '@/components/bet/event-card'
import { LiveMatchStatsPanel } from '@/components/bet/live-match-stats'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { azuroBetToken, formatAzuroOdds } from '@/config/azuro'
import { BET_TOKEN_DECIMALS, formatBetToken } from '@/config/theta'
import { useConfirmSheet } from '@/context/confirm-sheet'
import { useAppMode } from '@/context/app-mode'
import { useAzuroEvent } from '@/hooks/use-azuro-event'
import { useLiveMatchStats } from '@/hooks/use-live-match-stats'
import { formatTipsterHandle, useProfileVaults } from '@/hooks/use-profile-vaults'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useScreenTopPadding } from '@/hooks/use-screen-top-padding'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import { quoteAzuroBet, placeAzuroBet, type BetPlacementStage } from '@/services/azuro/bet-placement'
import {
  placeVaultAzuroBet,
  type VaultBetPlacementStage,
} from '@/services/azuro/vault-bet-placement'
import { saveLocalBet } from '@/services/azuro/bet-history'
import { EventPageSkeleton } from '@/components/ui/skeleton'
import { MatchAiSheet } from '@/components/ai/match-ai-sheet'
import { TipsterMatchNotesPanel } from '@/components/tipster/tipster-match-notes-panel'
import { loadQvacSettings, QVAC_MODEL_OPTIONS } from '@/services/qvac/qvac-settings'
import getErrorMessage from '@/utils/get-error-message'
import type { AzuroBetMode, AzuroBetSelection } from '@/types/azuro'
import type { ConditionDetailedData } from '@azuro-org/toolkit'
import { ChevronLeft, Sparkles } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { toast } from 'sonner-native'
import type { Address } from 'viem'
import { formatUnits } from 'viem'

function pickPrimaryMarkets(conditions: ConditionDetailedData[]) {
  const preferred = [
    /^match result$/i,
    /^winner$/i,
    /full time result/i,
    /^1x2$/i,
    /match winner/i,
  ]
  const deprioritize = [/1st half/i, /2nd half/i, /corner/i, /card/i, /asian total/i]

  const sorted = [...conditions].sort((left, right) => {
    const leftScore = preferred.findIndex((re) => re.test(left.title))
    const rightScore = preferred.findIndex((re) => re.test(right.title))
    const leftRank = leftScore >= 0 ? leftScore : 99
    const rightRank = rightScore >= 0 ? rightScore : 99
    if (leftRank !== rightRank) return leftRank - rightRank

    const leftBad = deprioritize.some((re) => re.test(left.title)) ? 1 : 0
    const rightBad = deprioritize.some((re) => re.test(right.title)) ? 1 : 0
    if (leftBad !== rightBad) return leftBad - rightBad

    return left.title.localeCompare(right.title)
  })
  return sorted.slice(0, 12)
}

export default function BetEventScreen() {
  const topPadding = useScreenTopPadding()
  const router = useDebouncedNavigation()
  const { alert } = useConfirmSheet()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { hasSkippedWallet } = useAppMode()
  const { address } = useWalletPortfolio()
  const { tipsterVault, tipsterHandle } = useProfileVaults(address)
  const { game, conditions, isOnChain, marketStatus, isLoading, isLoadingMarkets, isRefreshing, error, refresh, refreshMarketStatus } =
    useAzuroEvent(id)
  const {
    stats: liveStats,
    isLoading: isLoadingLiveStats,
    refresh: refreshLiveStats,
  } = useLiveMatchStats(game)

  const [selected, setSelected] = useState<AzuroBetSelection | null>(null)
  const [betMode, setBetMode] = useState<AzuroBetMode>('personal')
  const [stake, setStake] = useState('1')
  const [isPlacing, setIsPlacing] = useState(false)
  const [quoteText, setQuoteText] = useState<string | null>(null)
  const [aiVisible, setAiVisible] = useState(false)
  const [loadedModel, setLoadedModel] = useState<string | null>(null)

  const vaultTotalUsdt = useMemo(() => {
    if (!tipsterVault?.totalAssets) return 0
    try {
      return Number(formatUnits(BigInt(tipsterVault.totalAssets), BET_TOKEN_DECIMALS))
    } catch {
      return 0
    }
  }, [tipsterVault?.totalAssets])

  const vaultFreeUsdt = useMemo(() => {
    if (!tipsterVault?.freeBalance) return 0
    try {
      return Number(formatUnits(BigInt(tipsterVault.freeBalance), BET_TOKEN_DECIMALS))
    } catch {
      return 0
    }
  }, [tipsterVault?.freeBalance])

  const effectiveStakeUsdt = useMemo(() => {
    const stakeNum = Number(stake)
    if (!Number.isFinite(stakeNum) || stakeNum <= 0) return 0
    if (betMode === 'tipster') {
      return (stakeNum / 100) * vaultTotalUsdt
    }
    return stakeNum
  }, [betMode, stake, vaultTotalUsdt])

  const markets = useMemo(() => pickPrimaryMarkets(conditions), [conditions])
  const canBetAsTipster = Boolean(tipsterVault)
  const tipsterLabel = tipsterVault
    ? formatTipsterHandle(tipsterHandle ?? tipsterVault.tipsterHandle, tipsterVault.tipster)
    : undefined

  const potentialPayout = useMemo(() => {
    if (!selected || effectiveStakeUsdt <= 0) return 0
    return effectiveStakeUsdt * selected.decimalOdds
  }, [effectiveStakeUsdt, selected])

  const placementBlockedReason = useMemo(() => {
    if (isOnChain === false) {
      return 'This market is not on-chain yet — pick another line or pull to refresh.'
    }
    if (marketStatus && !marketStatus.isBettable) {
      return marketStatus.reason ?? 'This selection is not bettable on-chain right now.'
    }
    return null
  }, [isOnChain, marketStatus])

  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshLiveStats()])
  }, [refresh, refreshLiveStats])

  const refreshQuote = useCallback(async () => {
    if (!selected || !address || hasSkippedWallet) {
      setQuoteText(null)
      return
    }
    const stakeNum = Number(stake)
    if (betMode === 'tipster') {
      if (!Number.isFinite(stakeNum) || stakeNum <= 0 || stakeNum > 100) {
        setQuoteText(null)
        return
      }
    } else if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
      setQuoteText(null)
      return
    }
    try {
      const quote = await quoteAzuroBet({
        bettor: address as Address,
        conditionId: selected.conditionId,
        outcomeId: selected.outcomeId,
        amount: String(effectiveStakeUsdt),
      })
      setQuoteText(
        `Min ${quote.limits.minBet ?? 0} · Max ${quote.limits.maxBet} ${azuroBetToken.symbol}`
      )
    } catch {
      setQuoteText(null)
    }
  }, [address, betMode, effectiveStakeUsdt, hasSkippedWallet, selected, stake])

  useEffect(() => {
    if (!selected) return
    void refreshMarketStatus({
      conditionId: selected.conditionId,
      outcomeId: selected.outcomeId,
    })
  }, [selected, refreshMarketStatus])

  useEffect(() => {
    refreshQuote()
  }, [refreshQuote])

  useEffect(() => {
    if (betMode === 'tipster' && !canBetAsTipster) {
      setBetMode('personal')
    }
  }, [betMode, canBetAsTipster])

  useEffect(() => {
    loadQvacSettings().then((settings) => {
      const entry = QVAC_MODEL_OPTIONS.find((m) => m.preset === settings.modelPreset)
      setLoadedModel(entry?.label ?? settings.modelPreset)
    })
  }, [])

  const handleModeChange = useCallback((mode: AzuroBetMode) => {
    setBetMode(mode)
    setStake(mode === 'tipster' ? '5' : '1')
  }, [])

  const handleSelectOutcome = (
    condition: ConditionDetailedData,
    outcome: ConditionDetailedData['outcomes'][number]
  ) => {
    setSelected({
      gameId: game?.id ?? id ?? '',
      gameTitle: game?.title ?? 'Match',
      gameStartsAt: game?.startsAt,
      conditionId: condition.conditionId,
      conditionTitle: condition.title,
      outcomeId: outcome.outcomeId,
      outcomeTitle: outcome.title,
      rawOdds: outcome.odds,
      decimalOdds: formatAzuroOdds(outcome.odds),
    })
  }

  const stageMessages: Record<BetPlacementStage | VaultBetPlacementStage, string> = {
    quoting: 'Checking live odds and stake limits…',
    approving: 'Approving USDT for Azuro relayer…',
    'waiting-approval': 'Waiting for USDT approval on Polygon…',
    signing: 'Sign the bet in your wallet…',
    submitting: 'Submitting bet on Polygon…',
    confirming: 'Waiting for relayer confirmation…',
    'preparing-vault': 'Reserving vault liquidity on ThetaSingleton…',
    'confirming-vault': 'Waiting for vault prepare confirmation…',
    'completing-vault': 'Recording vault bet on-chain…',
    'canceling-vault': 'Restoring vault liquidity after failed bet…',
  }

  const handlePlaceBet = async () => {
    if (!selected) return

    if (!address) {
      await alert({
        title: 'Wallet required',
        message: 'Connect or unlock your wallet to place a bet.',
      })
      return
    }

    if (hasSkippedWallet) {
      await alert({
        title: 'Real wallet required',
        message:
          'The dev skip wallet cannot sign Azuro bets. Set up a WDK wallet with USDT on Polygon.',
      })
      return
    }

    if (betMode === 'tipster') {
      if (!tipsterVault) {
        await alert({
          title: 'Vault required',
          message: 'Set up your tipster vault in Profile before betting as a tipster.',
        })
        return
      }

      if (effectiveStakeUsdt <= 0) {
        await alert({
          title: 'Invalid vault stake',
          message: 'Enter a valid vault stake percentage.',
        })
        return
      }

      setIsPlacing(true)
      let progressToast = toast.loading(stageMessages.quoting)
      const onStage = (stage: BetPlacementStage | VaultBetPlacementStage) => {
        toast.dismiss(progressToast)
        progressToast = toast.loading(stageMessages[stage])
      }

      try {
        const result = await placeVaultAzuroBet({
          tipster: address as Address,
          selection: selected,
          amountUsdt: effectiveStakeUsdt.toFixed(6).replace(/\.?0+$/, ''),
          onStage,
        })
        toast.dismiss(progressToast)
        toast.success('Vault bet placed', {
          description: `${formatBetToken(result.amount)} USDT · ${result.hash.slice(0, 10)}…`,
        })
        setSelected(null)
        router.push(`/vault/${tipsterVault.id}`)
      } catch (placeError) {
        toast.dismiss(progressToast)
        const message = getErrorMessage(placeError, 'Could not place vault bet')
        if (__DEV__) {
          console.error('[Vault bet] failed', placeError)
        }
        toast.error('Vault bet failed', { description: message })
        await alert({ title: 'Vault bet failed', message })
      } finally {
        setIsPlacing(false)
      }
      return
    }

    setIsPlacing(true)
    let progressToast = toast.loading(stageMessages.quoting)
    const onStage = (stage: BetPlacementStage) => {
      toast.dismiss(progressToast)
      progressToast = toast.loading(stageMessages[stage])
    }

    try {
      const record = await placeAzuroBet({
        bettor: address as Address,
        selection: selected,
        amount: stake,
        onStage,
      })
      await saveLocalBet(record)
      toast.dismiss(progressToast)
      toast.success('Bet accepted', {
        description: `Order ${record.id} · ${record.state}`,
      })
      setSelected(null)
      router.push('/bet/history')
    } catch (placeError) {
      toast.dismiss(progressToast)
      const message = getErrorMessage(placeError, 'Could not place bet')
      if (__DEV__) {
        console.error('[Azuro bet] failed', placeError)
      }
      toast.error('Bet failed', { description: message })
      await alert({ title: 'Bet failed', message })
    } finally {
      setIsPlacing(false)
    }
  }

  const cartHeight = selected ? (betMode === 'tipster' ? 380 : 320) : 0

  return (
    <View style={[styles.screen, { paddingTop: topPadding }]}>
      <ScreenBackdrop />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Event</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.aiBadge} onPress={() => setAiVisible(true)} activeOpacity={0.85}>
            {loadedModel ? (
              <Text style={styles.aiBadgeLabel}>{loadedModel}</Text>
            ) : null}
            <View style={styles.aiWandCircle}>
              <Sparkles size={14} color={colors.onPrimary} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && !game ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 }]}>
          <EventPageSkeleton />
        </ScrollView>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: cartHeight + 24 }]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {game ? <EventCard game={game} large liveStats={liveStats} /> : null}

            {canBetAsTipster && address ? (
              <TipsterMatchNotesPanel
                ownerId={address}
                gameId={game?.id ?? id ?? ''}
                matchTitle={game?.title ?? 'Match'}
                league={game?.league?.name ?? null}
              />
            ) : null}

            {isOnChain === false ? (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>No open markets</Text>
                <Text style={styles.previewText}>
                  This match has no active bettable lines right now. Pull to refresh or pick another
                  event from the list.
                </Text>
              </View>
            ) : null}

            {game?.state === 'Live' ? (
              <LiveMatchStatsPanel
                stats={liveStats}
                isLoading={isLoadingLiveStats}
                homeName={game.participants[0]?.name}
                awayName={game.participants[1]?.name}
              />
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Markets</Text>
              <Text style={styles.sectionHint}>One selection per event.</Text>
              {isLoadingMarkets ? (
                <View style={styles.marketsLoading}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.emptyText}>Loading markets…</Text>
                </View>
              ) : markets.length === 0 ? (
                <Text style={styles.emptyText}>No active markets for this event yet.</Text>
              ) : (
                markets.map((condition) => (
                  <View key={condition.conditionId} style={styles.marketCard}>
                    <Text style={styles.marketTitle}>{condition.title}</Text>
                    <View style={styles.outcomesRow}>
                      {condition.outcomes
                        .filter((outcome) => outcome.state === 'Active')
                        .map((outcome) => {
                          const isSelected =
                            selected?.conditionId === condition.conditionId &&
                            selected?.outcomeId === outcome.outcomeId
                          return (
                            <TouchableOpacity
                              key={outcome.outcomeId}
                              style={[
                                styles.outcomeButton,
                                isSelected && styles.outcomeButtonSelected,
                              ]}
                              onPress={() => handleSelectOutcome(condition, outcome)}
                            >
                              <Text
                                style={[
                                  styles.outcomeLabel,
                                  isSelected && styles.outcomeLabelSelected,
                                ]}
                                numberOfLines={2}
                              >
                                {outcome.title}
                              </Text>
                              <OddsBadge odds={outcome.odds} selected={isSelected} />
                            </TouchableOpacity>
                          )
                        })}
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          {selected ? (
            <View style={styles.cartWrap}>
              <BetSlipCart
                selection={selected}
                mode={betMode}
                onModeChange={handleModeChange}
                canBetAsTipster={canBetAsTipster}
                tipsterLabel={tipsterLabel}
                vaultTotalUsdt={vaultTotalUsdt}
                vaultFreeUsdt={vaultFreeUsdt}
                vaultTotalLabel={
                  tipsterVault ? formatBetToken(tipsterVault.totalAssets) : undefined
                }
                stake={stake}
                onStakeChange={setStake}
                effectiveStakeUsdt={effectiveStakeUsdt}
                potentialPayout={potentialPayout}
                quoteText={quoteText}
                placementBlockedReason={placementBlockedReason}
                isPlacing={isPlacing}
                onClear={() => setSelected(null)}
                onConfirm={handlePlaceBet}
              />
            </View>
          ) : null}

          <MatchAiSheet
            visible={aiVisible}
            onClose={() => setAiVisible(false)}
            gameId={game?.id ?? id ?? ''}
            matchTitle={game?.title ?? 'Match'}
            startsAt={game?.startsAt ?? null}
            league={game?.league?.name ?? null}
            ownerId={address ?? null}
            markets={markets.map((condition) => ({
              conditionId: condition.conditionId,
              conditionTitle: condition.title,
              outcomes: condition.outcomes
                .filter((o) => o.state === 'Active')
                .map((o) => ({
                  outcomeId: o.outcomeId,
                  title: o.title,
                  decimalOdds: formatAzuroOdds(o.odds),
                  rawOdds: o.odds,
                })),
            }))}
            onApplyPick={(pick) => {
              const condition = conditions.find((c) => c.conditionId === pick.conditionId)
              const outcome = condition?.outcomes.find((o) => o.outcomeId === pick.outcomeId)
              if (condition && outcome) {
                handleSelectOutcome(condition, outcome)
                toast.success(`Selected: ${pick.outcomeTitle}`)
              }
            }}
          />
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  section: {
    gap: 10,
  },
  sectionTitle: {
    ...theme.typography.title,
    fontSize: 15,
  },
  sectionHint: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: -6,
    fontWeight: '600',
  },
  marketCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 10,
    gap: 8,
  },
  marketTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  outcomesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outcomeButton: {
    minWidth: '30%',
    flexGrow: 1,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderDark,
    backgroundColor: colors.cardDark,
    padding: 8,
    gap: 6,
  },
  outcomeButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  outcomeLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  outcomeLabelSelected: {
    color: colors.primary,
  },
  cartWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiBadgeLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
  },
  aiWandCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBackground,
    padding: 12,
    gap: 6,
    marginBottom: 4,
  },
  previewTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  previewText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
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
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  marketsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
})
