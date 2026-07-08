import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import type { PearChannel } from '@/types/pear'
import { Lock, Megaphone, User } from 'lucide-react-native'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  channel: PearChannel
  lastMessage?: string | null
  lastActivityAt?: number
  onPress: () => void
}

function timeAgo(ts?: number): string | null {
  if (!ts || !Number.isFinite(ts)) return null
  const diff = Date.now() - ts
  if (diff < 60_000) return 'now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function avatarVisual(channel: PearChannel): { icon: React.ReactNode; bg: string } {
  if (channel.kind === 'dm') {
    return { icon: <User size={20} color={colors.gold} />, bg: colors.goldMuted }
  }
  if (channel.isPrivate) {
    return { icon: <Lock size={20} color={colors.primary} />, bg: colors.neonMuted }
  }
  return { icon: <Megaphone size={20} color={colors.primary} />, bg: colors.neonStrong }
}

function displayName(channel: PearChannel): string {
  if (channel.kind === 'dm') {
    return channel.peerHandle ? `@${channel.peerHandle}` : 'Direct message'
  }
  return channel.name
}

export function ChannelListItem({ channel, lastMessage, lastActivityAt, onPress }: Props) {
  const { icon, bg } = avatarVisual(channel)
  const time = timeAgo(lastActivityAt ?? channel.createdAt)
  const preview = lastMessage ?? (channel.kind === 'dm' ? 'Encrypted P2P' : channel.isPrivate ? 'Private channel' : 'Public channel')

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: bg }]}>{icon}</View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName(channel)}
          </Text>
          <View style={styles.metaRight}>
            {channel.isPrivate ? <Lock size={11} color={colors.textTertiary} /> : null}
            {time ? <Text style={styles.time}>{time}</Text> : null}
          </View>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  time: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  preview: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
})
