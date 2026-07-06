import { ChannelListItem } from '@/components/pear/channel-list-item'
import { IdentityBadge } from '@/components/pear/identity-badge'
import { colors } from '@/constants/colors'
import { usePearChat } from '@/context/pear-chat'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { Plus, Users } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ChannelsScreen() {
  const insets = useSafeAreaInsets()
  const router = useDebouncedNavigation()
  const { ready, error, identity, channels, createChannel, joinChannel, ensureStarted } = usePearChat()
  const [joinVisible, setJoinVisible] = useState(false)
  const [topicKey, setTopicKey] = useState('')
  const [channelName, setChannelName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ensureStarted().catch((bootError) => {
      console.error('Pear chat failed to start:', bootError)
    })
  }, [ensureStarted])

  const handleCreateChannel = () => {
    Alert.alert('New channel', 'Choose channel visibility', [
      {
        text: 'Public',
        onPress: async () => {
          setBusy(true)
          try {
            const channel = await createChannel(`Public ${channels.length + 1}`, false)
            router.push(`/channel/${channel.id}`)
          } catch (createError) {
            Alert.alert('Create failed', String(createError))
          } finally {
            setBusy(false)
          }
        },
      },
      {
        text: 'Private',
        onPress: async () => {
          setBusy(true)
          try {
            const channel = await createChannel(`Private ${channels.length + 1}`, true)
            router.push(`/channel/${channel.id}`)
          } catch (createError) {
            Alert.alert('Create failed', String(createError))
          } finally {
            setBusy(false)
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>ThetaBet Channels</Text>
          <Text style={styles.subtitle}>Keet-style P2P chat on Hyperswarm</Text>
        </View>
        <IdentityBadge identity={identity} />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleCreateChannel} disabled={busy}>
          <Plus size={18} color={colors.black} />
          <Text style={styles.primaryButtonText}>Create</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setJoinVisible(true)}>
          <Users size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Join by key</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No channels yet. Become a tipster or join one with a topic key.
          </Text>
        }
        renderItem={({ item }) => (
          <ChannelListItem channel={item} onPress={() => router.push(`/channel/${item.id}`)} />
        )}
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
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
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: colors.black,
    fontWeight: '700',
  },
  secondaryButton: {
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 48,
    lineHeight: 22,
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
