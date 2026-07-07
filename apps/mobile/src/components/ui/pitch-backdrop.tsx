import { colors } from '@/constants/colors'
import { StyleSheet, View } from 'react-native'

/** Subtle pitch-line texture for screen backgrounds */
export function PitchBackdrop() {
  return (
    <View style={styles.root} pointerEvents="none">
      <View style={[styles.line, { top: '18%' }]} />
      <View style={[styles.line, { top: '42%' }]} />
      <View style={[styles.line, { top: '66%' }]} />
      <View style={styles.centerCircle} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.pitchLine,
  },
  centerCircle: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: colors.pitchStripe,
  },
})
