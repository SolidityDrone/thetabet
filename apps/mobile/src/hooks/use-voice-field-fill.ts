import {
  createVoiceRecorder,
  isVoiceRecordingAvailable,
  prepareVoiceRecording,
} from '@/services/tipster-voice-recorder'
import { transcribeAudioFile } from '@/services/qvac/qvac-stt-client'
import { isSttModelInstalled } from '@/services/qvac/qvac-stt-models'
import React from 'react'
import { toast } from 'sonner-native'

export type VoiceFieldPhase = 'idle' | 'recording' | 'transcribing'

export type VoiceFillController = ReturnType<typeof useVoiceFieldFill>

export function useVoiceFieldFill() {
  const [sttReady, setSttReady] = React.useState<boolean | null>(null)
  const recordingReady = isVoiceRecordingAvailable()
  const [activeFieldId, setActiveFieldId] = React.useState<string | null>(null)
  const [phase, setPhase] = React.useState<VoiceFieldPhase>('idle')
  const recorderRef = React.useRef<Awaited<ReturnType<typeof createVoiceRecorder>> | null>(null)

  React.useEffect(() => {
    void isSttModelInstalled().then(setSttReady)
  }, [])

  const ensureSttReady = React.useCallback(() => {
    if (!sttReady) {
      toast.error('Download Speech-to-text in Settings → Local AI first')
      return false
    }
    return true
  }, [sttReady])

  const cancelActive = React.useCallback(async () => {
    if (recorderRef.current?.isRecording()) {
      await recorderRef.current.cancel()
    }
    recorderRef.current = null
    setActiveFieldId(null)
    setPhase('idle')
  }, [])

  const ensureRecordingReady = React.useCallback(() => {
    if (!recordingReady) {
      toast.error('Rebuild the app to enable voice recording: cd apps/mobile && npm run android')
      return false
    }
    return true
  }, [recordingReady])

  const start = React.useCallback(
    async (fieldId: string) => {
      if (!ensureRecordingReady()) return false
      if (!ensureSttReady()) return false
      if (phase === 'transcribing') return false

      if (activeFieldId && activeFieldId !== fieldId) {
        await cancelActive()
      }

      if (recorderRef.current?.isRecording() && activeFieldId === fieldId) {
        return true
      }

      try {
        await prepareVoiceRecording()
        recorderRef.current = await createVoiceRecorder()
        await recorderRef.current.start()
        setActiveFieldId(fieldId)
        setPhase('recording')
        return true
      } catch (error) {
        toast.error(String(error))
        await cancelActive()
        return false
      }
    },
    [activeFieldId, cancelActive, ensureRecordingReady, ensureSttReady, phase]
  )

  const stop = React.useCallback(
    async (fieldId: string): Promise<string | null> => {
      if (activeFieldId !== fieldId || !recorderRef.current?.isRecording()) return null

      try {
        setPhase('transcribing')
        const uri = await recorderRef.current.stop()
        recorderRef.current = null
        setActiveFieldId(null)

        if (!uri) {
          toast.error('Recording failed — try again')
          return null
        }

        const text = await transcribeAudioFile(uri)
        if (!text.trim()) {
          toast.error('Could not understand the recording')
          return null
        }
        return text.trim()
      } catch (error) {
        toast.error(String(error))
        return null
      } finally {
        setPhase('idle')
      }
    },
    [activeFieldId]
  )

  const refresh = React.useCallback(
    async (fieldId: string) => {
      if (activeFieldId === fieldId) {
        await cancelActive()
      }
    },
    [activeFieldId, cancelActive]
  )

  const isFieldActive = React.useCallback(
    (fieldId: string) => activeFieldId === fieldId,
    [activeFieldId]
  )

  const isFieldRecording = React.useCallback(
    (fieldId: string) => activeFieldId === fieldId && phase === 'recording',
    [activeFieldId, phase]
  )

  const isFieldBusy = React.useCallback(
    (fieldId: string) =>
      activeFieldId === fieldId && (phase === 'recording' || phase === 'transcribing'),
    [activeFieldId, phase]
  )

  React.useEffect(() => () => void cancelActive(), [cancelActive])

  return {
    sttReady,
    recordingReady,
    phase,
    start,
    stop,
    refresh,
    cancelActive,
    isFieldActive,
    isFieldRecording,
    isFieldBusy,
  }
}

export function appendVoiceText(current: string, spoken: string) {
  const trimmed = spoken.trim()
  if (!trimmed) return current
  const base = current.trim()
  return base ? `${base} ${trimmed}` : trimmed
}
