import { BottomSheetModal, SheetActions } from '@/components/ui/bottom-sheet-modal'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import type { AzuroBetSelection } from '@/types/azuro'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { researchMatchWeb } from '@/services/qvac/web-research'
import {
  cancelQvacInference,
  streamMatchTip,
  unloadQvacModel,
} from '@/services/qvac/qvac-client'
import { isQvacModelMarkedInstalled } from '@/services/qvac/qvac-model-manager'
import { loadQvacSettings } from '@/services/qvac/qvac-settings'
import { Sparkles } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

type Props = {
  visible: boolean
  onClose: () => void
  matchTitle: string
  startsAt?: string | null
  league?: string | null
  markets: Array<{
    conditionTitle: string
    outcomes: Array<{ title: string; decimalOdds: number }>
  }>
  selected?: AzuroBetSelection | null
  onPickOutcome?: (outcomeTitle: string) => void
}

type Stage = 'idle' | 'research' | 'loading-model' | 'thinking' | 'done' | 'error'

const FLUSH_MS = 120

export function MatchAiSheet({
  visible,
  onClose,
  matchTitle,
  startsAt,
  league,
  markets,
}: Props) {
  const router = useDebouncedNavigation()
  const [stage, setStage] = useState<Stage>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [needsDownload, setNeedsDownload] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const pendingTextRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const title = useMemo(() => `AI Tip · ${matchTitle}`, [matchTitle])

  const flushText = () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    if (pendingTextRef.current) {
      setText(pendingTextRef.current)
    }
  }

  const scheduleFlush = () => {
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      setText(pendingTextRef.current)
    }, FLUSH_MS)
  }

  const stopRun = async (unloadModel = false) => {
    abortRef.current?.abort()
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
  }

  useEffect(() => {
    if (visible) return

    void stopRun(true)
    pendingTextRef.current = ''
    flushText()
    setStage('idle')
    setText('')
    setError(null)
    setNeedsDownload(false)
  }, [visible])

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
      }
      void stopRun(true)
    }
  }, [])

  const run = async () => {
    if (runningRef.current) return
    runningRef.current = true

    await stopRun(false)

    const controller = new AbortController()
    abortRef.current = controller

    setStage('research')
    setError(null)
    setNeedsDownload(false)
    setText('')
    pendingTextRef.current = ''

    try {
      const settings = await loadQvacSettings()
      const installed = await isQvacModelMarkedInstalled(settings.modelPreset)
      if (!installed) {
        setStage('error')
        setNeedsDownload(true)
        setError(
          `Local AI model is not downloaded yet. Install it in Settings → Local AI before running tips.`
        )
        return
      }

      const sources = await researchMatchWeb(matchTitle)
      if (controller.signal.aborted) return

      setStage('loading-model')

      const stream = streamMatchTip(
        {
          matchTitle,
          startsAt,
          league,
          markets,
          sources,
        },
        { signal: controller.signal }
      )

      setStage('thinking')

      for await (const chunk of stream) {
        if (controller.signal.aborted) return
        pendingTextRef.current += chunk
        scheduleFlush()
      }

      flushText()
      if (!controller.signal.aborted) {
        setStage('done')
      }
    } catch (e) {
      if (controller.signal.aborted) return
      const message = e instanceof Error ? e.message : String(e)
      setStage('error')
      setNeedsDownload(message.toLowerCase().includes('not downloaded'))
      setError(message)
      try {
        await unloadQvacModel()
      } catch {
        // Best-effort cleanup after failed boot/load.
      }
    } finally {
      runningRef.current = false
      abortRef.current = null
    }
  }

  const handleClose = () => {
    void stopRun(true)
    onClose()
  }

  const handleStop = () => {
    void stopRun(false)
    flushText()
    setStage(text || pendingTextRef.current ? 'done' : 'idle')
  }

  const busy = stage === 'research' || stage === 'loading-model' || stage === 'thinking'

  return (
    <BottomSheetModal
      visible={visible}
      onClose={handleClose}
      title={title}
      message="Local QVAC model + live web research. Download the model once in Settings."
    >
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Sparkles size={14} color={colors.primary} />
          <Text style={styles.badgeText}>QVAC</Text>
        </View>
        {busy ? (
          <View style={styles.stageRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stageText}>
              {stage === 'research'
                ? 'Researching…'
                : stage === 'loading-model'
                  ? 'Loading model…'
                  : 'Analyzing…'}
            </Text>
          </View>
        ) : null}
      </View>

      {stage === 'idle' ? (
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Get a betting tip</Text>
          <Text style={styles.heroText}>
            Download the local model in Settings first, then I’ll scan injuries/news/form and pick
            from the available outcomes.
          </Text>
        </View>
      ) : null}

      {stage === 'error' ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>AI failed</Text>
          <Text style={styles.errorText}>{error || 'Unknown error'}</Text>
          {needsDownload ? (
            <TouchableOpacity
              style={styles.settingsLink}
              onPress={() => {
                handleClose()
                router.push('/settings')
              }}
            >
              <Text style={styles.settingsLinkText}>Open Settings to download model</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.errorHint}>
              If this keeps crashing, stay on SmolLM2 360M and download it before running AI.
            </Text>
          )}
        </View>
      ) : null}

      {text ? (
        <ScrollView style={styles.result} contentContainerStyle={styles.resultContent}>
          <Text style={styles.resultText}>{text}</Text>
        </ScrollView>
      ) : null}

      <SheetActions
        onCancel={handleClose}
        cancelLabel="Close"
        onConfirm={run}
        confirmLabel={stage === 'idle' ? 'Run AI' : 'Re-run'}
        confirmDisabled={busy}
      >
        <TouchableOpacity
          style={styles.secondaryTiny}
          onPress={handleStop}
          disabled={!busy}
        >
          <Text style={styles.secondaryTinyText}>Stop</Text>
        </TouchableOpacity>
      </SheetActions>
    </BottomSheetModal>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.neonMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: colors.primary,
    fontWeight: '900',
    letterSpacing: 0.4,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  hero: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    padding: 12,
    gap: 6,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  heroText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  result: {
    maxHeight: 340,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  resultContent: {
    padding: 12,
  },
  resultText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  errorCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    padding: 12,
    gap: 6,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  errorHint: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  settingsLink: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  settingsLinkText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryTiny: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.sharp,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryTinyText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
})
