import { ChannelListItem } from '@/components/pear/channel-list-item'
import { IdentityBadge } from '@/components/pear/identity-badge'
import { BrandHeader } from '@/components/ui/brand-header'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { usePearChat } from '@/context/pear-chat'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useOnChainHandle } from '@/hooks/use-on-chain-handle'
import { useScreenTopPadding } from '@/hooks/use-screen-top-padding'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import type { PearChannel } from '@/types/pear'
import { Lock, Megaphone, MessageCircle, Users } from 'lucide-react-native'
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

function filterUserChannels(channels: PearChannel[], pubkey?: string | null) {
  if (!pubkey) return { publicChannels: [], privateChannels: [] }

  const owned = channels.filter(
    (channel) => channel.ownerPubkey === pubkey && channel.kind !== 'dm'
  )
  return {
    publicChannels: owned.filter((channel) => !channel.isPrivate),
    privateChannels: owned.filter((channel) => channel.isPrivate),
  }
}

export default function ChannelsScreen() {
  const topPadding = useScreenTopPadding()
  const router = useDebouncedNavigation()
  const { address } = useWalletPortfolio()
  const { handle: onChainHandle, hasHandle, isLoading: isHandleLoading } = useOnChainHandle(address)
  const {
    ready,
    error,
    identity,
    channels,
    contacts,
    dms,
    createChannel,
    joinChannel,
    syncOnChainPresence,
    sendContactRequest,
    respondContactRequest,
    ensureStarted,
    refreshContacts,
    onContactsChanged,
  } = usePearChat()
  const [joinVisible, setJoinVisible] = useState(false)
  const [dmVisible, setDmVisible] = useState(false)
  const [topicKey, setTopicKey] = useState('')
  const [channelName, setChannelName] = useState('')
  const [dmHandle, setDmHandle] = useState('')
  const [dmNote, setDmNote] = useState('')
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

  useEffect(() => {
    if (!ready) return
    return onContactsChanged(() => {
      void refreshContacts()
    })
  }, [onContactsChanged, ready, refreshContacts])

  useEffect(() => {
    if (!ready || !hasHandle || !onChainHandle || !address) return
    void syncOnChainPresence(onChainHandle, address).catch((syncError) => {
      console.error('Pear presence sync failed:', syncError)
    })
  }, [address, hasHandle, onChainHandle, ready, syncOnChainPresence])

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

  const handleSendDmRequest = async () => {
    if (!hasHandle) {
      Alert.alert('Set up your @handle', 'Register your tipster name in Profile before messaging others.')
      router.push('/profile')
      return
    }

    if (!dmHandle.trim()) {
      Alert.alert('Handle required', 'Enter the on-chain @handle you want to message.')
      return
    }

    setBusy(true)
    try {
      await sendContactRequest(dmHandle.trim(), dmNote.trim() || undefined)
      setDmVisible(false)
      setDmHandle('')
      setDmNote('')
      Alert.alert('Request sent', 'They must accept before you can chat.')
    } catch (requestError) {
      Alert.alert('Request failed', String(requestError))
    } finally {
      setBusy(false)
    }
  }

  const handleRespondRequest = async (requestId: string, accept: boolean) => {
    setBusy(true)
    try {
      await respondContactRequest(requestId, accept)
    } catch (respondError) {
      Alert.alert('Could not respond', String(respondError))
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <View style={[styles.centered, { paddingTop: topPadding }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Starting Pear P2P worklet…</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenBackdrop />
      <BrandHeader
        title="Channels"
        subtitle="On-chain @handles · encrypted DMs · fan channels"
        right={<IdentityBadge identity={identity} onChainHandle={onChainHandle} />}
      />

      <View style={styles.identityCard}>
        {isHandleLoading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : hasHandle && onChainHandle ? (
          <>
            <Text style={styles.identityLabel}>Your on-chain identity</Text>
            <Text style={styles.identityHandle}>@{onChainHandle}</Text>
            <Text style={styles.identityHint}>
              Unique on Polygon — others message this @handle. Stay in the app to receive DMs.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.identityLabel}>No @handle yet</Text>
            <Text style={styles.identityHint}>
              Register your tipster name in Profile. On-chain handles are unique and used for chat.
            </Text>
            <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/profile')}>
              <Text style={styles.linkButtonText}>Set up in Profile</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, !hasHandle && styles.buttonDisabled]}
          onPress={() => (hasHandle ? setDmVisible(true) : router.push('/profile'))}
          disabled={busy}
        >
          <MessageCircle size={18} color={colors.onPrimary} />
          <Text style={styles.primaryButtonText}>Message @handle</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => handleCreateChannel(false)}
          disabled={busy}
        >
          <Megaphone size={18} color={colors.primary} />
          <Text style={styles.secondaryButtonText}>Public</Text>
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

      {contacts.pendingIncoming.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact requests</Text>
          <View style={styles.list}>
            {contacts.pendingIncoming.map((request) => (
              <View key={request.id} style={styles.requestCard}>
                <Text style={styles.requestTitle}>
                  {request.fromHandle ? `@${request.fromHandle}` : request.fromPubkey?.slice(0, 12)}
                </Text>
                {request.note ? <Text style={styles.requestNote}>{request.note}</Text> : null}
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => handleRespondRequest(request.id, false)}
                    disabled={busy}
                  >
                    <Text style={styles.secondaryButtonText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => handleRespondRequest(request.id, true)}
                    disabled={busy}
                  >
                    <Text style={styles.primaryButtonText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <ChannelSection
        title="Private DMs"
        emptyText="No accepted DMs yet. Message a registered @handle and wait for accept."
        channels={dms}
        onOpen={(id) => router.push(`/channel/${id}`)}
      />

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

      <Modal visible={dmVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Message @handle</Text>
            <Text style={styles.modalHint}>
              Must be a registered on-chain tipster handle. They need to be online to receive the request.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="@handle"
              placeholderTextColor={colors.textTertiary}
              value={dmHandle}
              onChangeText={setDmHandle}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Optional note"
              placeholderTextColor={colors.textTertiary}
              value={dmNote}
              onChangeText={setDmNote}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setDmVisible(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSendDmRequest} disabled={busy}>
                <Text style={styles.primaryButtonText}>Send request</Text>
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
  identityCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.cardDark,
    padding: 14,
    gap: 6,
    marginBottom: 16,
  },
  identityLabel: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  identityHandle: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  identityHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  linkButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  linkButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
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
  buttonDisabled: {
    opacity: 0.7,
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
  requestCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.card,
    padding: 12,
    gap: 8,
  },
  requestTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  requestNote: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
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
