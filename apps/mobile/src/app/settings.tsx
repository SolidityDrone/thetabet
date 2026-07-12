import { ContextSizeSlider } from '@/components/settings/context-size-slider';
import { LanguagePickerModal } from '@/components/settings/language-picker-modal'
import Header from '@/components/header';
import { WalletSecretExportRow } from '@/components/wallet/wallet-secret-export';
import { clearAvatar } from '@/config/avatar-options';
import { useConfirmSheet } from '@/context/confirm-sheet';
import { resetWalletAddressCache } from '@/services/patch-wdk-service'
import { useThetaWalletAddress } from '@/hooks/use-theta-wallet-address'
import useWalletAvatar from '@/hooks/use-wallet-avatar';
import { useWallet } from '@tetherto/wdk-react-native-provider';
import * as Clipboard from 'expo-clipboard';
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation';
import { ChevronDown, Copy, Camera, ImagePlus, Info, Radio, Shield, Trash2, Wallet } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { colors } from '@/constants/colors';
import { ChatAvatar } from '@/components/pear/chat-avatar'
import { ChatAvatarCameraModal } from '@/components/pear/chat-avatar-camera-modal'
import { usePearChat } from '@/context/pear-chat'
import { pickChatAvatarFromGallery } from '@/services/chat-avatar-picker'
import type { QvacUserSettings } from '@/services/qvac/qvac-settings'
import {
  getCtxLimitsForPreset,
  loadQvacSettings,
  QVAC_CTX_LIMITS,
  QVAC_MODEL_OPTIONS,
  QVAC_OUTPUT_LANGUAGE_OPTIONS,
  saveQvacSettings,
  type QvacOutputLanguage,
} from '@/services/qvac/qvac-settings'
import { QVAC_INFERENCE_MODE } from '@/services/qvac/qvac-client'
import {
  downloadQvacModel,
  formatModelSize,
  getQvacModelRegistry,
  isQvacModelMarkedInstalled,
} from '@/services/qvac/qvac-model-manager'
import {
  downloadTranslationModel,
  getTranslationInstallStatus,
  getTranslationModelEntry,
  isTranslationModelInstalled,
  requiresTranslationModel,
} from '@/services/qvac/qvac-translation-models'
import {
  downloadSttModel,
  getSttModelSizeLabel,
  isSttModelInstalled,
} from '@/services/qvac/qvac-stt-models'
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useDebouncedNavigation();
  const { confirm } = useConfirmSheet();
  const { wallet, clearWallet } = useWallet();
  const { address: polygonAddress, shortAddress: polygonShortAddress } = useThetaWalletAddress();
  const avatar = useWalletAvatar();
  const {
    identity: chatIdentity,
    setChatAvatar,
    inferenceOptIn,
    inferenceStatus,
    setInferenceOptIn,
  } = usePearChat()
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
  const [qvac, setQvac] = React.useState<QvacUserSettings | null>(null)
  const [installed, setInstalled] = React.useState<boolean | null>(null)
  const [translationInstalled, setTranslationInstalled] = React.useState<boolean | null>(null)
  const [downloading, setDownloading] = React.useState(false)
  const [downloadingTranslation, setDownloadingTranslation] = React.useState(false)
  const [downloadingStt, setDownloadingStt] = React.useState(false)
  const [downloadPct, setDownloadPct] = React.useState<number | null>(null)
  const [translationDownloadPct, setTranslationDownloadPct] = React.useState<number | null>(null)
  const [sttDownloadPct, setSttDownloadPct] = React.useState<number | null>(null)
  const [sttInstalled, setSttInstalled] = React.useState<boolean | null>(null)
  const [languagePickerVisible, setLanguagePickerVisible] = React.useState(false)
  const [translationInstallByLang, setTranslationInstallByLang] = React.useState<
    Partial<Record<QvacOutputLanguage, boolean>>
  >({ en: true })
  React.useEffect(() => {
    loadQvacSettings().then(setQvac).catch(() => setQvac(null))
  }, [])

  React.useEffect(() => {
    isSttModelInstalled()
      .then(setSttInstalled)
      .catch(() => setSttInstalled(false))
  }, [])

  React.useEffect(() => {
    if (!qvac) return
    isQvacModelMarkedInstalled(qvac.modelPreset)
      .then(setInstalled)
      .catch(() => setInstalled(false))
  }, [qvac?.modelPreset])

  React.useEffect(() => {
    if (!qvac) return
    if (!requiresTranslationModel(qvac.outputLanguage)) {
      setTranslationInstalled(true)
      return
    }
    isTranslationModelInstalled(qvac.outputLanguage)
      .then(setTranslationInstalled)
      .catch(() => setTranslationInstalled(false))
  }, [qvac?.outputLanguage])

  React.useEffect(() => {
    if (!languagePickerVisible) return
    getTranslationInstallStatus()
      .then(setTranslationInstallByLang)
      .catch(() => setTranslationInstallByLang({ en: true }))
  }, [languagePickerVisible])

  const handleDownloadTranslationModel = async () => {
    if (!qvac || downloadingTranslation || !requiresTranslationModel(qvac.outputLanguage)) return

    setDownloadingTranslation(true)
    setTranslationDownloadPct(0)
    try {
      await downloadTranslationModel(qvac.outputLanguage, (progress) => {
        setTranslationDownloadPct(progress.percentage)
      })
      setTranslationInstalled(true)
      setTranslationInstallByLang((prev) => ({ ...prev, [qvac.outputLanguage]: true }))
      toast.success('Translation model downloaded')
    } catch (error) {
      console.error('Translation model download failed:', error)
      const msg = error instanceof Error ? error.message : String(error)
      toast.error(msg || 'Translation model download failed')
    } finally {
      setDownloadingTranslation(false)
      setTranslationDownloadPct(null)
    }
  }

  const handleDownloadSttModel = async () => {
    if (downloadingStt) return

    setDownloadingStt(true)
    setSttDownloadPct(0)
    try {
      await downloadSttModel((progress) => {
        setSttDownloadPct(progress.percentage)
      })
      setSttInstalled(true)
      toast.success('Speech-to-text model downloaded')
    } catch (error) {
      console.error('Speech model download failed:', error)
      const msg = error instanceof Error ? error.message : String(error)
      toast.error(msg || 'Speech model download failed')
    } finally {
      setDownloadingStt(false)
      setSttDownloadPct(null)
    }
  }

  const handleDownloadModel = async () => {
    if (!qvac || downloading) return

    // Worklet creation will happen on downloadAsset call inside downloadQvacModel.
    // If the worker fails to start, it throws and is caught below.

    setDownloading(true)
    setDownloadPct(0)
    try {
      await downloadQvacModel(qvac.modelPreset, (progress) => {
        setDownloadPct(progress.percentage)
      })
      setInstalled(true)
      toast.success('Local AI model downloaded')
    } catch (error) {
      console.error('QVAC model download failed:', error)
      const msg = error instanceof Error ? error.message : String(error)
      // If the worklet crashed, we can't catch it here (native SIGSEGV).
      // This handles JS-level errors from the SDK.
      toast.error(msg.includes('Worklet') || msg.includes('worker') || msg.includes('Bare')
        ? 'QVAC engine failed to start. Ensure your device is compatible and try restarting the app.'
        : msg || 'Model download failed')
    } finally {
      setDownloading(false)
      setDownloadPct(null)
    }
  }

  const handleInferenceOptIn = async (enabled: boolean) => {
    try {
      await setInferenceOptIn(enabled)
      toast.success(enabled ? 'Peer inference is available while this app is open' : 'Peer inference disabled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

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

  const ctxLimits = qvac ? getCtxLimitsForPreset(qvac.modelPreset) : QVAC_CTX_LIMITS

  const handleModelSelect = async (preset: QvacUserSettings['modelPreset']) => {
    if (!qvac || downloading || downloadingStt) return
    const limits = getCtxLimitsForPreset(preset)
    const next = {
      ...qvac,
      modelPreset: preset,
      ctxSize: Math.min(Math.max(qvac.ctxSize, limits.min), limits.max),
    }
    setQvac(next)
    await saveQvacSettings(next)
  }

  const handleCtxDraft = (ctxSize: number) => {
    if (!qvac) return
    setQvac({ ...qvac, ctxSize })
  }

  const handleCtxCommit = async (ctxSize: number) => {
    if (!qvac) return
    const next = { ...qvac, ctxSize }
    setQvac(next)
    await saveQvacSettings(next)
  }

  const handleLanguageSelect = async (outputLanguage: QvacOutputLanguage) => {
    if (!qvac || downloading || downloadingTranslation || downloadingStt) return
    const next = { ...qvac, outputLanguage }
    setQvac(next)
    await saveQvacSettings(next)

    if (!requiresTranslationModel(outputLanguage)) {
      setTranslationInstalled(true)
      return
    }

    const installed = await isTranslationModelInstalled(outputLanguage)
    setTranslationInstalled(installed)
    const label =
      QVAC_OUTPUT_LANGUAGE_OPTIONS.find((o) => o.code === outputLanguage)?.label ?? outputLanguage
    if (!installed) {
      toast.info(`Download the ${label} translation model below to enable ${label} output.`)
    }
  }

  const translationEntry = qvac ? getTranslationModelEntry(qvac.outputLanguage) : null
  const needsTranslation = qvac ? requiresTranslationModel(qvac.outputLanguage) : false
  const selectedLang =
    QVAC_OUTPUT_LANGUAGE_OPTIONS.find((o) => o.code === qvac?.outputLanguage) ?? null
  const translationReady = !needsTranslation || translationInstalled === true
  const canPickLanguage = !downloading && !downloadingTranslation && !downloadingStt

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
              <Text style={styles.infoLabel}>Icon</Text>
              <Text style={styles.infoValue}>{avatar}</Text>
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

        {/* About Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Info size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>About</Text>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>

            <View style={[styles.infoRow, styles.infoRowLast]}>
              <Text style={styles.infoLabel}>WDK Version</Text>
              <Text style={styles.infoValue}>Latest</Text>
            </View>
          </View>
        </View>

        {/* Local AI (QVAC) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Info size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Local AI (QVAC)</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={[styles.infoRow, styles.peerInferenceRow]}>
              <View style={styles.peerInferenceCopy}>
                <View style={styles.peerInferenceTitle}>
                  <Radio size={16} color={inferenceOptIn ? colors.primary : colors.textSecondary} />
                  <Text style={styles.infoLabel}>Offer peer inference</Text>
                </View>
                <Text style={styles.downloadHint}>
                  Opt in to answer public match-analysis requests on this phone. Your private notes
                  stay here and only the finished analysis and picks are returned.
                </Text>
                <Text style={styles.cpuHint}>
                  Status: {inferenceOptIn ? inferenceStatus?.status ?? 'connecting' : 'offline'}
                </Text>
              </View>
              <Switch
                value={inferenceOptIn}
                onValueChange={(enabled) => void handleInferenceOptIn(enabled)}
                trackColor={{ false: colors.borderLight, true: colors.primaryDim }}
                thumbColor={inferenceOptIn ? colors.primary : colors.textSecondary}
              />
            </View>
            <View style={styles.aiModelRow}>
              <Text style={styles.infoLabel}>Model</Text>
              <View style={styles.modelPills}>
                {QVAC_MODEL_OPTIONS.map((option) => {
                  const selected = qvac?.modelPreset === option.preset
                  return (
                    <TouchableOpacity
                      key={option.preset}
                      style={[styles.modelPill, selected && styles.modelPillActive]}
                      onPress={() => handleModelSelect(option.preset)}
                      disabled={downloading}
                    >
                      <Text style={[styles.modelPillText, selected && styles.modelPillTextActive]}>
                        {option.label}
                      </Text>
                      <Text style={styles.modelPillHint}>{option.description}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
            <View style={styles.aiDownloadRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.infoLabel}>Download</Text>
                <Text style={styles.downloadHint}>
                  {qvac
                    ? `${QVAC_MODEL_OPTIONS.find((m) => m.preset === qvac.modelPreset)?.label ?? 'Model'} · ${formatModelSize(
                        getQvacModelRegistry(qvac.modelPreset).expectedSize
                      )} on device`
                    : 'Model file must be downloaded before AI can run'}
                </Text>
                <Text style={styles.downloadStatus}>
                  {downloading
                    ? `Downloading… ${Math.round(downloadPct ?? 0)}%`
                    : installed
                      ? 'Ready on this device'
                      : 'Not downloaded yet'}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.downloadButton,
                  (downloading || installed) && styles.downloadButtonDisabled,
                ]}
                onPress={handleDownloadModel}
                disabled={downloading || installed === true}
              >
                <Text style={styles.downloadButtonText}>
                  {downloading
                    ? 'Downloading'
                    : installed
                      ? 'Installed'
                      : 'Download'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.infoRow, styles.ctxRow, styles.translationSection]}>
              <Text style={styles.infoLabel}>Translation</Text>
              <Text style={styles.downloadHint}>
                Hints writes in English. After analysis finishes, it translates on-device to your
                chosen language.
              </Text>

              {needsTranslation ? (
                <View style={styles.aiDownloadRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.translationStep}>Step 1 · Download model</Text>
                    <Text style={styles.downloadHint}>
                      {translationEntry
                        ? `${translationEntry.label} · ${formatModelSize(translationEntry.expectedSize)} on device`
                        : 'Bergamot on-device translation'}
                    </Text>
                    <Text style={styles.downloadStatus}>
                      {downloadingTranslation
                        ? `Downloading… ${Math.round(translationDownloadPct ?? 0)}%`
                        : translationInstalled
                          ? 'Ready on this device'
                          : 'Required before translation works'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.downloadButton,
                      (downloadingTranslation || translationInstalled) && styles.downloadButtonDisabled,
                    ]}
                    onPress={handleDownloadTranslationModel}
                    disabled={downloadingTranslation || translationInstalled === true}
                  >
                    <Text style={styles.downloadButtonText}>
                      {downloadingTranslation
                        ? 'Downloading'
                        : translationInstalled
                          ? 'Installed'
                          : 'Download'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.translationLangBlock}>
                <Text style={styles.translationStep}>
                  {needsTranslation ? 'Step 2 · Output language' : 'Output language'}
                </Text>
                {!translationReady && needsTranslation ? (
                  <Text style={styles.translationWarn}>
                    Download the {selectedLang?.label ?? 'translation'} model above first.
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.languageSelector,
                    !translationReady && needsTranslation && styles.languageSelectorPending,
                  ]}
                  onPress={() => setLanguagePickerVisible(true)}
                  activeOpacity={0.7}
                  disabled={!canPickLanguage}
                >
                  <View style={styles.languageSelectorContent}>
                    <View style={styles.languageSelectorRow}>
                      <Text style={styles.languageSelectorFlag}>{selectedLang?.flag ?? '🇬🇧'}</Text>
                      <Text style={styles.languageSelectorLabel}>
                        {selectedLang?.label ?? 'English'}
                      </Text>
                    </View>
                    <Text style={styles.languageSelectorNative}>
                      {selectedLang?.nativeLabel ?? ''}
                      {needsTranslation && translationReady ? ' · translation active' : ''}
                      {needsTranslation && !translationReady ? ' · English until model installed' : ''}
                    </Text>
                  </View>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.infoRow, styles.ctxRow, styles.translationSection]}>
              <Text style={styles.infoLabel}>Speech-to-text (CPU)</Text>
              <Text style={styles.downloadHint}>
                Whisper Tiny for Speak buttons on tipster notes. {getSttModelSizeLabel()} · CPU only.
              </Text>
              <View style={styles.aiDownloadRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.downloadStatus}>
                    {downloadingStt
                      ? `Downloading… ${Math.round(sttDownloadPct ?? 0)}%`
                      : sttInstalled
                        ? 'Ready on this device'
                        : 'Required for Speak on note fields'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.downloadButton,
                    (downloadingStt || sttInstalled) && styles.downloadButtonDisabled,
                  ]}
                  onPress={handleDownloadSttModel}
                  disabled={downloadingStt || sttInstalled === true}
                >
                  <Text style={styles.downloadButtonText}>
                    {downloadingStt ? 'Downloading' : sttInstalled ? 'Installed' : 'Download'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.infoRow, styles.infoRowLast, styles.ctxRow]}>
              {qvac ? (
                <>
                  <ContextSizeSlider
                    value={qvac.ctxSize}
                    min={ctxLimits.min}
                    max={ctxLimits.max}
                    step={ctxLimits.step}
                    onValueChange={handleCtxDraft}
                    onSlidingComplete={handleCtxCommit}
                  />
                  <Text style={styles.cpuHint}>
                    Inference: {QVAC_INFERENCE_MODE} · 0 GPU layers · reload after changing
                  </Text>
                </>
              ) : (
                <Text style={styles.infoValue}>Loading…</Text>
              )}
            </View>
          </View>
        </View>

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

      <LanguagePickerModal
        visible={languagePickerVisible}
        selected={qvac?.outputLanguage ?? null}
        installByLang={translationInstallByLang}
        onSelect={handleLanguageSelect}
        onClose={() => setLanguagePickerVisible(false)}
      />
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
  aiModelRow: {
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  modelPills: {
    gap: 8,
  },
  modelPill: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modelPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  modelPillText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  modelPillTextActive: {
    color: colors.primary,
  },
  modelPillHint: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  translationSection: {
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  peerInferenceRow: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  peerInferenceCopy: {
    flex: 1,
    gap: 5,
  },
  peerInferenceTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  translationStep: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  translationLangBlock: {
    gap: 6,
    marginTop: 4,
  },
  translationWarn: {
    color: colors.warning,
    fontSize: 11,
    lineHeight: 15,
  },
  languageSelectorPending: {
    borderColor: colors.warning,
  },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  languageSelectorContent: {
    flexDirection: 'column',
    gap: 2,
  },
  languageSelectorLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  languageSelectorNative: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  languageSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageSelectorFlag: {
    fontSize: 18,
  },
  aiDownloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  downloadHint: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  downloadStatus: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  downloadButton: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  downloadButtonDisabled: {
    opacity: 0.55,
  },
  downloadButtonText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '800',
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
  ctxRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  cpuHint: {
    color: colors.textTertiary,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
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
