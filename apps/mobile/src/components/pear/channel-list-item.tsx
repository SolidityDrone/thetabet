import { colors } from '@/constants/colors'
import type { PearChannel } from '@/types/pear'
import { Lock, Megaphone } from 'lucide-react-native'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  channel: PearChannel
  onPress: () => void
}

export function ChannelListItem({ channel, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.iconWrap}>
        {channel.isPrivate ? (
          <Lock size={18} color={colors.primary} />
        ) : (
          <Megaphone size={18} color={colors.primary} />
        )}
      </View>
      <View style={styles.content}>
        <Text style={styles.name}>{channel.name}</Text>
        <Text style={styles.meta}>
          {channel.isPrivate ? 'Private P2P' : 'Public'} · {channel.id}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tintedBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
  },
})
