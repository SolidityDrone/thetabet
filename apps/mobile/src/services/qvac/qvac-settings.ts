import AsyncStorage from '@react-native-async-storage/async-storage'

/** Bergamot target languages for scout output (source is always English). */
export type QvacOutputLanguage =
  | 'en'
  | 'it'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'nl'
  | 'pl'
  | 'ro'
  | 'ru'
  | 'tr'
  | 'uk'
  | 'zh'

export type QvacModelPreset =
  | 'qwen3-600m-instruct-q4'
  | 'qwen3.5-0.8b-multimodal-q4_k_m'
  | 'llama-3.2-1b-instruct-q4_0'
  | 'qwen3-1.7b-instruct-q4'
  | 'qwen3.5-2b-multimodal-q4_k_m'

export type QvacUserSettings = {
  modelPreset: QvacModelPreset
  ctxSize: number
  outputLanguage: QvacOutputLanguage
}

const STORAGE_KEY = 'thetabet.qvac.settings.v2'

const MIN_CTX = 1536
const MAX_CTX = 8192

const DEFAULT_SETTINGS: QvacUserSettings = {
  modelPreset: 'qwen3.5-0.8b-multimodal-q4_k_m',
  ctxSize: 2048,
  outputLanguage: 'en',
}

/** Safer default context per model — large ctx OOMs small models on phone RAM. */
const MODEL_DEFAULT_CTX: Partial<Record<QvacModelPreset, number>> = {
  'qwen3-600m-instruct-q4': 2048,
  'qwen3.5-0.8b-multimodal-q4_k_m': 2048,
  'llama-3.2-1b-instruct-q4_0': 2048,
  'qwen3-1.7b-instruct-q4': 3072,
  'qwen3.5-2b-multimodal-q4_k_m': 3072,
}

/** Per-model practical context ceiling (device RAM; model may advertise higher). */
const MODEL_CTX_MAX: Partial<Record<QvacModelPreset, number>> = {
  'qwen3-600m-instruct-q4': 4096,
  'qwen3.5-0.8b-multimodal-q4_k_m': 4096,
  'llama-3.2-1b-instruct-q4_0': 8192,
}

export const QVAC_CTX_LIMITS = { min: MIN_CTX, max: MAX_CTX, step: 256 }

export function getDefaultCtxForPreset(preset: QvacModelPreset): number {
  return MODEL_DEFAULT_CTX[preset] ?? 2048
}

export function getCtxLimitsForPreset(preset: QvacModelPreset) {
  return {
    min: MIN_CTX,
    max: MODEL_CTX_MAX[preset] ?? MAX_CTX,
    step: QVAC_CTX_LIMITS.step,
  }
}

function clampCtxSizeForPreset(value: number, preset: QvacModelPreset): number {
  const { min, max } = getCtxLimitsForPreset(preset)
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampCtxSize(value: number, preset: QvacModelPreset = DEFAULT_SETTINGS.modelPreset): number {
  return clampCtxSizeForPreset(value, preset)
}

function normalizeModelPreset(value: unknown): QvacModelPreset {
  const presets: QvacModelPreset[] = [
    'qwen3-600m-instruct-q4',
    'qwen3.5-0.8b-multimodal-q4_k_m',
    'llama-3.2-1b-instruct-q4_0',
    'qwen3-1.7b-instruct-q4',
    'qwen3.5-2b-multimodal-q4_k_m',
  ]
  if (presets.includes(value as QvacModelPreset)) return value as QvacModelPreset
  return DEFAULT_SETTINGS.modelPreset
}

function normalizeOutputLanguage(value: unknown): QvacOutputLanguage {
  const langs: QvacOutputLanguage[] = [
    'en',
    'it',
    'es',
    'fr',
    'de',
    'pt',
    'nl',
    'pl',
    'ro',
    'ru',
    'tr',
    'uk',
    'zh',
  ]
  if (langs.includes(value as QvacOutputLanguage)) return value as QvacOutputLanguage
  return DEFAULT_SETTINGS.outputLanguage
}

export async function loadQvacSettings(): Promise<QvacUserSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacy = await AsyncStorage.getItem('thetabet.qvac.settings.v1')
      if (legacy) {
        const parsed = JSON.parse(legacy) as Partial<QvacUserSettings>
        return {
          modelPreset: normalizeModelPreset(parsed.modelPreset),
          ctxSize:
            typeof parsed.ctxSize === 'number' && Number.isFinite(parsed.ctxSize)
              ? clampCtxSize(parsed.ctxSize, normalizeModelPreset(parsed.modelPreset))
              : DEFAULT_SETTINGS.ctxSize,
          outputLanguage: DEFAULT_SETTINGS.outputLanguage,
        }
      }
      return DEFAULT_SETTINGS
    }
    const parsed = JSON.parse(raw) as Partial<QvacUserSettings>
    const modelPreset = normalizeModelPreset(parsed.modelPreset)
    return {
      modelPreset,
      ctxSize:
        typeof parsed.ctxSize === 'number' && Number.isFinite(parsed.ctxSize)
          ? clampCtxSize(parsed.ctxSize, modelPreset)
          : DEFAULT_SETTINGS.ctxSize,
      outputLanguage: normalizeOutputLanguage(parsed.outputLanguage),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveQvacSettings(next: QvacUserSettings): Promise<void> {
  const modelPreset = normalizeModelPreset(next.modelPreset)
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...next,
      modelPreset,
      ctxSize: clampCtxSize(next.ctxSize, modelPreset),
      outputLanguage: normalizeOutputLanguage(next.outputLanguage),
    })
  )
}

export const QVAC_OUTPUT_LANGUAGE_OPTIONS: Array<{
  code: QvacOutputLanguage
  label: string
  nativeLabel: string
  flag: string
}> = [
  { code: 'en', label: 'English', nativeLabel: 'English (no translation)', flag: '🇬🇧' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', flag: '🇮🇹' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', flag: '🇵🇹' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski', flag: '🇵🇱' },
  { code: 'ro', label: 'Romanian', nativeLabel: 'Română', flag: '🇷🇴' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', flag: '🇷🇺' },
  { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe', flag: '🇹🇷' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська', flag: '🇺🇦' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文', flag: '🇨🇳' },
]

export const QVAC_MODEL_OPTIONS: Array<{
  preset: QvacModelPreset
  label: string
  description: string
}> = [
  {
    preset: 'qwen3-600m-instruct-q4',
    label: 'Qwen3 600M',
    description: '382 MB — Qwen3 arch, 32K ctx',
  },
  {
    preset: 'qwen3.5-0.8b-multimodal-q4_k_m',
    label: 'Qwen3.5 0.8B',
    description: '532 MB — text-only scout, max 4K ctx on phone',
  },
  {
    preset: 'llama-3.2-1b-instruct-q4_0',
    label: 'Llama 3.2 1B',
    description: '773 MB — Meta instruct, 8K ctx',
  },
  {
    preset: 'qwen3-1.7b-instruct-q4',
    label: 'Qwen3 1.7B',
    description: '1 GB — best reasoning for most phones',
  },
  {
    preset: 'qwen3.5-2b-multimodal-q4_k_m',
    label: 'Qwen3.5 2B',
    description: '1.28 GB — best quality on high-end phones',
  },
]

