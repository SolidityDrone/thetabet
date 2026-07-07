import { theme } from '@/constants/theme'
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Total tab bar height including Android/iOS home indicator inset. */
export function useTabBarHeight() {
  const insets = useSafeAreaInsets()
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0)
  return theme.tabBar.height + bottomInset
}
