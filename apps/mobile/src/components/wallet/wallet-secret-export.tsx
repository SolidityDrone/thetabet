import { SeedPhrase } from '@/components/SeedPhrase'
import { BottomSheetModal, SheetActions } from '@/components/ui/bottom-sheet-modal'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { retrieveWalletMnemonic } from '@/services/wdk-local-signer'
import getErrorMessage from '@/utils/get-error-message'
import * as Clipboard from 'expo-clipboard'
import { AlertTriangle, ChevronRight, Copy, KeyRound } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { toast } from 'sonner-native'

type SecretStep = 'closed' | 'warning' | 'revealed'

export function WalletSecretExportRow() {
  const [step, setStep] = useState<SecretStep>('closed')
  const [words, setWords] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const close = useCallback(() => {
    setStep('closed')
    setWords([])
    setLoadError(null)
    setIsLoading(false)
  }, [])

  const handleReveal = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const mnemonic = await retrieveWalletMnemonic()
      setWords(mnemonic.split(/\s+/).filter(Boolean))
      setStep('revealed')
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Could not load wallet backup.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    if (words.length === 0) return
    await Clipboard.setStringAsync(words.join(' '))
    toast.success('Recovery phrase copied')
  }, [words])

  return (
    <>
      <TouchableOpacity
        style={styles.row}
        onPress={() => setStep('warning')}
        activeOpacity={0.7}
      >
        <View style={styles.rowLeft}>
          <KeyRound size={16} color={colors.textTertiary} />
          <Text style={styles.rowLabel}>Wallet backup</Text>
        </View>
        <ChevronRight size={18} color={colors.textTertiary} />
      </TouchableOpacity>

      <BottomSheetModal
        visible={step === 'warning'}
        onClose={close}
        title="Reveal wallet backup?"
        dismissOnBackdrop={!isLoading}
      >
        <View style={styles.warningBox}>
          <AlertTriangle size={20} color={colors.warning} />
          <Text style={styles.warningBody}>
            Your recovery phrase controls this wallet. Anyone with it can steal your funds.
            Never share it, screenshot it, or paste it into untrusted apps.
          </Text>
        </View>
        <SheetActions
          onCancel={close}
          cancelLabel="Keep hidden"
          onConfirm={() => void handleReveal()}
          confirmLabel={isLoading ? 'Loading…' : 'I understand, reveal'}
          confirmDisabled={isLoading}
          destructive
        />
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : null}
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
      </BottomSheetModal>

      <BottomSheetModal
        visible={step === 'revealed'}
        onClose={close}
        title="Recovery phrase"
        dismissOnBackdrop
      >
        <Text style={styles.revealHint}>
          Write this down offline. Do not share with anyone.
        </Text>
        <SeedPhrase words={words} hidden={false} />
        <TouchableOpacity style={styles.copyRow} onPress={() => void handleCopy()}>
          <Copy size={16} color={colors.primary} />
          <Text style={styles.copyText}>Copy phrase</Text>
        </TouchableOpacity>
        <SheetActions onConfirm={close} confirmLabel="Hide again" />
      </BottomSheetModal>
    </>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  warningBox: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBackground,
    padding: 14,
  },
  warningBody: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  revealHint: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  copyText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  loadingRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    lineHeight: 18,
  },
})
