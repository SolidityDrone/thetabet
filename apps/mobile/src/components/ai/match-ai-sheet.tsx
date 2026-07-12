import { ScoutStatusStrip } from '@/components/ai/scout-status-strip'
import { ScoutWebStrip, type ScoutWebVisit } from '@/components/ai/scout-web-strip'
import { SiteFavicon } from '@/components/ai/site-favicon'
import { ChatAvatar } from '@/components/pear/chat-avatar'
import { BottomSheetModal, SheetActions } from '@/components/ui/bottom-sheet-modal'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { usePearChat } from '@/context/pear-chat'
import { useInferenceKeepAwake } from '@/services/keep-awake'
import {
  attachReasonsToPicks,
  buildOutcomeCatalog,
  formatRawAnalysisStream,
  parsePickSuggestions,
  type MatchMarketInput,
  type MatchPickSuggestion,
} from '@/services/qvac/match-outcomes'
import {
  loadMatchScoutCache,
  saveMatchScoutCache,
} from '@/services/qvac/match-scout-cache'
import { runMatchScout, type MatchDossier, type ScoutId, type ScoutResult } from '@/services/qvac/match-scout'
import { cancelQvacInference, unloadQvacModel } from '@/services/qvac/qvac-client'
import {
  acquireInference,
  releaseInference,
} from '@/services/qvac/inference-coordinator'
import { isQvacModelMarkedInstalled } from '@/services/qvac/qvac-model-manager'
import { loadQvacSettings } from '@/services/qvac/qvac-settings'
import { buildTipsterHintsPrompt } from '@/services/tipster-notes/storage'
import { ChevronRight, Copy } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { toast } from 'sonner-native'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { PeerInferencePeer } from '@/types/pear'

type Props = {
  visible: boolean
  onClose: () => void
  gameId: string
  matchTitle: string
  startsAt?: string | null
  league?: string | null
  markets: MatchMarketInput[]
  ownerId?: string | null
  onApplyPick?: (pick: MatchPickSuggestion) => void
}

type Stage = 'idle' | 'loading-model' | 'web' | 'synthesis' | 'done' | 'error'

function statusLabel(stage: Stage, busy: boolean) {
  if (stage === 'loading-model') return 'Loading model'
  if (stage === 'web') return 'Hints'
  if (stage === 'synthesis') return 'Analysis'
  if (stage === 'done') return busy ? 'Finishing' : 'Ready'
  return ''
}

function formatCachedAt(ts: number) {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function MatchAiSheet({
  visible,
  onClose,
  gameId,
  matchTitle,
  startsAt,
  league,
  markets,
  ownerId,
  onApplyPick,
}: Props) {
  const router = useDebouncedNavigation()
  const {
    listInferencePeers,
    requestPeerInference,
    cancelPeerInference,
    onInferenceEvent,
  } = usePearChat()
  const catalog = useMemo(() => buildOutcomeCatalog(markets), [markets])

  const [stage, setStage] = useState<Stage>('idle')
  const [activeScout, setActiveScout] = useState<ScoutId | null>(null)
  const [activeSite, setActiveSite] = useState<string | null>(null)
  const [webVisits, setWebVisits] = useState<ScoutWebVisit[]>([])
  const [activity, setActivity] = useState<string | null>(null)
  const [results, setResults] = useState<Partial<Record<ScoutId, ScoutResult>>>({})
  const [dossier, setDossier] = useState<MatchDossier | null>(null)
  const [answer, setAnswer] = useState('')
  const [suggestions, setSuggestions] = useState<MatchPickSuggestion[]>([])
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [synthesisWarning, setSynthesisWarning] = useState<string | null>(null)
  const [needsDownload, setNeedsDownload] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const runEpochRef = useRef(0)
  const pendingAnswerRef = useRef('')
  const lockedPicksRef = useRef<MatchPickSuggestion[]>([])
  const scrollRef = useRef<ScrollView>(null)
  const remoteRequestIdRef = useRef<string | null>(null)
  const [peers, setPeers] = useState<PeerInferencePeer[]>([])
  const [browsingPeers, setBrowsingPeers] = useState(false)
  const [peerBrowserOpen, setPeerBrowserOpen] = useState(false)
  const [remoteProvider, setRemoteProvider] = useState<PeerInferencePeer | null>(null)

  const busy = stage === 'loading-model' || stage === 'web' || stage === 'synthesis'
  const streaming = stage === 'synthesis'
  useInferenceKeepAwake(busy)
  const hasCachedReport = cachedAt !== null && stage === 'done'
  const picksWithReasons = useMemo(
    () => attachReasonsToPicks(answer, suggestions, matchTitle),
    [answer, suggestions, matchTitle]
  )
  const rawAnalysis = useMemo(() => formatRawAnalysisStream(answer), [answer])
  const copyableText = useMemo(() => rawAnalysis.trim(), [rawAnalysis])
  const showAnalysis = streaming || stage === 'done'
  const showPicks = !streaming && picksWithReasons.length > 0
  const [synthesisWaitSec, setSynthesisWaitSec] = useState(0)

  useEffect(() => {
    if (stage !== 'synthesis' || answer.length > 0) {
      setSynthesisWaitSec(0)
      return
    }
    const started = Date.now()
    const tick = () => setSynthesisWaitSec(Math.floor((Date.now() - started) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [stage, answer.length])

  const setLockedPicks = (picks: MatchPickSuggestion[]) => {
    if (picks.length === 0) return
    lockedPicksRef.current = picks
    setSuggestions(picks)
  }

  const resetAnswer = () => {
    pendingAnswerRef.current = ''
    setAnswer('')
  }

  const stopRun = async (unloadModel = false) => {
    abortRef.current?.abort()
    const remoteRequestId = remoteRequestIdRef.current
    remoteRequestIdRef.current = null
    if (remoteRequestId) {
      try {
        await cancelPeerInference(remoteRequestId)
      } catch {}
    }
    try {
      await cancelQvacInference()
    } catch {
      // Ignore cancel races.
    }
    if (unloadModel) {
      try {
        await unloadQvacModel()
      } catch {
        // Best-effort unload on close.
      }
    }
    runningRef.current = false
    releaseInference('local')
  }

  const trackWebVisit = (site: string, url: string) => {
    setActiveSite(site)
    setWebVisits((prev) => {
      if (prev.some((v) => v.url === url)) return prev
      return [...prev, { site, url }].slice(-10)
    })
  }

  const resetRunState = () => {
    resetAnswer()
    lockedPicksRef.current = []
    setActiveScout(null)
    setActiveSite(null)
    setWebVisits([])
    setActivity(null)
    setResults({})
    setDossier(null)
    setSuggestions([])
    setError(null)
    setSynthesisWarning(null)
    setNeedsDownload(false)
  }

  const applyCache = (cached: Awaited<ReturnType<typeof loadMatchScoutCache>>) => {
    if (!cached) return false
    setDossier(cached.dossier)
    setAnswer(cached.answer)
    pendingAnswerRef.current = cached.answer
    const picks =
      cached.suggestions.length > 0
        ? cached.suggestions
        : parsePickSuggestions(cached.answer, catalog, matchTitle)
    lockedPicksRef.current = picks
    setSuggestions(attachReasonsToPicks(cached.answer, picks, matchTitle))
    setCachedAt(cached.updatedAt)
    setStage('done')
    setResults(Object.fromEntries(cached.dossier.scouts.map((r) => [r.id, r])) as Partial<
      Record<ScoutId, ScoutResult>
    >)
    return true
  }

  useEffect(() => {
    if (!visible || !gameId) return
    const loadEpoch = runEpochRef.current
    let cancelled = false
    void loadMatchScoutCache(gameId).then((cached) => {
      if (cancelled || !cached || loadEpoch !== runEpochRef.current) return
      applyCache(cached)
    })
    return () => {
      cancelled = true
    }
  }, [visible, gameId])

  useEffect(() => {
    if (!visible || !catalog.length || lockedPicksRef.current.length > 0) return
    const text = pendingAnswerRef.current || answer
    if (!text) return
    const parsed = parsePickSuggestions(text, catalog, matchTitle)
    if (parsed.length > 0) setLockedPicks(parsed)
  }, [visible, catalog, matchTitle])

  useEffect(() => {
    if (!streaming || !answer) return
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    return () => clearTimeout(t)
  }, [answer, streaming])

  useEffect(() => {
    if (visible) return
    void stopRun(true)
    setStage('idle')
    setCachedAt(null)
    setPeerBrowserOpen(false)
    setRemoteProvider(null)
    resetRunState()
  }, [visible])

  useEffect(() => {
    return () => {
      void stopRun(true)
    }
  }, [])

  const persistReport = async (
    finalDossier: MatchDossier,
    finalAnswer: string,
    picks: MatchPickSuggestion[]
  ) => {
    if (!gameId) return
    await saveMatchScoutCache({
      gameId,
      matchTitle,
      updatedAt: Date.now(),
      dossier: finalDossier,
      answer: finalAnswer,
      suggestions: picks,
    })
    setCachedAt(Date.now())
  }

  const run = async () => {
    if (runningRef.current) return
    if (!catalog.length) {
      setStage('error')
      setError('Markets are still loading — wait for odds on the page, then try again.')
      return
    }
    await stopRun(false)
    if (!acquireInference('local')) {
      toast.error('The inference engine is already busy')
      return
    }
    runningRef.current = true
    runEpochRef.current += 1

    const controller = new AbortController()
    abortRef.current = controller
    setCachedAt(null)
    resetRunState()
    setStage('loading-model')
    setActivity('Booting model…')

    let finalDossier: MatchDossier | null = null

    try {
      const settings = await loadQvacSettings()
      const installed = await isQvacModelMarkedInstalled(settings.modelPreset)
      if (!installed) {
        setStage('error')
        setNeedsDownload(true)
        setError('Download the local AI model in Settings first.')
        return
      }

      const tipsterHintsBlock = ownerId
        ? await buildTipsterHintsPrompt(ownerId, { gameId, matchTitle, league })
        : ''
      if (tipsterHintsBlock) {
        setActivity('Tipster hints loaded — scouting web…')
      }

      for await (const event of runMatchScout(
        { gameId, matchTitle, startsAt, league, markets, tipsterHintsBlock },
        { signal: controller.signal }
      )) {
        if (controller.signal.aborted) return

        switch (event.type) {
          case 'stage':
            setStage(event.stage)
            if (event.stage === 'web') setActivity('Searching web…')
            else if (event.stage === 'synthesis') {
              setActiveScout(null)
              setActivity('Starting model (CPU)…')
            }
            break
          case 'activity':
            setActivity(event.message)
            break
          case 'scout-search':
            setActiveScout(event.scout)
            setActivity(`Search: ${event.query.slice(0, 48)}…`)
            trackWebVisit('duckduckgo.com', 'https://duckduckgo.com')
            break
          case 'scout-reading':
            setActiveScout(event.scout)
            setActivity(`Read ${event.site}`)
            trackWebVisit(event.site, event.url)
            break
          case 'scout-done':
            setResults((prev) => ({ ...prev, [event.scout]: event.result }))
            setActiveSite(null)
            break
          case 'dossier':
            setDossier(event.dossier)
            break
          case 'picks':
            setLockedPicks(event.picks)
            break
          case 'answer-delta':
            pendingAnswerRef.current += event.text
            setAnswer(pendingAnswerRef.current)
            if (lockedPicksRef.current.length > 0) {
              setSuggestions(
                attachReasonsToPicks(pendingAnswerRef.current, lockedPicksRef.current, matchTitle)
              )
            }
            break
          case 'answer-reset':
            resetAnswer()
            break
          case 'synthesis-error':
            setSynthesisWarning(
              event.message.toLowerCase().includes('context') ||
                event.message.toLowerCase().includes('overflow')
                ? 'Context limit hit — raise ctx in Settings or refresh.'
                : event.message
            )
            break
          case 'done':
            finalDossier = event.dossier
            setDossier(event.dossier)
            break
        }
      }

      if (controller.signal.aborted) return

      const finalAnswer = pendingAnswerRef.current
      const picks =
        lockedPicksRef.current.length > 0
          ? attachReasonsToPicks(finalAnswer, lockedPicksRef.current, matchTitle)
          : parsePickSuggestions(finalAnswer, catalog, matchTitle)
      setSuggestions(picks)
      setStage('done')
      setActiveScout(null)
      setActivity(null)

      if (finalDossier) await persistReport(finalDossier, finalAnswer, picks)
    } catch (e) {
      if (controller.signal.aborted) return
      const message = e instanceof Error ? e.message : String(e)
      const picks =
        lockedPicksRef.current.length > 0
          ? attachReasonsToPicks(pendingAnswerRef.current, lockedPicksRef.current, matchTitle)
          : parsePickSuggestions(pendingAnswerRef.current, catalog, matchTitle)

      if (finalDossier) {
        setDossier(finalDossier)
        setSuggestions(picks)
        setStage('done')
        setSynthesisWarning(message)
        await persistReport(finalDossier, pendingAnswerRef.current, picks)
      } else {
        setStage('error')
        setNeedsDownload(message.toLowerCase().includes('not downloaded'))
        setError(message)
        try {
          await unloadQvacModel()
        } catch {
          // Best-effort cleanup.
        }
      }
    } finally {
      runningRef.current = false
      abortRef.current = null
      releaseInference('local')
    }
  }

  const browsePeers = async () => {
    if (browsingPeers) return
    if (stage !== 'idle') {
      resetRunState()
      setCachedAt(null)
      setStage('idle')
    }
    setPeerBrowserOpen(true)
    setBrowsingPeers(true)
    setError(null)
    try {
      setPeers(await listInferencePeers())
    } catch (browseError) {
      setPeers([])
      setError(browseError instanceof Error ? browseError.message : String(browseError))
    } finally {
      setBrowsingPeers(false)
    }
  }

  const runWithPeer = async (peer: PeerInferencePeer) => {
    if (runningRef.current || peer.status !== 'available') return
    if (!catalog.length) {
      setStage('error')
      setError('Markets are still loading — wait for odds on the page, then try again.')
      return
    }

    await stopRun(false)
    if (!acquireInference('local')) {
      toast.error('The inference engine is already busy')
      return
    }

    runningRef.current = true
    setPeerBrowserOpen(false)
    setRemoteProvider(peer)
    setCachedAt(null)
    resetRunState()
    setStage('loading-model')
    setActivity(`Connecting to ${peer.handle ? `@${peer.handle}` : peer.pubkey.slice(0, 8)}…`)

    try {
      const accepted = await requestPeerInference(peer.pubkey, {
        gameId,
        matchTitle,
        startsAt,
        league,
        markets,
      })
      remoteRequestIdRef.current = accepted.requestId
      setRemoteProvider(accepted.provider ?? peer)
      setStage('web')
      setActivity('Peer accepted · running scouts with their notes…')
    } catch (requestError) {
      runningRef.current = false
      releaseInference('local')
      setStage('error')
      setError(requestError instanceof Error ? requestError.message : String(requestError))
    }
  }

  useEffect(() => {
    return onInferenceEvent((event) => {
      if (!remoteRequestIdRef.current || event.requestId !== remoteRequestIdRef.current) return

      if (event.type === 'progress') {
        if (event.stage === 'synthesis') setStage('synthesis')
        else if (event.stage === 'web') setStage('web')
        else setStage('loading-model')
        setActivity(event.message ?? 'Peer is working…')
        return
      }

      remoteRequestIdRef.current = null
      runningRef.current = false
      releaseInference('local')

      if (event.type === 'error') {
        setStage('error')
        setError(event.message)
        return
      }

      const { dossier: peerDossier, answer: peerAnswer, suggestions: peerPicks } = event.result
      setDossier(peerDossier)
      setAnswer(peerAnswer)
      pendingAnswerRef.current = peerAnswer
      lockedPicksRef.current = peerPicks
      setSuggestions(peerPicks)
      setResults(
        Object.fromEntries(peerDossier.scouts.map((result) => [result.id, result])) as Partial<
          Record<ScoutId, ScoutResult>
        >
      )
      setStage('done')
      setActivity(null)
      void persistReport(peerDossier, peerAnswer, peerPicks)
    })
  }, [onInferenceEvent])

  const handleCopyPreview = async () => {
    if (!copyableText) return
    await Clipboard.setStringAsync(copyableText)
    toast.success('Preview copied')
  }

  const handleClose = () => {
    void stopRun(true)
    onClose()
  }

  const handleStop = () => {
    void stopRun(false)
    const picks =
      lockedPicksRef.current.length > 0
        ? attachReasonsToPicks(pendingAnswerRef.current, lockedPicksRef.current, matchTitle)
        : parsePickSuggestions(pendingAnswerRef.current, catalog, matchTitle)
    setSuggestions(picks)
    setStage(answer || pendingAnswerRef.current || dossier ? 'done' : 'idle')
    setActiveScout(null)
    setActivity(null)
  }

  return (
    <BottomSheetModal
      visible={visible}
      onClose={handleClose}
      title={`AI · ${matchTitle}`}
      cardStyle={styles.sheetCard}
    >
      <View style={styles.sheetContent}>
        {stage !== 'idle' && stage !== 'error' ? (
          <View style={styles.statusBlock}>
            <View style={styles.statusBar}>
              <ScoutStatusStrip results={results} activeScout={activeScout} busy={busy} />
              {activeSite ? <SiteFavicon site={activeSite} size={14} /> : null}
              <Text style={styles.statusText} numberOfLines={1}>
                {busy ? activity ?? statusLabel(stage, busy) : hasCachedReport ? `Saved ${formatCachedAt(cachedAt!)}` : 'Ready'}
              </Text>
              {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>
            {stage === 'web' && webVisits.length > 0 ? (
              <ScoutWebStrip visits={webVisits} activeSite={activeSite} />
            ) : null}
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {stage === 'idle' ? (
            <View style={styles.sourceChooser}>
              <Text style={styles.hint}>
                Choose where the match analysis is computed.
              </Text>
              <TouchableOpacity style={styles.sourceCard} onPress={() => void run()}>
                <Text style={styles.sourceTitle}>Self inference</Text>
                <Text style={styles.sourceHint}>
                  Run scouts and your private tipster notes on this phone.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sourceCard} onPress={() => void browsePeers()}>
                <View style={styles.sourceTitleRow}>
                  <Text style={styles.sourceTitle}>Browse peers</Text>
                  {browsingPeers ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </View>
                <Text style={styles.sourceHint}>
                  Ask an opted-in peer to run their scouts and their notes, then return picks.
                </Text>
              </TouchableOpacity>

              {peerBrowserOpen ? (
                <View style={styles.peerList}>
                  <View style={styles.sourceTitleRow}>
                    <Text style={styles.sectionLabel}>Public inference peers</Text>
                    <TouchableOpacity onPress={() => void browsePeers()} disabled={browsingPeers}>
                      <Text style={styles.refreshPeers}>Refresh</Text>
                    </TouchableOpacity>
                  </View>
                  {!browsingPeers && peers.length === 0 ? (
                    <Text style={styles.sourceHint}>No opted-in peers found. Try again shortly.</Text>
                  ) : null}
                  {peers.map((peer) => (
                    <TouchableOpacity
                      key={peer.pubkey}
                      style={[styles.peerRow, peer.status === 'busy' && styles.peerRowBusy]}
                      disabled={peer.status !== 'available'}
                      onPress={() => void runWithPeer(peer)}
                    >
                      <ChatAvatar avatarData={peer.avatarData} size={30} />
                      <View style={styles.peerCopy}>
                        <Text style={styles.peerName}>
                          {peer.handle ? `@${peer.handle}` : `Peer ${peer.pubkey.slice(0, 8)}`}
                        </Text>
                        <Text style={styles.peerStatus}>{peer.status}</Text>
                      </View>
                      <ChevronRight
                        size={16}
                        color={peer.status === 'available' ? colors.primary : colors.textTertiary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {stage === 'error' ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error || 'Unknown error'}</Text>
              {needsDownload ? (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => {
                    handleClose()
                    router.push('/settings')
                  }}
                >
                  <Text style={styles.linkBtnText}>Open Settings</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {synthesisWarning && (stage === 'done' || streaming) ? (
            <Text style={styles.warnText}>{synthesisWarning}</Text>
          ) : null}

          {showAnalysis ? (
            <View style={styles.analysisBox}>
              <View style={styles.analysisHeader}>
                <Text style={styles.sectionLabel}>
                  {remoteProvider
                    ? `Analysis by ${remoteProvider.handle ? `@${remoteProvider.handle}` : remoteProvider.pubkey.slice(0, 8)}`
                    : 'Analysis'}
                </Text>
                {copyableText ? (
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => void handleCopyPreview()}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Copy size={12} color={colors.primary} />
                    <Text style={styles.copyBtnText}>Copy</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {streaming && !answer ? (
                <Text style={styles.analysisPending}>
                  {activity ?? 'Waiting for first token…'}
                  {synthesisWaitSec > 0
                    ? `\nCPU inference can take 30–90s on first token (${synthesisWaitSec}s).`
                    : ''}
                </Text>
              ) : (
                <Text style={styles.streamText} selectable>
                  {rawAnalysis || answer}
                  {streaming ? <Text style={styles.cursor}>▍</Text> : null}
                </Text>
              )}
            </View>
          ) : null}

          {showPicks ? (
            <View style={styles.picksBlock}>
              <Text style={styles.sectionLabel}>Recommended plays · tap to bet</Text>
              {picksWithReasons.map((pick) => (
                <TouchableOpacity
                  key={`${pick.rank}:${pick.conditionId}:${pick.outcomeId}`}
                  style={[styles.pickRow, pick.rank === 1 && styles.pickRowPrimary]}
                  onPress={() => {
                    onApplyPick?.(pick)
                    handleClose()
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.pickBody}>
                    <Text style={styles.pickRank}>
                      {pick.rank === 1 ? '①' : pick.rank === 2 ? '②' : '③'}{' '}
                      {pick.outcomeTitle}
                    </Text>
                    <Text style={styles.pickMarket} numberOfLines={1}>
                      {pick.conditionTitle}
                    </Text>
                    {pick.reason ? (
                      <Text style={styles.pickWhy} numberOfLines={3}>
                        {pick.reason}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.pickOdds}>{pick.decimalOdds.toFixed(2)}x</Text>
                  <ChevronRight size={14} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          ) : stage === 'done' && !picksWithReasons.length ? (
            <Text style={styles.warnText}>
              Picks could not be matched to live odds — try Refresh when markets are loaded.
            </Text>
          ) : null}
        </ScrollView>

        <SheetActions
          onCancel={handleClose}
          cancelLabel="Close"
          onConfirm={run}
          confirmLabel={
            stage === 'idle'
              ? 'Self inference'
              : hasCachedReport || stage === 'done'
                ? 'Refresh locally'
                : 'Run AI Analysis'
          }
          confirmDisabled={busy}
        >
          {!busy ? (
            <TouchableOpacity style={styles.stopBtn} onPress={() => void browsePeers()}>
              <Text style={styles.stopBtnText}>Browse peers</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.stopBtn} onPress={handleStop} disabled={!busy}>
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        </SheetActions>
      </View>
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  sheetCard: {
    flexShrink: 1,
    minHeight: 0,
  },
  sheetContent: {
    flexShrink: 1,
    minHeight: 0,
    gap: 8,
  },
  statusBlock: {
    gap: 6,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  statusText: {
    flex: 1,
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '600',
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  sourceChooser: {
    gap: 10,
  },
  sourceCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    padding: 12,
    gap: 4,
  },
  sourceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sourceTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  sourceHint: {
    color: colors.textTertiary,
    fontSize: 10,
    lineHeight: 15,
  },
  peerList: {
    gap: 7,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  refreshPeers: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  peerRowBusy: {
    opacity: 0.5,
    borderColor: colors.border,
  },
  peerCopy: {
    flex: 1,
    gap: 2,
  },
  peerName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  peerStatus: {
    color: colors.textTertiary,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  analysisBox: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    padding: 8,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  copyBtnText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  analysisText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
  },
  analysisPending: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  streamBlock: {
    marginBottom: 8,
    gap: 4,
  },
  streamText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 17,
  },
  formBlock: {
    marginTop: 8,
    gap: 6,
  },
  formText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
  },
  formTeam: {
    color: colors.primary,
    fontWeight: '800',
  },
  cursor: {
    color: colors.gold,
  },
  picksBlock: {
    gap: 4,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  pickRowPrimary: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  pickBody: {
    flex: 1,
    gap: 1,
  },
  pickRank: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  pickMarket: {
    color: colors.textTertiary,
    fontSize: 9,
  },
  pickWhy: {
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
    marginTop: 2,
  },
  pickOdds: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  warnText: {
    color: colors.warning,
    fontSize: 10,
    lineHeight: 14,
  },
  errorCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: 8,
    gap: 6,
  },
  errorText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 15,
  },
  linkBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  linkBtnText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  stopBtn: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.sharp,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stopBtnText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 11,
  },
})
