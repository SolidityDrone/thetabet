import { ContextSizeSlider } from '@/components/settings/context-size-slider'
import { LanguagePickerModal } from '@/components/settings/language-picker-modal'
import { colors } from '@/constants/colors'
import { usePearChat } from '@/context/pear-chat'
import { QVAC_INFERENCE_MODE } from '@/services/qvac/qvac-client'
import {
  downloadQvacModel,
  formatModelSize,
  getQvacModelRegistry,
  isQvacModelMarkedInstalled,
} from '@/services/qvac/qvac-model-manager'
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
import {
  downloadSttModel,
  getSttModelSizeLabel,
  isSttModelInstalled,
} from '@/services/qvac/qvac-stt-models'
import {
  downloadTranslationModel,
  getTranslationInstallStatus,
  getTranslationModelEntry,
  isTranslationModelInstalled,
  requiresTranslationModel,
} from '@/services/qvac/qvac-translation-models'
import QvacBadge from '../../../assets/images/qvac-badge.svg'
import { Brain, ChevronDown, Languages, Mic, Radio } from 'lucide-react-native'
import React from 'react'
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { toast } from 'sonner-native'

type SettingsCardProps = {
  title: string
  subtitle: string
  icon: React.ReactNode
  children: React.ReactNode
}

function SettingsCard({ title, subtitle, icon, children }: SettingsCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>{icon}</View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  )
}

function DownloadRow({
  label,
  hint,
  status,
  buttonLabel,
  downloading,
  ready,
  onPress,
}: {
  label: string
  hint: string
  status: string
  buttonLabel: string
  downloading: boolean
  ready: boolean
  onPress: () => void
}) {
  return (
    <View style={styles.downloadRow}>
      <View style={styles.downloadCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      <TouchableOpacity
        style={[styles.downloadButton, (downloading || ready) && styles.downloadButtonDisabled]}
        onPress={onPress}
        disabled={downloading || ready}
      >
        <Text style={styles.downloadButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  )
}

export function QvacSettingsSection() {
  const {
    inferenceOptIn,
    inferenceStatus,
    setInferenceOptIn,
  } = usePearChat()

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

  const ctxLimits = qvac ? getCtxLimitsForPreset(qvac.modelPreset) : QVAC_CTX_LIMITS
  const translationEntry = qvac ? getTranslationModelEntry(qvac.outputLanguage) : null
  const needsTranslation = qvac ? requiresTranslationModel(qvac.outputLanguage) : false
  const selectedLang =
    QVAC_OUTPUT_LANGUAGE_OPTIONS.find((o) => o.code === qvac?.outputLanguage) ?? null
  const translationReady = !needsTranslation || translationInstalled === true
  const canPickLanguage = !downloading && !downloadingTranslation && !downloadingStt
  const busy = downloading || downloadingTranslation || downloadingStt

  const handleDownloadTranslationModel = async () => {
    if (!qvac || downloadingTranslation || !needsTranslationModel(qvac.outputLanguage)) return

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
      toast.error(
        msg.includes('Worklet') || msg.includes('worker') || msg.includes('Bare')
          ? 'QVAC engine failed to start. Ensure your device is compatible and try restarting the app.'
          : msg || 'Model download failed'
      )
    } finally {
      setDownloading(false)
      setDownloadPct(null)
    }
  }

  const handleInferenceOptIn = async (enabled: boolean) => {
    try {
      await setInferenceOptIn(enabled)
      toast.success(
        enabled ? 'Peer inference is available while this app is open' : 'Peer inference disabled'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleModelSelect = async (preset: QvacUserSettings['modelPreset']) => {
    if (!qvac || busy) return
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
    if (!qvac || busy) return
    const next = { ...qvac, outputLanguage }
    setQvac(next)
    await saveQvacSettings(next)

    if (!requiresTranslationModel(outputLanguage)) {
      setTranslationInstalled(true)
      return
    }

    const langInstalled = await isTranslationModelInstalled(outputLanguage)
    setTranslationInstalled(langInstalled)
    const label =
      QVAC_OUTPUT_LANGUAGE_OPTIONS.find((o) => o.code === outputLanguage)?.label ?? outputLanguage
    if (!langInstalled) {
      toast.info(`Download the ${label} translation model below to enable ${label} output.`)
    }
  }

  const modelLabel =
    qvac
      ? `${QVAC_MODEL_OPTIONS.find((m) => m.preset === qvac.modelPreset)?.label ?? 'Model'} · ${formatModelSize(
          getQvacModelRegistry(qvac.modelPreset).expectedSize
        )} on device`
      : 'Model file must be downloaded before AI can run'

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <QvacBadge width={118} height={16} />
        <View style={styles.sectionHeaderCopy}>
          <Text style={styles.sectionTitle}>On-device AI</Text>
          <Text style={styles.sectionSubtitle}>Powered by QVAC · runs locally on your phone</Text>
        </View>
      </View>

      <SettingsCard
        title="Peer inference"
        subtitle="Share your model with other users on the network"
        icon={<Radio size={18} color={inferenceOptIn ? colors.primary : colors.textSecondary} />}
      >
        <View style={styles.peerRow}>
          <View style={styles.peerCopy}>
            <Text style={styles.hint}>
              Opt in to answer public match-analysis requests on this phone. Your private notes stay
              here and only the finished analysis and picks are returned.
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
      </SettingsCard>

      <SettingsCard
        title="Models"
        subtitle="Local LLMs for match AI, tipster /ask, and peer inference"
        icon={<Brain size={18} color={colors.primary} />}
      >
        <View style={styles.block}>
          <Text style={styles.rowLabel}>Choose model</Text>
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

        <DownloadRow
          label="Download model"
          hint={modelLabel}
          status={
            downloading
              ? `Downloading… ${Math.round(downloadPct ?? 0)}%`
              : installed
                ? 'Ready on this device'
                : 'Not downloaded yet'
          }
          buttonLabel={downloading ? 'Downloading' : installed ? 'Installed' : 'Download'}
          downloading={downloading}
          ready={installed === true}
          onPress={() => void handleDownloadModel()}
        />

        <View style={styles.block}>
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
            <Text style={styles.loadingText}>Loading model settings…</Text>
          )}
        </View>
      </SettingsCard>

      <SettingsCard
        title="Translator"
        subtitle="Translate match analysis to your language on-device"
        icon={<Languages size={18} color={colors.primary} />}
      >
        <Text style={styles.hint}>
          Hints writes in English. After analysis finishes, QVAC translates locally to your chosen
          language.
        </Text>

        {needsTranslation ? (
          <DownloadRow
            label="Download translation model"
            hint={
              translationEntry
                ? `${translationEntry.label} · ${formatModelSize(translationEntry.expectedSize)} on device`
                : 'Bergamot on-device translation'
            }
            status={
              downloadingTranslation
                ? `Downloading… ${Math.round(translationDownloadPct ?? 0)}%`
                : translationInstalled
                  ? 'Ready on this device'
                  : 'Required before translation works'
            }
            buttonLabel={
              downloadingTranslation ? 'Downloading' : translationInstalled ? 'Installed' : 'Download'
            }
            downloading={downloadingTranslation}
            ready={translationInstalled === true}
            onPress={() => void handleDownloadTranslationModel()}
          />
        ) : null}

        <View style={styles.block}>
          <Text style={styles.rowLabel}>Output language</Text>
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
                <Text style={styles.languageSelectorLabel}>{selectedLang?.label ?? 'English'}</Text>
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
      </SettingsCard>

      <SettingsCard
        title="Speech-to-text"
        subtitle="Voice input for tipster notes and Speak buttons"
        icon={<Mic size={18} color={colors.primary} />}
      >
        <Text style={styles.hint}>
          Whisper Tiny runs on CPU for dictating notes. {getSttModelSizeLabel()} · no GPU required.
        </Text>
        <DownloadRow
          label="Download speech model"
          hint="Required for Speak on note fields"
          status={
            downloadingStt
              ? `Downloading… ${Math.round(sttDownloadPct ?? 0)}%`
              : sttInstalled
                ? 'Ready on this device'
                : 'Not downloaded yet'
          }
          buttonLabel={downloadingStt ? 'Downloading' : sttInstalled ? 'Installed' : 'Download'}
          downloading={downloadingStt}
          ready={sttInstalled === true}
          onPress={() => void handleDownloadSttModel()}
        />
      </SettingsCard>

      <LanguagePickerModal
        visible={languagePickerVisible}
        selected={qvac?.outputLanguage ?? null}
        installByLang={translationInstallByLang}
        onSelect={handleLanguageSelect}
        onClose={() => setLanguagePickerVisible(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
    marginBottom: 8,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.borderNeon,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  cardBody: {
    gap: 12,
  },
  block: {
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  status: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  downloadCopy: {
    flex: 1,
    gap: 4,
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
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  peerCopy: {
    flex: 1,
    gap: 5,
  },
  cpuHint: {
    color: colors.textTertiary,
    fontSize: 10,
    lineHeight: 14,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
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
})
