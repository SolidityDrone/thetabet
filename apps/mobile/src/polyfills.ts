import 'react-native-get-random-values'
import { Buffer } from '@craftzdog/react-native-buffer'
import { requireNativeModule } from 'expo-modules-core'

if (typeof global.Buffer === 'undefined') {
  // @ts-expect-error react-native Buffer shim
  global.Buffer = Buffer
}

// Expo dev tools call keep-awake before the Android activity is ready — swallow that race.
try {
  const ExpoKeepAwake = requireNativeModule('ExpoKeepAwake')
  const nativeActivate = ExpoKeepAwake.activate?.bind(ExpoKeepAwake)
  if (nativeActivate) {
    ExpoKeepAwake.activate = async (tag: string) => {
      try {
        await nativeActivate(tag)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error ?? '')
        if (!msg.includes('Unable to activate keep awake')) throw error
      }
    }
  }
} catch {
  // Keep-awake native module not linked (e.g. web) — ignore.
}
