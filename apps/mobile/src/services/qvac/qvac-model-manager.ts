import {
  cancel,
  downloadAsset,
  getModelInfo,
  QWEN3_600M_INST_Q4,
  SMOLLM2_360M_INST_Q8,
  type ModelProgressUpdate,
} from '@qvac/sdk'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { QvacModelPreset } from '@/services/qvac/qvac-settings'

export type QvacModelStatus = {
  preset: QvacModelPreset
  name: string
  label: string
  sizeBytes: number
  isCached: boolean
  isLoaded: boolean
}

export type QvacDownloadProgress = {
  percentage: number
  downloaded: number
  total: number
}

type RegistryModel = {
  name: string
  src: string
  expectedSize: number
  label: string
}

const MODEL_REGISTRY: Record<QvacModelPreset, RegistryModel> = {
  'smollm2-360m-instruct-q8': {
    ...SMOLLM2_360M_INST_Q8,
    label: 'SmolLM2 360M',
  },
  'qwen3-600m-instruct-q4': {
    ...QWEN3_600M_INST_Q4,
    label: 'Qwen3 600M',
  },
}

let activeDownloadRequestId: string | null = null

const INSTALL_KEY_PREFIX = 'thetabet.qvac.modelInstalled.v1.'

function installKey(preset: QvacModelPreset) {
  return `${INSTALL_KEY_PREFIX}${preset}`
}

/**
 * Fast, zero-QVAC-worker check for whether the app believes the model is installed.
 * This does NOT verify the actual QVAC cache on disk (that requires booting QVAC).
 */
export async function isQvacModelMarkedInstalled(preset: QvacModelPreset): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(installKey(preset))
    return value === '1'
  } catch {
    return false
  }
}

async function markInstalled(preset: QvacModelPreset): Promise<void> {
  try {
    await AsyncStorage.setItem(installKey(preset), '1')
  } catch {
    // ignore
  }
}

export async function clearInstalledMark(preset: QvacModelPreset): Promise<void> {
  try {
    await AsyncStorage.removeItem(installKey(preset))
  } catch {
    // ignore
  }
}

export function getQvacModelRegistry(preset: QvacModelPreset) {
  return MODEL_REGISTRY[preset]
}

export function formatModelSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`
}

export async function getQvacModelStatus(preset: QvacModelPreset): Promise<QvacModelStatus> {
  const entry = getQvacModelRegistry(preset)
  const info = await getModelInfo({ name: entry.name })
  return {
    preset,
    name: entry.name,
    label: entry.label,
    sizeBytes: info.expectedSize ?? entry.expectedSize,
    isCached: info.isCached,
    isLoaded: info.isLoaded,
  }
}

export async function cancelQvacDownload() {
  if (!activeDownloadRequestId) return
  try {
    await cancel({ requestId: activeDownloadRequestId })
  } finally {
    activeDownloadRequestId = null
  }
}

export async function downloadQvacModel(
  preset: QvacModelPreset,
  onProgress?: (progress: QvacDownloadProgress) => void
): Promise<void> {
  if (await isQvacModelMarkedInstalled(preset)) return

  const entry = getQvacModelRegistry(preset)

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
    await markInstalled(preset)
  } finally {
    activeDownloadRequestId = null
  }
}
