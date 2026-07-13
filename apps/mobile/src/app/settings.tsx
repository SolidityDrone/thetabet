import { QvacSettingsSection } from '@/components/settings/qvac-settings-section'
import Header from '@/components/header';
import { WalletSecretExportRow } from '@/components/wallet/wallet-secret-export';
import { clearAvatar } from '@/config/avatar-options';
import { useConfirmSheet } from '@/context/confirm-sheet';
import { resetWalletAddressCache } from '@/services/patch-wdk-service'
import { useThetaWalletAddress } from '@/hooks/use-theta-wallet-address'
import { useWallet } from '@tetherto/wdk-react-native-provider';
import * as Clipboard from 'expo-clipboard';
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation';
import { Copy, Camera, ImagePlus, Shield, Trash2, Wallet } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { colors } from '@/constants/colors';
import { ChatAvatar } from '@/components/pear/chat-avatar'
import { ChatAvatarCameraModal } from '@/components/pear/chat-avatar-camera-modal'
import { usePearChat } from '@/context/pear-chat'
import { pickChatAvatarFromGallery } from '@/services/chat-avatar-picker'
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useDebouncedNavigation();
  const { confirm } = useConfirmSheet();
  const { wallet, clearWallet } = useWallet();
  const { address: polygonAddress, shortAddress: polygonShortAddress } = useThetaWalletAddress();
  const { identity: chatIdentity, setChatAvatar } = usePearChat()
  const [uploadingChatAvatar, setUploadingChatAvatar] = React.useState(false)
  const [avatarCameraVisible, setAvatarCameraVisible] = React.useState(false)

  const saveChatAvatar = React.useCallback(
    async (payload: { imageBase64: string; mimeType: string }) => {
      try {
        setUploadingChatAvatar(true)
        await setChatAvatar(payload)
        toast.success('Chat photo updated')
      } catch (error) {
        toast.error(String(error))
        throw error
      } finally {
        setUploadingChatAvatar(false)
      }
    },
    [setChatAvatar]
  )

  const pickChatAvatarFromLibrary = React.useCallback(async () => {
    try {
      setUploadingChatAvatar(true)
      const picked = await pickChatAvatarFromGallery()
      if (!picked) return
      await saveChatAvatar(picked)
    } catch (error) {
      toast.error(String(error))
    } finally {
      setUploadingChatAvatar(false)
    }
  }, [saveChatAvatar])

  const clearChatAvatar = React.useCallback(async () => {
    try {
      setUploadingChatAvatar(true)
      await setChatAvatar({ clear: true })
      toast.success('Chat photo removed')
    } catch (error) {
      toast.error(String(error))
    } finally {
      setUploadingChatAvatar(false)
    }
  }, [setChatAvatar])
  const handleDeleteWallet = async () => {
    const confirmed = await confirm({
      title: 'Delete wallet',
      message:
        'This permanently removes your wallet from this device. Make sure you have backed up your recovery phrase first.',
      confirmLabel: 'Delete wallet',
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await clearWallet();
      await resetWalletAddressCache();
      await clearAvatar();
      toast.success('Wallet deleted successfully');
      router.dismissAll('/');
    } catch (error) {
      console.error('Failed to delete wallet:', error);
      toast.error('Failed to delete wallet');
    }
  };

  const handleCopyAddress = async (address: string, networkName: string) => {
    await Clipboard.setStringAsync(address);
    toast.success(`${networkName} address copied to clipboard`);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header title="Settings" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Chat avatar</Text>
          </View>
          <Text style={styles.infoLabel}>
            Shown beside your Public, vault, and direct messages. Keep the default anonymous icon,
            choose a photo from your library, or take one with the camera.
          </Text>
          <View style={styles.chatAvatarSection}>
            <ChatAvatar
              avatarUri={chatIdentity?.avatarUri}
              avatarData={chatIdentity?.avatarData}
              size={72}
            />
            <View style={styles.chatAvatarActions}>
              <TouchableOpacity
                style={[styles.chatAvatarButton, uploadingChatAvatar && styles.chatAvatarButtonDisabled]}
                onPress={() => void pickChatAvatarFromLibrary()}
                disabled={uploadingChatAvatar}
              >
                <ImagePlus size={16} color={colors.background} />
                <Text style={styles.chatAvatarButtonText}>
                  {uploadingChatAvatar ? 'Saving…' : 'Choose photo'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chatAvatarSecondaryAction, uploadingChatAvatar && styles.chatAvatarButtonDisabled]}
                onPress={() => setAvatarCameraVisible(true)}
                disabled={uploadingChatAvatar}
              >
                <Camera size={15} color={colors.text} />
                <Text style={styles.chatAvatarSecondaryActionText}>Take photo</Text>
              </TouchableOpacity>
              {chatIdentity?.avatarUri || chatIdentity?.avatarData ? (
                <TouchableOpacity
                  style={styles.chatAvatarSecondaryButton}
                  onPress={() => void clearChatAvatar()}
                  disabled={uploadingChatAvatar}
                >
                  <Trash2 size={14} color={colors.textSecondary} />
                  <Text style={styles.chatAvatarSecondaryText}>Remove photo</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {/* Wallet Info Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Wallet size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Wallet Information</Text>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{wallet?.name || 'Unknown'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Network</Text>
              <Text style={styles.infoValue}>Polygon</Text>
            </View>

            <WalletSecretExportRow />
          </View>
        </View>

        {/* Polygon address (used by ThetaBet) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Polygon</Text>
          </View>

          <View style={styles.addressCard}>
            <TouchableOpacity
              style={[styles.addressRow, styles.addressRowLast]}
              onPress={() => polygonAddress && handleCopyAddress(polygonAddress, 'Polygon')}
              activeOpacity={0.7}
              disabled={!polygonAddress}
            >
              <View style={styles.addressContent}>
                <Text style={styles.networkLabel}>Your betting wallet</Text>
                <Text style={styles.addressValue}>
                  {polygonAddress || polygonShortAddress || 'Loading…'}
                </Text>
              </View>
              {polygonAddress ? <Copy size={18} color={colors.primary} /> : null}
            </TouchableOpacity>
          </View>
        </View>

        <QvacSettingsSection />

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <View style={styles.sectionHeader}>
            <Trash2 size={20} color={colors.danger} />
            <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          </View>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteWallet}>
            <Trash2 size={20} color={colors.white} />
            <Text style={styles.deleteButtonText}>Delete Wallet</Text>
          </TouchableOpacity>

          <Text style={styles.warningText}>
            Deleting your wallet will remove all data from this device. Make sure you have backed up
            your recovery phrase before proceeding.
          </Text>
        </View>
      </ScrollView>

      <ChatAvatarCameraModal
        visible={avatarCameraVisible}
        onClose={() => setAvatarCameraVisible(false)}
        onCapture={saveChatAvatar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  infoValueSmall: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  addressCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  addressRowLast: {
    borderBottomWidth: 0,
  },
  addressContent: {
    flex: 1,
    marginRight: 12,
  },
  networkLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  addressValue: {
    fontSize: 13,
    color: colors.text,
    fontFamily: 'monospace',
  },
  dangerSection: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 40,
  },
  dangerTitle: {
    color: colors.danger,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
  },
  deleteButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  warningText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  chatAvatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chatAvatarActions: {
    flex: 1,
    gap: 10,
  },
  chatAvatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatAvatarButtonDisabled: {
    opacity: 0.6,
  },
  chatAvatarButtonText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '700',
  },
  chatAvatarSecondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatAvatarSecondaryActionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chatAvatarSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  chatAvatarSecondaryText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
