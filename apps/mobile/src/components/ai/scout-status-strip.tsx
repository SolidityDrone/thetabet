import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { SCOUTS, type ScoutId, type ScoutResult } from '@/services/qvac/match-scout'
import { Check } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'

type Props = {
  results: Partial<Record<ScoutId, ScoutResult>>
  activeScout?: ScoutId | null
  busy?: boolean
}

/** Compact scout status — dots only, no fake scores. */
export function ScoutStatusStrip({ results, activeScout, busy }: Props) {
  const doneCount = SCOUTS.filter((s) => results[s.id]).length

  return (
    <View style={styles.wrap}>
      <Text style={styles.meta}>
        {doneCount}/{SCOUTS.length}
      </Text>
      <View style={styles.row}>
        {SCOUTS.map((spec) => {
          const done = Boolean(results[spec.id])
          const active = busy && activeScout === spec.id
          return (
            <View
              key={spec.id}
              style={[
                styles.dot,
                done && styles.dotDone,
                active && styles.dotActive,
              ]}
            >
              {done ? (
                <Check size={8} color={colors.onPrimary} />
              ) : (
                <View style={[styles.dotInner, active && styles.dotInnerActive]} />
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  meta: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  dotDone: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  dotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textTertiary,
  },
  dotInnerActive: {
    backgroundColor: colors.primary,
  },
})
