import { useCallback, useEffect, useState } from 'react'

import { fetchDiscoveryVaultById } from '@/services/ponder/vault-discovery'
import type { DiscoveryVault } from '@/types/vault-discovery'

export function useVaultDetail(vaultId?: string) {
  const [vault, setVault] = useState<DiscoveryVault | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (refreshing = false) => {
      if (!vaultId) {
        setVault(null)
        setError(null)
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      if (refreshing) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
      setError(null)

      try {
        const next = await fetchDiscoveryVaultById(vaultId)
        setVault(next)
        if (!next) {
          setError('Vault not found')
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
        setVault(null)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [vaultId]
  )

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(() => load(true), [load])

  return {
    vault,
    isLoading,
    isRefreshing,
    error,
    refresh,
  }
}
