import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useVaultInvestorChat } from '@/hooks/use-vault-investor-chat'
import type { IndexedVault } from '@/types/indexed-vault'
import { MessageCircle } from 'lucide-react-native'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  vault: IndexedVault
  walletAddress?: string | null
  isTipster: boolean
  hasPosition: boolean
}

export function VaultInvestorChatButton({
  vault,
  walletAddress,
  isTipster,
  hasPosition,
}: Props) {
  const { ready, busy, openTipsterVaultChat, openInvestorVaultChat } = useVaultInvestorChat()

  const openChat = () => {
    if (!walletAddress) return
    if (isTipster) {
      void openTipsterVaultChat(vault)
      return
    }
    void openInvestorVaultChat(vault, walletAddress)
  }

  const canOpen = isTipster || hasPosition

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, !canOpen && styles.buttonDisabled]}
        onPress={openChat}
        disabled={!ready || busy || !canOpen || !walletAddress}
        activeOpacity={0.85}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.black} />
        ) : (
          <MessageCircle size={16} color={colors.black} />
        )}
        <Text style={styles.buttonText}>
          {isTipster ? 'Open vault investor chat' : 'Join investor chat'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        Token-gated Pear P2P room · signed wallet messages · tipster always has access
      </Text>
      {!canOpen ? (
        <Text style={styles.warn}>Deposit at least 1 vault share to read and write.</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: colors.black,
    fontSize: 13,
    fontWeight: '800',
  },
  hint: {
    color: colors.textTertiary,
    fontSize: 10,
    lineHeight: 14,
  },
  warn: {
    color: colors.warning,
    fontSize: 10,
    lineHeight: 14,
  },
})
