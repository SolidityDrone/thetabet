import AsyncStorage from '@react-native-async-storage/async-storage'

export type QvacModelPreset = 'smollm2-360m-instruct-q8' | 'qwen3-600m-instruct-q4'

export type QvacUserSettings = {
  modelPreset: QvacModelPreset
  ctxSize: number
}

const STORAGE_KEY = 'thetabet.qvac.settings.v1'

const MIN_CTX = 1536
const MAX_CTX = 4096

const DEFAULT_SETTINGS: QvacUserSettings = {
  modelPreset: 'smollm2-360m-instruct-q8',
  ctxSize: 2048,
}

function clampCtxSize(value: number): number {
  return Math.min(MAX_CTX, Math.max(MIN_CTX, Math.round(value)))
}

function normalizeModelPreset(value: unknown): QvacModelPreset {
  if (
    value === 'smollm2-360m-instruct-q8' ||
    value === 'qwen3-600m-instruct-q4'
  ) {
    return value
  }
  return DEFAULT_SETTINGS.modelPreset
}

export async function loadQvacSettings(): Promise<QvacUserSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<QvacUserSettings>
    return {
      modelPreset: normalizeModelPreset(parsed.modelPreset),
      ctxSize:
        typeof parsed.ctxSize === 'number' && Number.isFinite(parsed.ctxSize)
          ? clampCtxSize(parsed.ctxSize)
          : DEFAULT_SETTINGS.ctxSize,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveQvacSettings(next: QvacUserSettings): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...next,
      modelPreset: normalizeModelPreset(next.modelPreset),
      ctxSize: clampCtxSize(next.ctxSize),
    })
  )
}

export const QVAC_CTX_LIMITS = { min: MIN_CTX, max: MAX_CTX }

export const QVAC_MODEL_OPTIONS: Array<{
  preset: QvacModelPreset
  label: string
  description: string
}> = [
  {
    preset: 'smollm2-360m-instruct-q8',
    label: 'SmolLM2 360M',
    description: 'Lightest, best for phones',
  },
  {
    preset: 'qwen3-600m-instruct-q4',
    label: 'Qwen3 600M',
    description: 'Better reasoning, more RAM',
  },
]

