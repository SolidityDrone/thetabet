import { ChatAvatar } from '@/components/pear/chat-avatar'
import { colors } from '@/constants/colors'
import type { PearMessage } from '@/types/pear'
import { Crown } from 'lucide-react-native'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

type Props = {
  message: PearMessage
  isMine: boolean
  isVaultOwner: boolean
  identityPubkey?: string
  identityAvatarUri?: string
  identityAvatarData?: string
  displayText: string
  isTranslating: boolean
  isShowingTranslation: boolean
  targetLanguageLabel: string
  onPressMessage: () => void
}

export function ChatMessageRow({
  message,
  isMine,
  isVaultOwner,
  identityPubkey,
  identityAvatarUri,
  identityAvatarData,
  displayText,
  isTranslating,
  isShowingTranslation,
  targetLanguageLabel,
  onPressMessage,
}: Props) {
  const walletLabel = message.wallet
    ? `${message.wallet.slice(0, 6)}…${message.wallet.slice(-4)}`
    : message.gateBypass
      ? 'dev bypass'
      : null

  return (
    <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
      {!isMine ? (
        <ChatAvatar
          avatarData={message.avatarData}
          seed={message.authorPubkey}
          size={34}
          accent={isVaultOwner ? colors.gold : undefined}
        />
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.bubble,
          isMine ? styles.mine : styles.theirs,
          isVaultOwner && styles.ownerBubble,
          pressed && styles.bubblePressed,
          isShowingTranslation && styles.bubbleTranslated,
        ]}
        onPress={onPressMessage}
        disabled={isTranslating}
        accessibilityRole="button"
        accessibilityLabel={
          isShowingTranslation ? 'Show original message' : `Translate message to ${targetLanguageLabel}`
        }
      >
        <View style={styles.authorRow}>
          {isVaultOwner ? <Crown size={12} color={colors.text} /> : null}
          <Text
            style={[
              styles.author,
              isMine ? styles.authorMine : styles.authorTheirs,
              isVaultOwner && styles.ownerAuthor,
            ]}
          >
            {message.author}
            {isVaultOwner ? ' · Vault owner' : ''}
            {walletLabel ? ` · ${walletLabel}` : ''}
            {message.walletVerified === false ? ' · unverified' : ''}
          </Text>
        </View>

        <View style={styles.textRow}>
          {isTranslating ? (
            <ActivityIndicator
              size="small"
              color={isMine ? colors.black : colors.primary}
              style={styles.translateSpinner}
            />
          ) : null}
          <Text
            style={[
              styles.text,
              isVaultOwner ? styles.ownerText : isMine ? styles.textMine : styles.textTheirs,
              isTranslating && styles.textLoading,
            ]}
          >
            {displayText}
          </Text>
        </View>

        {isShowingTranslation ? (
          <Text
            style={[
              styles.translationBadge,
              isMine ? styles.translationBadgeMine : styles.translationBadgeTheirs,
            ]}
          >
            {targetLanguageLabel} · tap for original
          </Text>
        ) : null}

        <Text
          style={[
            styles.messageTime,
            isVaultOwner ? styles.ownerMessageTime : isMine ? styles.messageTimeMine : null,
          ]}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </Pressable>

      {isMine ? (
        <ChatAvatar
          avatarUri={identityAvatarUri}
          avatarData={identityAvatarData || message.avatarData}
          seed={identityPubkey || message.authorPubkey}
          size={34}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    borderRadius: 14,
    padding: 12,
    maxWidth: '85%',
  },
  bubblePressed: {
    opacity: 0.92,
  },
  bubbleTranslated: {
    borderWidth: 1,
    borderColor: colors.borderNeon,
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
  ownerBubble: {
    backgroundColor: colors.goldMuted,
    borderColor: colors.gold,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  ownerAuthor: {
    color: colors.text,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  translateSpinner: {
    marginTop: 2,
  },
  text: {
    lineHeight: 20,
    flex: 1,
  },
  textLoading: {
    opacity: 0.65,
  },
  ownerText: {
    color: colors.text,
  },
  textMine: {
    color: colors.black,
  },
  textTheirs: {
    color: colors.text,
  },
  translationBadge: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.2,
  },
  translationBadgeMine: {
    color: colors.black,
    opacity: 0.65,
  },
  translationBadgeTheirs: {
    color: colors.primary,
  },
  messageTime: {
    color: colors.textTertiary,
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageTimeMine: {
    color: colors.black,
    opacity: 0.65,
  },
  ownerMessageTime: {
    color: colors.textSecondary,
  },
})
