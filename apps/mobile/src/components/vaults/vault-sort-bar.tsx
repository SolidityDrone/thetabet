import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { VAULT_SORT_OPTIONS, type VaultSortKey } from '@/types/vault-discovery'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  sortKey: VaultSortKey
  onChange: (sortKey: VaultSortKey) => void
}

export function VaultSortBar({ sortKey, onChange }: Props) {
  const active = VAULT_SORT_OPTIONS.find((option) => option.key === sortKey)

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {VAULT_SORT_OPTIONS.map((option) => {
          const selected = option.key === sortKey
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(option.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      {active ? <Text style={styles.hint}>{active.hint}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 8,
  },
  row: {
    gap: 8,
    paddingRight: theme.spacing.lg,
  },
  chip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  chipTextSelected: {
    color: colors.primary,
  },
  hint: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
  },
})
