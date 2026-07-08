import { getModelInfo } from '@qvac/sdk'
import { loadQvacSettings } from '@/services/qvac/qvac-settings'

let initAttempted = false
let initSuccess = false
let initError: string | null = null
let initPromise: Promise<boolean> | null = null

export async function ensureQvacInitialized(): Promise<boolean> {
  if (initAttempted) return initSuccess
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const settings = await loadQvacSettings()
      if (!settings) {
        initError = 'No settings loaded'
        initAttempted = true
        return false
      }

      await getModelInfo({ name: settings.modelPreset })
      initSuccess = true
    } catch (error) {
      initError = error instanceof Error ? error.message : String(error)
      console.error('QVAC initialization failed:', error)
      initSuccess = false
    } finally {
      initAttempted = true
    }
    return initSuccess
  })()

  return initPromise
}

export function isQvacAvailable(): boolean {
  return initAttempted && initSuccess
}

export function getQvacInitError(): string | null {
  return initError
}

export function resetQvacInit(): void {
  initAttempted = false
  initSuccess = false
  initError = null
  initPromise = null
}
