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
import type { PearChannel, PearMessage } from '@/types/pear'
import {
  Check,
  Lock,
  Megaphone,
  MessageCircle,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
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

type ChatRow = {
  channel: PearChannel
  lastMessage: string | null
  lastActivityAt: number
}

function buildChatRows(
  channels: PearChannel[],
  activity: Map<string, { ts: number; text: string }>,
): ChatRow[] {
  return channels.map((channel) => {
    const a = activity.get(channel.id)
    return {
      channel,
      lastMessage: a?.text ?? null,
      lastActivityAt: a?.ts ?? channel.createdAt,
    }
  })
}

function matchesQuery(channel: PearChannel, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    channel.name.toLowerCase().includes(q) ||
    (channel.peerHandle?.toLowerCase().includes(q) ?? false) ||
    (channel.kind === 'dm' ? 'direct message'.includes(q) : false) ||
    (channel.isPrivate ? 'private' : 'public').includes(q)
  )
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
    onMessage,
  } = usePearChat()
  const [joinVisible, setJoinVisible] = useState(false)
  const [dmVisible, setDmVisible] = useState(false)
  const [topicKey, setTopicKey] = useState('')
  const [channelName, setChannelName] = useState('')
  const [dmHandle, setDmHandle] = useState('')
  const [dmNote, setDmNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const activityRef = useRef<Map<string, { ts: number; text: string }>>(new Map())
  const [, forceTick] = useState(0)

  const ownedChannels = useMemo(
    () => channels.filter((c) => c.ownerPubkey === identity?.pubkey && c.kind !== 'dm'),
    [channels, identity?.pubkey],
  )

  // Live last-message / last-activity tracking (Telegram-style recency ordering).
  useEffect(() => {
    const unsub = onMessage((msg: PearMessage) => {
      activityRef.current.set(msg.channelId, { ts: msg.timestamp, text: msg.text })
      forceTick((n) => n + 1)
    })
    return unsub
  }, [onMessage])

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

  const rows = useMemo(() => {
    const unified = [...dms, ...ownedChannels]
    const withMeta = buildChatRows(unified, activityRef.current)
    const filtered = withMeta.filter((row) => matchesQuery(row.channel, query))
    return filtered.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  }, [dms, ownedChannels, query, ready, channels])

  const handleCreateChannel = async (isPrivate: boolean) => {
    setBusy(true)
    try {
      const label = isPrivate ? 'Private' : 'Public'
      const count = isPrivate
        ? ownedChannels.filter((c) => c.isPrivate).length
        : ownedChannels.filter((c) => !c.isPrivate).length
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
        <ScreenBackdrop />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Starting Pear P2P worklet…</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    )
  }

  const hasChannels = rows.length > 0
  const pending = contacts.pendingIncoming

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />
      <BrandHeader
        title="Channels"
        subtitle="Encrypted DMs · fan channels"
        compact
        right={<IdentityBadge identity={identity} onChainHandle={onChainHandle} />}
      />

      <View style={styles.searchRow}>
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')}>
            <X size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionChip, styles.actionPrimary]}
          onPress={() => (hasHandle ? setDmVisible(true) : router.push('/profile'))}
          disabled={busy}
        >
          <MessageCircle size={16} color={colors.onPrimary} />
          <Text style={styles.actionPrimaryText}>Message</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => handleCreateChannel(false)}
          disabled={busy}
        >
          <Megaphone size={16} color={colors.primary} />
          <Text style={styles.actionText}>Public</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => handleCreateChannel(true)}
          disabled={busy}
        >
          <Lock size={16} color={colors.primary} />
          <Text style={styles.actionText}>Private</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionChip} onPress={() => setJoinVisible(true)}>
          <Users size={16} color={colors.primary} />
          <Text style={styles.actionText}>Join</Text>
        </TouchableOpacity>
      </View>

      {!isHandleLoading && !hasHandle ? (
        <TouchableOpacity style={styles.identityCta} onPress={() => router.push('/profile')}>
          <Text style={styles.identityCtaText}>Set up your @handle in Profile to message tipsters</Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {pending.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Requests · {pending.length}</Text>
                <View style={styles.requestList}>
                  {pending.map((request) => (
                    <View key={request.id} style={styles.requestCard}>
                      <View style={styles.requestHead}>
                        <Text style={styles.requestTitle}>
                          {request.fromHandle ? `@${request.fromHandle}` : request.fromPubkey?.slice(0, 12)}
                        </Text>
                        {request.note ? <Text style={styles.requestNote}>{request.note}</Text> : null}
                      </View>
                      <View style={styles.requestActions}>
                        <TouchableOpacity
                          style={styles.declineBtn}
                          onPress={() => handleRespondRequest(request.id, false)}
                          disabled={busy}
                        >
                          <X size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.acceptBtn}
                          onPress={() => handleRespondRequest(request.id, true)}
                          disabled={busy}
                        >
                          <Check size={14} color={colors.onPrimary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>
                {query ? `${rows.length} result${rows.length === 1 ? '' : 's'}` : 'Chats'}
              </Text>
              <TouchableOpacity
                style={styles.newBtn}
                onPress={() => handleCreateChannel(false)}
                disabled={busy}
              >
                <Plus size={15} color={colors.primary} />
                <Text style={styles.newBtnText}>New</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        data={rows}
        keyExtractor={(row) => row.channel.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Couldn't load chats</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : !hasHandle ? (
            <View style={styles.emptyCard}>
              <MessageCircle size={26} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyText}>
                Register an @handle in Profile, then message another tipster or create a fan channel.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <MessageCircle size={26} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptyText}>
                {query
                  ? 'No chats match your search.'
                  : 'Message a registered @handle or create a channel to get started.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <ChannelListItem
            channel={item.channel}
            lastMessage={item.lastMessage}
            lastActivityAt={item.lastActivityAt}
            onPress={() => router.push(`/channel/${item.channel.id}`)}
          />
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
              <TouchableOpacity style={styles.modalCancel} onPress={() => setJoinVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleJoin} disabled={busy}>
                <Text style={styles.modalConfirmText}>Join</Text>
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
              <TouchableOpacity style={styles.modalCancel} onPress={() => setDmVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleSendDmRequest} disabled={busy}>
                <Text style={styles.modalConfirmText}>Send request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    flex: 1,
  },
  listContent: {
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
  identityCta: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: 10,
  },
  identityCtaText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: theme.spacing.lg,
    marginTop: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    padding: 0,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: theme.spacing.lg,
    marginBottom: 10,
  },
  actionChip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  actionPrimaryText: {
    color: colors.onPrimary,
    fontWeight: '800',
    fontSize: 12,
  },
  section: {
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    ...theme.typography.caption,
    color: colors.gold,
    fontSize: 11,
  },
  requestList: {
    gap: 8,
  },
  requestCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.card,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  requestHead: {
    flex: 1,
    gap: 2,
  },
  requestTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  requestNote: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  declineBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    marginTop: 4,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.neonMuted,
  },
  newBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 11,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderDark,
    marginHorizontal: 12,
  },
  emptyCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 22,
    gap: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
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
    fontWeight: '800',
  },
  modalHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  modalConfirm: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: colors.primary,
  },
  modalConfirmText: {
    color: colors.onPrimary,
    fontWeight: '800',
  },
})
