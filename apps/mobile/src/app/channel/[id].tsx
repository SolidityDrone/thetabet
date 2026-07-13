import { ChatAvatar } from '@/components/pear/chat-avatar'
import { ChatMessageRow } from '@/components/pear/chat-message-row'
import { IdentityBadge } from '@/components/pear/identity-badge'
import { colors } from '@/constants/colors'
import { usePearChat } from '@/context/pear-chat'
import { useChatMessageTranslation } from '@/hooks/use-chat-message-translation'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import { filterChatMessages, isPearSystemMessage, mergeChatMessages, PEAR_PRESENCE_PREFIX } from '@/services/pear-message-utils'
import { ensureModelReady } from '@/services/qvac/qvac-client'
import { isQvacModelMarkedInstalled } from '@/services/qvac/qvac-model-manager'
import { loadQvacSettings } from '@/services/qvac/qvac-settings'
import { parseAskCommand, runTipsterAsk } from '@/services/tipster-notes/ask'
import { loadTipsterNotes } from '@/services/tipster-notes/storage'
import { getPolygonWalletAddress } from '@/services/wdk-address'
import type { PearMessage, PearOnlinePeer } from '@/types/pear'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { Share2, Users } from 'lucide-react-native'

export default function ChannelScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>()
  const channelId = Array.isArray(rawId) ? rawId[0] : rawId
  const insets = useSafeAreaInsets()
  const {
    ready,
    error,
    identity,
    channels,
    dms,
    getHistory,
    sendMessage,
    shareChannelKey,
    pingChannelPresence,
    getChannelOnline,
    ensureVaultSessionProof,
    onMessage,
    ensureStarted,
    refreshChannels,
  } = usePearChat()
  const [messages, setMessages] = useState<PearMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [shareVisible, setShareVisible] = useState(false)
  const [peerPubkey, setPeerPubkey] = useState('')
  const [onlinePeers, setOnlinePeers] = useState<PearOnlinePeer[]>([])
  const listRef = useRef<FlatList<PearMessage>>(null)
  const hasScrolledInitially = useRef(false)
  const { address } = useWalletPortfolio()
  const {
    targetLanguageLabel,
    toggleMessageTranslation,
    getDisplayText,
    isTranslating,
    isShowingTranslation,
  } = useChatMessageTranslation()

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated })
    })
  }, [])

  const channel = useMemo(() => {
    if (!channelId) return null
    return (
      channels.find((entry) => entry.id === channelId) ??
      dms.find((entry) => entry.id === channelId) ??
      null
    )
  }, [channels, dms, channelId])

  useEffect(() => {
    ensureStarted()
      .then(() => refreshChannels())
      .catch(() => {})
  }, [ensureStarted, refreshChannels])

  useEffect(() => {
    if (!ready || !channel || channel.kind !== 'vault') return

    ensureVaultSessionProof(channel).catch((sessionError) => {
      Alert.alert(
        'Vault chat sign-in',
        sessionError instanceof Error ? sessionError.message : String(sessionError)
      )
    })
  }, [channel, ensureVaultSessionProof, ready])

  useEffect(() => {
    if (!ready || !channelId || channel?.kind !== 'vault') return

    let active = true
    const refreshHistory = () => {
      getHistory(channelId)
        .then((history) => {
          if (active) {
            setMessages((current) =>
              mergeChatMessages(current, filterChatMessages(history))
            )
          }
        })
        .catch(() => {})
    }

    const timer = setInterval(refreshHistory, 12000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [channel?.kind, channelId, getHistory, ready])

  useEffect(() => {
    if (!ready || !channelId) return

    let active = true
    setLoading(true)

    getHistory(channelId)
      .then((history) => {
        if (active) {
          setMessages((current) =>
            mergeChatMessages(current, filterChatMessages(history))
          )
          setLoading(false)
        }
      })
      .catch((historyError) => {
        if (active) {
          Alert.alert('History error', String(historyError))
          setLoading(false)
        }
      })

    return onMessage((message) => {
      if (message.channelId?.toLowerCase() !== channelId?.toLowerCase()) return
      if (message.text?.startsWith(PEAR_PRESENCE_PREFIX)) return
      if (isPearSystemMessage(message.text)) return
      void getChannelOnline(channelId)
        .then((peers) => {
          if (active) setOnlinePeers(peers)
        })
        .catch(() => {})
      setMessages((current) => mergeChatMessages(current, [message]))
    })
  }, [ready, channelId, getHistory, getChannelOnline, onMessage])

  const lastMessageId = messages[messages.length - 1]?.id

  useEffect(() => {
    if (loading || !lastMessageId) return
    scrollToBottom(hasScrolledInitially.current)
    hasScrolledInitially.current = true
  }, [loading, lastMessageId, scrollToBottom])

  useEffect(() => {
    if (!ready || !channelId || channel?.kind !== 'vault') return

    let active = true

    const refreshPresence = async () => {
      try {
        const wallet = (await getPolygonWalletAddress()) ?? address ?? undefined
        const role =
          wallet && channel.tipsterAddress && wallet.toLowerCase() === channel.tipsterAddress.toLowerCase()
            ? 'owner'
            : 'investor'
        await pingChannelPresence(channelId, {
          wallet,
          role,
          label: identity?.onChainHandle ? `@${identity.onChainHandle}` : undefined,
        })
        const peers = await getChannelOnline(channelId)
        if (active) setOnlinePeers(peers)
      } catch (presenceError) {
        console.error('Vault presence refresh failed:', presenceError)
      }
    }

    void refreshPresence()
    const timer = setInterval(() => {
      void refreshPresence()
    }, 10000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [
    address,
    channel,
    channelId,
    getChannelOnline,
    identity?.onChainHandle,
    pingChannelPresence,
    ready,
  ])

  const onlineLabels = useMemo(() => {
    return onlinePeers.map((peer) => {
      if (peer.author?.startsWith('@')) return peer.author
      if (peer.wallet) return `${peer.wallet.slice(0, 6)}…${peer.wallet.slice(-4)}`
      if (peer.role === 'dev' || peer.role === 'console') return 'PC dev'
      return peer.author
    })
  }, [onlinePeers])

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.meta}>Starting Pear P2P worklet…</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    )
  }

  if (!channel) {
    return (
      <View style={styles.centered}>
        <Text style={styles.meta}>Channel not found</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    )
  }

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !channelId) return

    const ask = channel.kind === 'dm' ? parseAskCommand(text) : null

    setSending(true)
    try {
      if (ask && address) {
        if (ask.useResearch) {
          Alert.alert(
            'Use match AI for research',
            'Open a match and tap the sparkles icon for full web scout. /ask uses your tipster notes only.'
          )
          return
        }

        const settings = await loadQvacSettings()
        const installed = await isQvacModelMarkedInstalled(settings.modelPreset)
        if (!installed) {
          Alert.alert('Model required', 'Download the local AI model in Settings first.')
          return
        }

        await ensureModelReady()

        let matchTitle: string | undefined
        let league: string | undefined
        if (ask.gameId) {
          const store = await loadTipsterNotes(address)
          const entry = store.matches[ask.gameId]
          matchTitle = entry?.matchTitle
          league = entry?.league
        }

        const answer = await runTipsterAsk(address, ask.question, {
          gameId: ask.gameId,
          matchTitle,
          league,
        })

        const outbound = await sendMessage(channelId, answer)
        setMessages((current) => mergeChatMessages(current, [outbound]))
        setDraft('')
        return
      }

      const message = await sendMessage(channelId, text)
      setMessages((current) => mergeChatMessages(current, [message]))
      setDraft('')
    } catch (sendError) {
      Alert.alert('Send failed', String(sendError))
    } finally {
      setSending(false)
    }
  }

  const copyTopicKey = async () => {
    if (!channel) return
    await Clipboard.setStringAsync(channel.topicKey)
    Alert.alert('Copied', 'Topic key copied — share with fans to join this private channel.')
  }

  const copyCoreKey = async () => {
    if (!channel?.coreKey) return
    await Clipboard.setStringAsync(channel.coreKey)
    Alert.alert('Copied', 'Core key pair copied — paste as <coreKey> in console peer tool.')
  }

  const copyBypassTag = async () => {
    if (!channel?.devBypassTag) return
    await Clipboard.setStringAsync(channel.devBypassTag)
    Alert.alert(
      'Copied',
      'Dev bypass tag copied — use with pear:chat script on your PC for terminal testing.'
    )
  }

  const copyVaultAddress = async () => {
    if (!channel?.vaultAddress) return
    await Clipboard.setStringAsync(channel.vaultAddress)
    Alert.alert('Copied', 'Vault address copied for pear:chat --vault mode.')
  }

  const channelMeta =
    channel.kind === 'dm'
      ? `DM · ${channel.peerHandle ? '@' + channel.peerHandle : 'encrypted'}`
      : channel.kind === 'vault'
        ? `Vault chat · ${channel.vaultAddress?.slice(0, 10)}… · signed EOA messages`
        : `${channel.isPrivate ? 'Private' : 'Public'} · topic ${channel.topicKey.slice(0, 12)}…`

  const shareKey = async () => {
    if (!channel?.isPrivate || !channelId || !peerPubkey.trim()) return
    try {
      await shareChannelKey(channelId, peerPubkey.trim())
      setShareVisible(false)
      setPeerPubkey('')
      Alert.alert('Shared', 'Private channel key relay sent on your public channel.')
    } catch (error) {
      Alert.alert('Share failed', String(error))
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={12}
    >
      <View style={styles.header}>
        <ChatAvatar
          avatarData={channel.kind === 'dm' ? channel.peerAvatarData : undefined}
          seed={channel.peerPubkey || channel.id}
          size={42}
          accent={channel.kind === 'vault' ? colors.gold : undefined}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{channel.name}</Text>
          <Text style={styles.meta}>{channelMeta}</Text>
        </View>
        <IdentityBadge identity={identity} onChainHandle={identity?.onChainHandle} />
      </View>

      {channel.kind === 'vault' ? (
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolButton} onPress={copyTopicKey}>
            <Share2 size={16} color={colors.primary} />
            <Text style={styles.toolButtonText}>Copy topic</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolButton} onPress={copyVaultAddress}>
            <Text style={styles.toolButtonText}>Copy vault</Text>
          </TouchableOpacity>
          {channel.devBypassTag ? (
            <TouchableOpacity style={styles.toolButton} onPress={copyBypassTag}>
              <Text style={styles.toolButtonText}>Copy dev tag</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {channel.kind === 'vault' ? (
        <View style={styles.onlineBar}>
          <Users size={14} color={colors.gold} />
          <Text style={styles.onlineTitle}>
            Online · {onlinePeers.length}
          </Text>
          <Text style={styles.onlineList} numberOfLines={2}>
            {onlinePeers.length === 0
              ? 'No recent activity — send a message to appear online'
              : onlineLabels.join(' · ')}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => {
            if (lastMessageId) scrollToBottom(false)
          }}
          renderItem={({ item }) => {
            const isMine = item.isMine === true || item.authorPubkey === identity?.pubkey
            const isVaultOwner =
              channel.kind === 'vault' &&
              item.walletVerified !== false &&
              Boolean(item.wallet) &&
              item.wallet?.toLowerCase() === channel.tipsterAddress?.toLowerCase()

            return (
              <ChatMessageRow
                message={item}
                isMine={isMine}
                isVaultOwner={isVaultOwner}
                identityPubkey={identity?.pubkey}
                identityAvatarUri={identity?.avatarUri}
                identityAvatarData={identity?.avatarData}
                displayText={getDisplayText(item.id, item.text ?? '')}
                isTranslating={isTranslating(item.id)}
                isShowingTranslation={isShowingTranslation(item.id)}
                targetLanguageLabel={targetLanguageLabel}
                onPressMessage={() => void toggleMessageTranslation(item.id, item.text ?? '')}
              />
            )
          }}
        />
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder={
            channel.kind === 'dm'
              ? 'Message… or /ask goal or no goal?'
              : 'Message…'
          }
          placeholderTextColor={colors.textTertiary}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendDisabled]}
          onPress={handleSend}
          disabled={sending}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={shareVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Share private channel key</Text>
            <Text style={styles.meta}>
              Fan Pear pubkey (hex) or * to broadcast on your public channel
            </Text>
            <TextInput
              style={styles.input}
              placeholder="peer pubkey"
              placeholderTextColor={colors.textTertiary}
              value={peerPubkey}
              onChangeText={setPeerPubkey}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.toolButton} onPress={() => setShareVisible(false)}>
                <Text style={styles.toolButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendButton} onPress={shareKey}>
                <Text style={styles.sendText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  toolButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  onlineBar: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.cardDark,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineTitle: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  onlineList: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  messages: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.6,
  },
  sendText: {
    color: colors.black,
    fontWeight: '700',
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
})
