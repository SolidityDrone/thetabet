import { colors } from '@/constants/colors'
import type { PearIdentity } from '@/types/pear'
import { StyleSheet, Text, View } from 'react-native'

export function IdentityBadge({ identity }: { identity: PearIdentity | null }) {
  if (!identity) return null

  return (
    <View style={styles.badge}>
      <Text style={styles.label}>Pear ID</Text>
      <Text style={styles.handle}>{identity.handle}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  handle: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
})
