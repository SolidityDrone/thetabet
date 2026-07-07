import { ChannelListItem } from '@/components/pear/channel-list-item'
import { IdentityBadge } from '@/components/pear/identity-badge'
import { BrandHeader } from '@/components/ui/brand-header'
import { PitchBackdrop } from '@/components/ui/pitch-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { usePearChat } from '@/context/pear-chat'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import type { PearChannel } from '@/types/pear'
import { Lock, Megaphone, Plus, Users } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function filterUserChannels(channels: PearChannel[], pubkey?: string | null) {
  if (!pubkey) return { publicChannels: [], privateChannels: [] }

  const owned = channels.filter((channel) => channel.ownerPubkey === pubkey)
  return {
    publicChannels: owned.filter((channel) => !channel.isPrivate),
    privateChannels: owned.filter((channel) => channel.isPrivate),
  }
}

export default function ChannelsScreen() {
  const insets = useSafeAreaInsets()
  const router = useDebouncedNavigation()
  const { ready, error, identity, channels, createChannel, joinChannel, ensureStarted } =
    usePearChat()
  const [joinVisible, setJoinVisible] = useState(false)
  const [topicKey, setTopicKey] = useState('')
  const [channelName, setChannelName] = useState('')
  const [busy, setBusy] = useState(false)

  const { publicChannels, privateChannels } = useMemo(
    () => filterUserChannels(channels, identity?.pubkey),
    [channels, identity?.pubkey]
  )

  useEffect(() => {
    ensureStarted().catch((bootError) => {
      console.error('Pear chat failed to start:', bootError)
    })
  }, [ensureStarted])

  const handleCreateChannel = async (isPrivate: boolean) => {
    setBusy(true)
    try {
      const label = isPrivate ? 'Private' : 'Public'
      const count = isPrivate ? privateChannels.length : publicChannels.length
      const channel = await createChannel(`${label} ${count + 1}`, isPrivate)
      router.push(`/channel/${channel.id}`)
    } catch (createError) {
      Alert.alert('Create failed', String(createError))
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!topicKey.trim()) {
      Alert.alert('Topic required', 'Paste the 64-char hex topic key from a tipster.')
      return
    }

    setBusy(true)
    try {
      const result = await joinChannel(topicKey.trim(), channelName.trim() || undefined)
      setJoinVisible(false)
      setTopicKey('')
      setChannelName('')
      router.push(`/channel/${result.channel.id}`)
    } catch (joinError) {
      Alert.alert('Join failed', String(joinError))
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Starting Pear P2P worklet…</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
    >
      <PitchBackdrop />
      <BrandHeader
        title="Channels"
        subtitle="Public discovery & private fan chat"
        right={<IdentityBadge identity={identity} />}
      />

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => handleCreateChannel(false)}
          disabled={busy}
        >
          <Megaphone size={18} color={colors.black} />
          <Text style={styles.primaryButtonText}>Public</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => handleCreateChannel(true)}
          disabled={busy}
        >
          <Lock size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Private</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setJoinVisible(true)}>
          <Users size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Join</Text>
        </TouchableOpacity>
      </View>

      <ChannelSection
        title="Public channels"
        emptyText="No public channel yet. Create one for discovery and announcements."
        channels={publicChannels}
        onOpen={(id) => router.push(`/channel/${id}`)}
      />

      <ChannelSection
        title="Private channels"
        emptyText="No private channel yet. Create one for token-gated fan chat."
        channels={privateChannels}
        onOpen={(id) => router.push(`/channel/${id}`)}
      />

      <Modal visible={joinVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join private channel</Text>
            <TextInput
              style={styles.input}
              placeholder="64-char topic key (hex)"
              placeholderTextColor={colors.textTertiary}
              value={topicKey}
              onChangeText={setTopicKey}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Display name (optional)"
              placeholderTextColor={colors.textTertiary}
              value={channelName}
              onChangeText={setChannelName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setJoinVisible(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleJoin} disabled={busy}>
                <Text style={styles.primaryButtonText}>Join</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

function ChannelSection({
  title,
  emptyText,
  channels,
  onOpen,
}: {
  title: string
  emptyText: string
  channels: PearChannel[]
  onOpen: (id: string) => void
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {channels.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {channels.map((channel) => (
            <ChannelListItem
              key={channel.id}
              channel={channel}
              onPress={() => onOpen(channel.id)}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  header: {
    paddingVertical: 16,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: theme.radius.sharp,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryButton: {
    borderColor: colors.borderNeon,
    borderWidth: 1,
    borderRadius: theme.radius.sharp,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardDark,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
    gap: 10,
  },
  sectionTitle: {
    ...theme.typography.caption,
    color: colors.gold,
    fontSize: 11,
  },
  list: {
    gap: 10,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 22,
    paddingVertical: 8,
  },
  loadingText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'monospace',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
})
