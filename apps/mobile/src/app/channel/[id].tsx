import { IdentityBadge } from '@/components/pear/identity-badge'
import { colors } from '@/constants/colors'
import { usePearChat } from '@/context/pear-chat'
import type { PearMessage } from '@/types/pear'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
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
import { Share2 } from 'lucide-react-native'

export default function ChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const {
    ready,
    identity,
    channels,
    getHistory,
    sendMessage,
    shareChannelKey,
    onMessage,
    ensureStarted,
  } = usePearChat()
  const [messages, setMessages] = useState<PearMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [shareVisible, setShareVisible] = useState(false)
  const [peerPubkey, setPeerPubkey] = useState('')

  const channel = useMemo(
    () => channels.find((entry) => entry.id === id) ?? null,
    [channels, id]
  )

  useEffect(() => {
    ensureStarted().catch(() => {})
  }, [ensureStarted])

  useEffect(() => {
    if (!ready || !id) return

    let active = true
    getHistory(id)
      .then((history) => {
        if (active) {
          setMessages(history.filter((message) => !message.text?.startsWith('__KEY_SHARE__:')))
          setLoading(false)
        }
      })
      .catch((error) => {
        Alert.alert('History error', String(error))
        setLoading(false)
      })

    return onMessage((message) => {
      if (message.channelId !== id) return
      if (message.text?.startsWith('__KEY_SHARE__:')) return
      setMessages((current) => {
        if (current.some((entry) => entry.id === message.id)) return current
        return [...current, message]
      })
    })
  }, [ready, id, getHistory, onMessage])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || !id) return

    setSending(true)
    try {
      const message = await sendMessage(id, text)
      setMessages((current) => [...current, message])
      setDraft('')
    } catch (error) {
      Alert.alert('Send failed', String(error))
    } finally {
      setSending(false)
    }
  }

  const copyTopicKey = async () => {
    if (!channel) return
    await Clipboard.setStringAsync(channel.topicKey)
    Alert.alert('Copied', 'Topic key copied — share with fans to join this private channel.')
  }

  const shareKey = async () => {
    if (!channel?.isPrivate || !id || !peerPubkey.trim()) return
    try {
      await shareChannelKey(id, peerPubkey.trim())
      setShareVisible(false)
      setPeerPubkey('')
      Alert.alert('Shared', 'Private channel key relay sent on your public channel.')
    } catch (error) {
      Alert.alert('Share failed', String(error))
    }
  }

  if (!channel) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.meta}>Loading channel…</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={12}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{channel.name}</Text>
          <Text style={styles.meta}>
            {channel.isPrivate ? 'Private' : 'Public'} · topic {channel.topicKey.slice(0, 12)}…
          </Text>
        </View>
        <IdentityBadge identity={identity} />
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolButton} onPress={copyTopicKey}>
          <Share2 size={16} color={colors.primary} />
          <Text style={styles.toolButtonText}>Copy topic</Text>
        </TouchableOpacity>
        {channel.isPrivate ? (
          <TouchableOpacity style={styles.toolButton} onPress={() => setShareVisible(true)}>
            <Text style={styles.toolButtonText}>Share key</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messages}
          renderItem={({ item }) => {
            const isMine = item.authorPubkey === identity?.pubkey
            return (
              <View style={[styles.bubble, isMine ? styles.mine : styles.theirs]}>
                <Text style={[styles.author, isMine ? styles.authorMine : styles.authorTheirs]}>
                  {item.author}
                </Text>
                <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>
                  {item.text}
                </Text>
              </View>
            )
          }}
        />
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          placeholder="Message…"
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
  messages: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  bubble: {
    borderRadius: 14,
    padding: 12,
    maxWidth: '85%',
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
  },
  author: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  authorMine: {
    color: colors.black,
  },
  authorTheirs: {
    color: colors.textSecondary,
  },
  text: {
    lineHeight: 20,
  },
  textMine: {
    color: colors.black,
  },
  textTheirs: {
    color: colors.text,
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
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
