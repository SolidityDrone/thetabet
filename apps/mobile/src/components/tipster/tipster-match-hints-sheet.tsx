import { TipsterVoiceTextField } from '@/components/tipster/tipster-voice-text-field'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useVoiceFieldFill } from '@/hooks/use-voice-field-fill'
import { summarizeMatchHint } from '@/services/tipster-notes/summarizer'
import {
  addMatchHint,
  getMatchHints,
  loadTipsterNotes,
  removeMatchHint,
} from '@/services/tipster-notes/storage'
import type { TipsterMatchHint } from '@/services/tipster-notes/types'
import {
  ChevronLeft,
  List,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native'
import React from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toast } from 'sonner-native'

type Props = {
  visible: boolean
  ownerId: string
  gameId: string
  matchTitle: string
  league?: string | null
  onClose: () => void
}

function formatHintSummary(hint: TipsterMatchHint): string | null {
  if (!hint.summary?.length) return null
  return hint.summary.map((line) => `[${line.weight.toUpperCase()}] ${line.text}`).join('\n')
}

export function TipsterMatchHintsSheet({
  visible,
  ownerId,
  gameId,
  matchTitle,
  league,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets()
  const voice = useVoiceFieldFill()
  const [hints, setHints] = React.useState<TipsterMatchHint[]>([])
  const [screen, setScreen] = React.useState<'list' | 'add'>('list')
  const [pasteText, setPasteText] = React.useState('')
  const [sourcesText, setSourcesText] = React.useState('')
  const [hintUsedVoice, setHintUsedVoice] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    if (!ownerId || !gameId) return
    const store = await loadTipsterNotes(ownerId)
    setHints(getMatchHints(store.matches[gameId]))
  }, [ownerId, gameId])

  React.useEffect(() => {
    if (!visible) return
    setScreen('list')
    setPasteText('')
    setSourcesText('')
    setHintUsedVoice(false)
    void reload()
  }, [visible, reload])

  const handleDelete = async (hintId: string) => {
    try {
      setBusy(true)
      await removeMatchHint(ownerId, gameId, hintId)
      await reload()
      toast.success('Hint removed')
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusy(false)
    }
  }

  const handleSummarize = async (hint: TipsterMatchHint) => {
    try {
      setBusy(true)
      await summarizeMatchHint(ownerId, gameId, hint.id, hint.raw, matchTitle)
      await reload()
      toast.success('Hint locked for AI')
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusy(false)
    }
  }

  const registerHint = async (raw: string, inputMode: 'voice' | 'paste') => {
    const trimmed = raw.trim()
    if (!trimmed) {
      toast.error('Add some text first')
      return
    }
    try {
      setBusy(true)
      const { hint } = await addMatchHint(
        ownerId,
        gameId,
        {
          raw: trimmed,
          sources: sourcesText.trim() || undefined,
          inputMode,
        },
        { matchTitle, league: league ?? undefined }
      )
      await summarizeMatchHint(ownerId, gameId, hint.id, trimmed, matchTitle)
      await reload()
      setScreen('list')
      setPasteText('')
      setSourcesText('')
      setHintUsedVoice(false)
      toast.success('Hint registered')
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusy(false)
    }
  }

  const saveHint = async () => {
    await registerHint(pasteText, hintUsedVoice ? 'voice' : 'paste')
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 16,
              maxHeight: '88%',
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            {screen === 'add' ? (
              <TouchableOpacity style={styles.iconButton} onPress={() => setScreen('list')}>
                <ChevronLeft size={20} color={colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={styles.iconButton} />
            )}
            <View style={styles.headerCenter}>
              <List size={16} color={colors.gold} />
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {screen === 'list' ? 'Match hints' : 'Register hint'}
              </Text>
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={onClose}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.matchLabel} numberOfLines={2}>
            {matchTitle}
          </Text>

          {screen === 'list' ? (
            <>
              <Text style={styles.hint}>
                Locked hints override web scout in AI analysis and /ask in chat.
              </Text>
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {hints.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Sparkles size={18} color={colors.gold} />
                    <Text style={styles.emptyTitle}>No hints yet</Text>
                    <Text style={styles.emptyText}>
                      Add convictions by speaking or pasting notes and links.
                    </Text>
                  </View>
                ) : (
                  hints.map((hint) => {
                    const summary = formatHintSummary(hint)
                    return (
                      <View key={hint.id} style={styles.hintCard}>
                        <View style={styles.hintCardTop}>
                          <Text style={styles.hintMode}>
                            {hint.inputMode === 'voice' ? 'Voice' : 'Paste'}
                          </Text>
                          <View style={styles.hintActions}>
                            <TouchableOpacity
                              onPress={() => void handleDelete(hint.id)}
                              disabled={busy}
                              hitSlop={8}
                            >
                              <Trash2 size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={styles.hintRaw}>{hint.raw}</Text>
                        {hint.sources ? (
                          <Text style={styles.hintSources} numberOfLines={2}>
                            Sources: {hint.sources}
                          </Text>
                        ) : null}
                        {summary ? (
                          <View style={styles.summaryBox}>
                            <Text style={styles.summaryLabel}>Locked</Text>
                            <Text style={styles.summaryText}>{summary}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.summarizeButton}
                            onPress={() => void handleSummarize(hint)}
                            disabled={busy}
                          >
                            <Text style={styles.summarizeButtonText}>Summarize & lock</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )
                  })
                )}
              </ScrollView>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => setScreen('add')}
                disabled={busy}
              >
                <Plus size={16} color={colors.background} />
                <Text style={styles.primaryButtonText}>Add hint</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.addPane}>
              <Text style={styles.hint}>
                Speak or type your take. Use Speak → Stop on each field, Refresh to clear and redo.
              </Text>
              <TipsterVoiceTextField
                fieldId="match-hint"
                voice={voice}
                value={pasteText}
                onChangeText={(text) => {
                  setPasteText(text)
                  if (!text.trim()) setHintUsedVoice(false)
                }}
                onTranscribed={() => setHintUsedVoice(true)}
                placeholder="Your conviction, stats, or read-out…"
                inputStyle={styles.input}
              />
              <TipsterVoiceTextField
                fieldId="match-sources"
                voice={voice}
                value={sourcesText}
                onChangeText={setSourcesText}
                label="Sources (optional)"
                placeholder="URLs or site names, one per line"
                inputStyle={styles.sourcesInput}
              />
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
                onPress={() => void saveHint()}
                disabled={busy || voice.isFieldBusy('match-hint') || voice.isFieldBusy('match-sources')}
              >
                {busy ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save & lock hint</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  matchLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: 10,
    paddingBottom: 4,
  },
  emptyBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  hintCard: {
    backgroundColor: colors.cardDark,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  hintCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hintMode: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  hintActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hintRaw: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  hintSources: {
    color: colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  summaryBox: {
    backgroundColor: colors.goldMuted,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  summaryLabel: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: '700',
  },
  summaryText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  summarizeButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  summarizeButtonText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 14,
  },
  addPane: {
    gap: 12,
    paddingBottom: 4,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
  },
  modeTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeTabText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  modeTabTextActive: {
    color: colors.background,
  },
  voicePane: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 20,
  },
  voiceHint: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  micButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: colors.gold,
  },
  micButtonDisabled: {
    opacity: 0.45,
  },
  micLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  pastePane: {
    gap: 10,
  },
  input: {
    minHeight: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    color: colors.text,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  sourcesInput: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    color: colors.text,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 13,
  },
})
