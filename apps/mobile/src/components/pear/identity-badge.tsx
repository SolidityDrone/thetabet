import { colors } from '@/constants/colors'
import type { PearIdentity } from '@/types/pear'
import { StyleSheet, Text, View } from 'react-native'

type Props = {
  identity: PearIdentity | null
  onChainHandle?: string | null
}

export function IdentityBadge({ identity, onChainHandle }: Props) {
  if (!identity && !onChainHandle) return null

  const label = onChainHandle || identity?.onChainHandle

  return (
    <View style={styles.badge}>
      <Text style={styles.handle}>{label ? `@${label}` : 'Pear'}</Text>
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
  },
  handle: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
})
