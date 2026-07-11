import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
} from 'expo-keep-awake'
import { useEffect } from 'react'

const SCOUT_TAG = 'thetabet-scout-inference'

function isKeepAwakeUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return msg.includes('Unable to activate keep awake')
}

/** Activate screen wake lock; no-op if Android activity is not ready yet. */
export async function safeActivateKeepAwake(tag: string = SCOUT_TAG): Promise<void> {
  try {
    await activateKeepAwakeAsync(tag)
  } catch (error) {
    if (!isKeepAwakeUnavailableError(error)) throw error
  }
}

/** Release screen wake lock; ignores deactivate races on Android. */
export async function safeDeactivateKeepAwake(tag: string = SCOUT_TAG): Promise<void> {
  try {
    await deactivateKeepAwake(tag)
  } catch {
    // Activity may already be gone — safe to ignore.
  }
}

/** Keep the screen on while long on-device inference is running. */
export function useInferenceKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let cancelled = false
    void safeActivateKeepAwake(SCOUT_TAG).then(() => {
      if (cancelled) void safeDeactivateKeepAwake(SCOUT_TAG)
    })
    return () => {
      cancelled = true
      void safeDeactivateKeepAwake(SCOUT_TAG)
    }
  }, [active])
}
