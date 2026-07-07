import { theme } from '@/constants/theme'
import { Platform, StatusBar } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ANDROID_MIN_STATUS_BAR = 28

/** Reliable top padding below the system status bar (clock, battery, etc.). */
export function useScreenTopPadding(enabled = true, extra = theme.spacing.sm) {
  const insets = useSafeAreaInsets()
  if (!enabled) return 0

  const androidFallback =
    Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, ANDROID_MIN_STATUS_BAR) : 0

  return Math.max(insets.top, androidFallback) + extra
}
