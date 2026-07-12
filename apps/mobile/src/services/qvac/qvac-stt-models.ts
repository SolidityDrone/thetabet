import {
  cancel,
  downloadAsset,
  WHISPER_TINY_Q8_0,
  type ModelProgressUpdate,
} from '@qvac/sdk'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { formatModelSize } from '@/services/qvac/qvac-model-manager'

const STT_MODEL = {
  ...WHISPER_TINY_Q8_0,
  label: 'Whisper Tiny (speech-to-text)',
}

const INSTALL_KEY = 'thetabet.qvac.sttInstalled.v1'

let activeDownloadRequestId: string | null = null

export function getSttModelSizeLabel(): string {
  return formatModelSize(STT_MODEL.expectedSize)
}

export async function isSttModelInstalled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INSTALL_KEY)) === '1'
  } catch {
    return false
  }
}

async function markSttInstalled(): Promise<void> {
  try {
    await AsyncStorage.setItem(INSTALL_KEY, '1')
  } catch {
    // ignore
  }
}

export async function downloadSttModel(
  onProgress?: (progress: { percentage: number; downloaded: number; total: number }) => void
): Promise<void> {
  if (await isSttModelInstalled()) return

  const op = downloadAsset({
    assetSrc: STT_MODEL.src,
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
    await markSttInstalled()
  } finally {
    activeDownloadRequestId = null
  }
}

export async function cancelSttDownload() {
  if (!activeDownloadRequestId) return
  try {
    await cancel({ requestId: activeDownloadRequestId })
  } finally {
    activeDownloadRequestId = null
  }
}

export function getSttModelRef() {
  return STT_MODEL
}
