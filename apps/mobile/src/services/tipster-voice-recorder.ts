import { requireOptionalNativeModule } from 'expo-modules-core'
import * as FileSystem from 'expo-file-system'
import { Platform } from 'react-native'

export type VoiceRecorderHandle = {
  start: () => Promise<void>
  stop: () => Promise<string | null>
  cancel: () => Promise<void>
  isRecording: () => boolean
}

type ExpoAudioNativeModule = {
  AudioRecorder: new (options: Record<string, unknown>) => {
    prepareToRecordAsync: () => Promise<void>
    record: () => void
    stop: () => Promise<void>
    uri: string | null
  }
  setAudioModeAsync: (mode: Record<string, unknown>) => Promise<void>
  requestRecordingPermissionsAsync: () => Promise<{ granted: boolean }>
}

const NATIVE_REBUILD_MESSAGE =
  'Voice recording needs a native rebuild. Run: cd apps/mobile && npm run android'

let recordingConstantsPromise: Promise<
  typeof import('expo-audio/build/RecordingConstants')
> | null = null

function getExpoAudioNativeModule(): ExpoAudioNativeModule {
  const native = requireOptionalNativeModule<ExpoAudioNativeModule>('ExpoAudio')
  if (!native) {
    throw new Error(NATIVE_REBUILD_MESSAGE)
  }
  return native
}

async function loadRecordingConstants() {
  if (!recordingConstantsPromise) {
    recordingConstantsPromise = import('expo-audio/build/RecordingConstants')
  }
  return recordingConstantsPromise
}

export function isVoiceRecordingAvailable(): boolean {
  return Boolean(requireOptionalNativeModule('ExpoAudio'))
}

export async function requestMicrophonePermission(): Promise<boolean> {
  const { requestRecordingPermissionsAsync } = getExpoAudioNativeModule()
  const status = await requestRecordingPermissionsAsync()
  return status.granted
}

export async function prepareVoiceRecording(): Promise<void> {
  const { setAudioModeAsync } = getExpoAudioNativeModule()
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  })
}

export async function createVoiceRecorder(): Promise<VoiceRecorderHandle> {
  const AudioModule = getExpoAudioNativeModule()
  const { RecordingPresets } = await loadRecordingConstants()

  const granted = await requestMicrophonePermission()
  if (!granted) {
    throw new Error('Microphone permission is required to record hints.')
  }

  await prepareVoiceRecording()

  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY)
  let recording = false

  return {
    isRecording: () => recording,
    start: async () => {
      await recorder.prepareToRecordAsync()
      recorder.record()
      recording = true
    },
    stop: async () => {
      if (!recording) return null
      await recorder.stop()
      recording = false
      const uri = recorder.uri
      if (!uri) return null
      if (Platform.OS === 'android') {
        const info = await FileSystem.getInfoAsync(uri)
        if (!info.exists || (info.size ?? 0) <= 0) return null
      }
      return uri
    },
    cancel: async () => {
      if (!recording) return
      try {
        await recorder.stop()
      } catch {
        // ignore
      }
      recording = false
    },
  }
}
