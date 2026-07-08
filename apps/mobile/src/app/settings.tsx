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
import { Copy, Info, Shield, Trash2, Wallet } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';
import { colors } from '@/constants/colors';
import type { QvacUserSettings } from '@/services/qvac/qvac-settings'
import {
  loadQvacSettings,
  QVAC_CTX_LIMITS,
  QVAC_MODEL_OPTIONS,
  saveQvacSettings,
} from '@/services/qvac/qvac-settings'
import {
  downloadQvacModel,
  formatModelSize,
  getQvacModelRegistry,
  isQvacModelMarkedInstalled,
} from '@/services/qvac/qvac-model-manager'
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useDebouncedNavigation();
  const { confirm } = useConfirmSheet();
  const { wallet, clearWallet } = useWallet();
  const { address: polygonAddress, shortAddress: polygonShortAddress } = useThetaWalletAddress();
  const avatar = useWalletAvatar();
  const [qvac, setQvac] = React.useState<QvacUserSettings | null>(null)
  const [installed, setInstalled] = React.useState<boolean | null>(null)
  const [downloading, setDownloading] = React.useState(false)
  const [downloadPct, setDownloadPct] = React.useState<number | null>(null)
  React.useEffect(() => {
    loadQvacSettings().then(setQvac).catch(() => setQvac(null))
  }, [])

  React.useEffect(() => {
    if (!qvac) return
    isQvacModelMarkedInstalled(qvac.modelPreset)
      .then(setInstalled)
      .catch(() => setInstalled(false))
  }, [qvac?.modelPreset])

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
            <View style={styles.aiModelRow}>
              <Text style={styles.infoLabel}>Model</Text>
              <View style={styles.modelPills}>
                {QVAC_MODEL_OPTIONS.map((option) => {
                  const selected = qvac?.modelPreset === option.preset
                  return (
                    <TouchableOpacity
                      key={option.preset}
                      style={[styles.modelPill, selected && styles.modelPillActive]}
                      onPress={async () => {
                        if (!qvac || downloading) return
                        const next = { ...qvac, modelPreset: option.preset }
                        setQvac(next)
                        await saveQvacSettings(next)
                      }}
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
            <View style={[styles.infoRow, styles.infoRowLast]}>
              <Text style={styles.infoLabel}>Context</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={async () => {
                    if (!qvac) return
                    const next = {
                      ...qvac,
                      ctxSize: Math.max(QVAC_CTX_LIMITS.min, qvac.ctxSize - 512),
                    }
                    setQvac(next)
                    await saveQvacSettings(next)
                  }}
                >
                  <Text style={styles.smallButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.infoValue}>{qvac?.ctxSize ?? '—'}</Text>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={async () => {
                    if (!qvac) return
                    const next = {
                      ...qvac,
                      ctxSize: Math.min(QVAC_CTX_LIMITS.max, qvac.ctxSize + 512),
                    }
                    setQvac(next)
                    await saveQvacSettings(next)
                  }}
                >
                  <Text style={styles.smallButtonText}>+</Text>
                </TouchableOpacity>
              </View>
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
  smallButton: {
    width: 34,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
});
