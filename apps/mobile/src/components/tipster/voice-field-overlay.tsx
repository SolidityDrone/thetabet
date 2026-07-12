import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import type { VoiceFillController } from '@/hooks/use-voice-field-fill'
import { Mic, RefreshCw, Square, X } from 'lucide-react-native'
import React from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  visible: boolean
  fieldId: string
  fieldLabel?: string
  preview: string
  voice: VoiceFillController
  onClose: () => void
  onAppend: (text: string) => void
  onOverwrite: (text: string) => void
  onClear: () => void
}

export function VoiceFieldOverlay({
  visible,
  fieldId,
  fieldLabel,
  preview,
  voice,
  onClose,
  onAppend,
  onOverwrite,
  onClear,
}: Props) {
  const insets = useSafeAreaInsets()
  const recording = voice.isFieldRecording(fieldId)
  const transcribing = voice.isFieldBusy(fieldId) && voice.phase === 'transcribing'
  const busy = voice.isFieldBusy(fieldId)

  const handleClose = () => {
    void voice.cancelActive()
    onClose()
  }

  const handleMic = () => {
    if (!voice.recordingReady || !voice.sttReady || transcribing) return
    if (recording) return
    void voice.start(fieldId)
  }

  const finish = async (mode: 'append' | 'overwrite') => {
    if (!recording || transcribing) return
    const text = await voice.stop(fieldId)
    if (!text) return
    if (mode === 'overwrite') onOverwrite(text)
    else onAppend(text)
    onClose()
  }

  const handleOverwriteIdle = () => {
    if (busy) return
    onClear()
    void voice.start(fieldId)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{fieldLabel ?? 'Speak to fill'}</Text>
              <Text style={styles.subtitle}>Tap the mic, speak, then Stop or Overwrite.</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose} hitSlop={10}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {preview.trim() ? (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Current text</Text>
              <Text style={styles.previewText} numberOfLines={4}>
                {preview}
              </Text>
            </View>
          ) : null}

          {!voice.sttReady ? (
            <Text style={styles.warn}>
              Download Speech-to-text in Settings → Local AI to use voice fill.
            </Text>
          ) : !voice.recordingReady ? (
            <Text style={styles.warn}>
              Voice recording is not in this app build. Rebuild and reinstall: npm run android
            </Text>
          ) : null}

          <View style={styles.micWrap}>
            <TouchableOpacity
              style={[
                styles.micButton,
                recording && styles.micButtonActive,
                (!voice.sttReady || !voice.recordingReady || transcribing) && styles.micButtonDisabled,
              ]}
              onPress={handleMic}
              disabled={!voice.sttReady || !voice.recordingReady || transcribing || recording}
            >
              {transcribing ? (
                <ActivityIndicator color={colors.background} size="large" />
              ) : (
                <Mic size={34} color={recording ? colors.background : colors.primary} />
              )}
            </TouchableOpacity>
            <Text style={styles.micHint}>
              {transcribing
                ? 'Writing your words…'
                : recording
                  ? 'Recording… tap Stop when finished'
                  : 'Tap mic to start'}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.stopButton, (!recording || transcribing) && styles.actionDisabled]}
              onPress={() => void finish('append')}
              disabled={!recording || transcribing}
            >
              <Square size={14} color={colors.background} />
              <Text style={styles.stopLabel}>Stop</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.overwriteButton, transcribing && styles.actionDisabled]}
              onPress={() => (recording ? void finish('overwrite') : handleOverwriteIdle())}
              disabled={transcribing || !voice.sttReady || !voice.recordingReady}
            >
              <RefreshCw size={14} color={colors.text} />
              <Text style={styles.overwriteLabel}>
                {recording ? 'Overwrite' : 'Clear & speak'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingTop: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBox: {
    backgroundColor: colors.cardDark,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 4,
  },
  previewLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  previewText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  warn: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 18,
  },
  micWrap: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  micButton: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.cardDark,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  micButtonDisabled: {
    opacity: 0.45,
  },
  micHint: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
  },
  stopButton: {
    backgroundColor: colors.primary,
  },
  overwriteButton: {
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  stopLabel: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  overwriteLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
})
