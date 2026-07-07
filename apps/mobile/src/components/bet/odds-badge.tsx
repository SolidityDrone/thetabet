import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { formatAzuroOddsDisplay } from '@/config/azuro'
import { StyleSheet, Text, View } from 'react-native'

type Props = {
  odds: string
  selected?: boolean
}

export function OddsBadge({ odds, selected = false }: Props) {
  return (
    <View style={[styles.badge, selected && styles.badgeSelected]}>
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {formatAzuroOddsDisplay(odds)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
  },
  badgeSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  label: {
    ...theme.typography.odds,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  labelSelected: {
    color: colors.primary,
  },
})
