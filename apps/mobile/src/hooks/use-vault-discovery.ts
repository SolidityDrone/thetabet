import { fetchDiscoveryVaults } from '@/services/ponder/vault-discovery'
import type { DiscoveryVault, VaultSortKey } from '@/types/vault-discovery'
import { useCallback, useEffect, useState } from 'react'

export function useVaultDiscovery(initialSort: VaultSortKey = 'newest') {
  const [sortKey, setSortKey] = useState<VaultSortKey>(initialSort)
  const [vaults, setVaults] = useState<DiscoveryVault[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (refreshing = false) => {
      if (refreshing) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
      setError(null)

      try {
        const result = await fetchDiscoveryVaults(sortKey)
        setVaults(result.vaults)
        setTotalCount(result.totalCount)
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
        setVaults([])
        setTotalCount(0)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [sortKey]
  )

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(() => load(true), [load])

  return {
    vaults,
    totalCount,
    sortKey,
    setSortKey,
    isLoading,
    isRefreshing,
    error,
    refresh,
  }
}
