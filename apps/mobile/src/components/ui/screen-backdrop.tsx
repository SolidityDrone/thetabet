import { colors } from '@/constants/colors'
import { StyleSheet, View } from 'react-native'

/**
 * Ambient background — pure RN views (no native gradient module).
 * Avoids crashes when the dev client was not rebuilt after adding expo-linear-gradient.
 */
export function ScreenBackdrop() {
  return (
    <View style={styles.root} pointerEvents="none">
      <View style={styles.bandTop} />
      <View style={styles.bandMid} />
      <View style={styles.bandBottom} />
      <View style={styles.neonOrb} />
      <View style={styles.goldOrb} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  bandTop: {
    ...StyleSheet.absoluteFillObject,
    bottom: '55%',
    backgroundColor: '#0c1828',
  },
  bandMid: {
    ...StyleSheet.absoluteFillObject,
    top: '25%',
    bottom: '25%',
    backgroundColor: colors.background,
    opacity: 0.92,
  },
  bandBottom: {
    ...StyleSheet.absoluteFillObject,
    top: '60%',
    backgroundColor: '#061018',
    opacity: 0.85,
  },
  neonOrb: {
    position: 'absolute',
    top: -72,
    right: -48,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(124, 255, 79, 0.09)',
  },
  goldOrb: {
    position: 'absolute',
    bottom: 100,
    left: -64,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(232, 197, 71, 0.06)',
  },
})
