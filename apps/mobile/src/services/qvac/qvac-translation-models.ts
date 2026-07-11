import {
  BERGAMOT_EN_DE,
  BERGAMOT_EN_ES,
  BERGAMOT_EN_FR,
  BERGAMOT_EN_IT,
  BERGAMOT_EN_NL,
  BERGAMOT_EN_PL,
  BERGAMOT_EN_PT,
  BERGAMOT_EN_RO,
  BERGAMOT_EN_RU,
  BERGAMOT_EN_TR,
  BERGAMOT_EN_UK,
  BERGAMOT_EN_ZH,
  cancel,
  downloadAsset,
  type ModelProgressUpdate,
} from '@qvac/sdk'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { QvacOutputLanguage } from '@/services/qvac/qvac-settings'

type BergamotModelRef = {
  name: string
  src: string
  expectedSize: number
  label: string
}

const TRANSLATION_REGISTRY: Partial<Record<Exclude<QvacOutputLanguage, 'en'>, BergamotModelRef>> = {
  it: { ...BERGAMOT_EN_IT, label: 'English → Italian' },
  es: { ...BERGAMOT_EN_ES, label: 'English → Spanish' },
  fr: { ...BERGAMOT_EN_FR, label: 'English → French' },
  de: { ...BERGAMOT_EN_DE, label: 'English → German' },
  pt: { ...BERGAMOT_EN_PT, label: 'English → Portuguese' },
  nl: { ...BERGAMOT_EN_NL, label: 'English → Dutch' },
  pl: { ...BERGAMOT_EN_PL, label: 'English → Polish' },
  ro: { ...BERGAMOT_EN_RO, label: 'English → Romanian' },
  ru: { ...BERGAMOT_EN_RU, label: 'English → Russian' },
  tr: { ...BERGAMOT_EN_TR, label: 'English → Turkish' },
  uk: { ...BERGAMOT_EN_UK, label: 'English → Ukrainian' },
  zh: { ...BERGAMOT_EN_ZH, label: 'English → Chinese' },
}

const INSTALL_KEY_PREFIX = 'thetabet.qvac.translationInstalled.v1.'

let activeDownloadRequestId: string | null = null

function installKey(language: Exclude<QvacOutputLanguage, 'en'>) {
  return `${INSTALL_KEY_PREFIX}en-${language}`
}

export function getTranslationModelEntry(language: QvacOutputLanguage): BergamotModelRef | null {
  if (language === 'en') return null
  return TRANSLATION_REGISTRY[language] ?? null
}

export function requiresTranslationModel(language: QvacOutputLanguage): language is Exclude<QvacOutputLanguage, 'en'> {
  return language !== 'en' && Boolean(TRANSLATION_REGISTRY[language])
}

export async function isTranslationModelInstalled(language: QvacOutputLanguage): Promise<boolean> {
  if (!requiresTranslationModel(language)) return true
  try {
    return (await AsyncStorage.getItem(installKey(language))) === '1'
  } catch {
    return false
  }
}

async function markTranslationInstalled(language: Exclude<QvacOutputLanguage, 'en'>): Promise<void> {
  try {
    await AsyncStorage.setItem(installKey(language), '1')
  } catch {
    // ignore
  }
}

export async function downloadTranslationModel(
  language: Exclude<QvacOutputLanguage, 'en'>,
  onProgress?: (progress: { percentage: number; downloaded: number; total: number }) => void
): Promise<void> {
  if (await isTranslationModelInstalled(language)) return
  const entry = TRANSLATION_REGISTRY[language]
  if (!entry) throw new Error(`No translation model for ${language}`)

  const op = downloadAsset({
    assetSrc: entry.src,
    onProgress: (progress: ModelProgressUpdate) => {
      onProgress?.({
        percentage: progress.percentage,
        downloaded: progress.downloaded,
        total: progress.total,
      })
    },
  })
  activeDownloadRequestId = op.requestId
  try {
    await op
    await markTranslationInstalled(language)
  } finally {
    activeDownloadRequestId = null
  }
}

export async function getTranslationInstallStatus(): Promise<
  Partial<Record<QvacOutputLanguage, boolean>>
> {
  const entries = await Promise.all(
    (Object.keys(TRANSLATION_REGISTRY) as Array<Exclude<QvacOutputLanguage, 'en'>>).map(
      async (code) => [code, await isTranslationModelInstalled(code)] as const
    )
  )
  return { en: true, ...Object.fromEntries(entries) }
}

export async function cancelTranslationDownload() {
  if (!activeDownloadRequestId) return
  try {
    await cancel({ requestId: activeDownloadRequestId })
  } finally {
    activeDownloadRequestId = null
  }
}
