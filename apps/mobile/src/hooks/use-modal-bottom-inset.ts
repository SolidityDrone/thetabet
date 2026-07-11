import { theme } from '@/constants/theme'
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Bottom inset for fullscreen Modals on edge-to-edge Android.
 * Modal windows often report insets.bottom as 0 while OS nav buttons still overlay.
 */
export function useModalBottomInset() {
  const insets = useSafeAreaInsets()

  if (Platform.OS === 'ios') {
    return Math.max(insets.bottom, 20)
  }

  // Edge-to-edge Android: modal insets are often 0 — match tab bar clearance.
  const tabBarClearance = Math.max(insets.bottom, 12)
  return Math.max(insets.bottom, tabBarClearance + theme.tabBar.height, 20)
}
