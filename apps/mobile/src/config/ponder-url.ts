import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { PONDER_TUNNEL_URL } from '@/config/tunnel.generated'

const LOCAL_GRAPHQL = 'http://127.0.0.1:42069/graphql'
const EMULATOR_GRAPHQL = 'http://10.0.2.2:42069/graphql'

function withGraphqlPath(base: string): string {
  return base.endsWith('/graphql') ? base : `${base.replace(/\/$/, '')}/graphql`
}

function hasActiveTunnel(): boolean {
  return Boolean(
    PONDER_TUNNEL_URL &&
      !PONDER_TUNNEL_URL.includes('localhost') &&
      PONDER_TUNNEL_URL.startsWith('https://')
  )
}

/** Ordered list of Ponder GraphQL endpoints to try (most reliable first). */
export function getPonderGraphqlCandidates(): string[] {
  const explicit = process.env.EXPO_PUBLIC_PONDER_URL?.trim()
  if (explicit) return [withGraphqlPath(explicit)]

  const candidates: string[] = []
  const useLocal = process.env.EXPO_PUBLIC_PONDER_USE_LOCAL === '1'

  if (__DEV__) {
    if (Platform.OS === 'android') {
      // USB device: adb reverse makes host Ponder available at 127.0.0.1:42069.
      // Emulator: 10.0.2.2 is the host loopback alias.
      candidates.push(Constants.isDevice ? LOCAL_GRAPHQL : EMULATOR_GRAPHQL)
    } else if (Platform.OS === 'ios') {
      candidates.push(LOCAL_GRAPHQL)
    }
  }

  // Tunnel is optional (Wi‑Fi devices without adb). Skip when local is preferred or tunnel is stale.
  if (hasActiveTunnel() && !useLocal) {
    candidates.push(withGraphqlPath(PONDER_TUNNEL_URL))
  }

  if (!candidates.includes(LOCAL_GRAPHQL)) {
    candidates.push(LOCAL_GRAPHQL)
  }

  return [...new Set(candidates)]
}

export function getPonderGraphqlUrl(): string {
  return getPonderGraphqlCandidates()[0] ?? LOCAL_GRAPHQL
}
