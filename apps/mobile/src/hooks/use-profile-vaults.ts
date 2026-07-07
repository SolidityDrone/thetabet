import type { IndexedPosition, IndexedVault } from '@/types/indexed-vault'
import { calcRoiPercent, calcWinRate, formatBetToken } from '@/config/theta'
import { ponderQuery } from '@/services/ponder/client'
import { fetchDiscoveryVaults } from '@/services/ponder/vault-discovery'
import { readOnChainTipsterProfile, readOnChainVaultSnapshot } from '@/services/theta-vault'
import { useCallback, useEffect, useState } from 'react'

export type { IndexedPosition, IndexedVault } from '@/types/indexed-vault'

type PonderVaultRow = IndexedVault & {
  positions?: { totalCount: number }
}

type InvestorProfileResponse = {
  investorPositions: { items: IndexedPosition[] }
  vaults: { items: PonderVaultRow[] }
  tipsterNames: { items: Array<{ address: string; name: string; pubKeyX: string; pubKeyY: string }> }
}

type VaultByIdResponse = {
  vault: PonderVaultRow | null
}

const PROFILE_QUERY = `
  query InvestorProfile($address: String!) {
    investorPositions(where: { investor: $address }, limit: 50) {
      items {
        id
        vaultId
        vaultAddress
        investor
        shares
        vault {
          id
          address
          tipster
          tipsterHandle
          name
          symbol
          freeBalance
          totalAssets
          shareSupply
          openBets
          pendingClaimable
          settledWins
          settledLosses
          totalStaked
          totalPayout
        }
      }
    }
    vaults(where: { tipster: $address }, limit: 1) {
      items {
        id
        address
        tipster
        tipsterHandle
        name
        symbol
        freeBalance
        totalAssets
        shareSupply
        openBets
        pendingClaimable
        settledWins
        settledLosses
        totalStaked
        totalPayout
        positions(where: { shares_gt: "0" }, limit: 1) {
          totalCount
        }
      }
    }
    tipsterNames(where: { address: $address }, limit: 1) {
      items {
        address
        name
        pubKeyX
        pubKeyY
      }
    }
  }
`

const VAULT_BY_ID_QUERY = `
  query VaultById($id: BigInt!) {
    vault(id: $id) {
      id
      address
      tipster
      tipsterHandle
      name
      symbol
      freeBalance
      totalAssets
      shareSupply
      openBets
      pendingClaimable
      settledWins
      settledLosses
      totalStaked
      totalPayout
      positions(where: { shares_gt: "0" }, limit: 1) {
        totalCount
      }
    }
  }
`

function mapPonderVault(row: PonderVaultRow, handle: string | null): IndexedVault {
  const { positions, ...vault } = row
  return {
    ...vault,
    tipsterHandle: vault.tipsterHandle || handle || '',
    subscriberCount: positions?.totalCount ?? 0,
  }
}

async function loadPonderProfile(address: string, vaultId: bigint) {
  const normalizedAddress = address.toLowerCase()
  const data = await ponderQuery<InvestorProfileResponse>(PROFILE_QUERY, {
    address: normalizedAddress,
  })

  let vault = data.vaults.items[0] ?? null
  if (!vault && vaultId > 0n) {
    const byId = await ponderQuery<VaultByIdResponse>(VAULT_BY_ID_QUERY, {
      id: vaultId.toString(),
    })
    vault = byId.vault
  }

  return {
    positions: data.investorPositions.items.filter((p) => p.shares !== '0'),
    vault: vault ? mapPonderVault(vault, data.tipsterNames.items[0]?.name ?? null) : null,
    handle: data.tipsterNames.items[0]?.name ?? null,
  }
}

async function loadOnChainProfile(address: `0x${string}`) {
  try {
    const onChain = await readOnChainTipsterProfile(address)
    if (!onChain.hasVault) {
      return {
        onChain,
        chainVault: null as IndexedVault | null,
      }
    }

    const chainVault = await readOnChainVaultSnapshot(address, onChain.handle)
    return { onChain, chainVault }
  } catch {
    return {
      onChain: { vaultId: 0n, handle: null, hasVault: false },
      chainVault: null as IndexedVault | null,
    }
  }
}

export function vaultStatsSummary(vault: IndexedVault) {
  const totalStaked = BigInt(vault.totalStaked || '0')
  const totalPayout = BigInt(vault.totalPayout || '0')
  const winRate = calcWinRate(vault.settledWins, vault.settledLosses)
  const roi = calcRoiPercent(totalStaked, totalPayout)

  return {
    liquidity: formatBetToken(vault.totalAssets),
    freeLiquidity: formatBetToken(vault.freeBalance),
    pendingWins: formatBetToken(vault.pendingClaimable),
    openBets: vault.openBets,
    subscribers:
      vault.subscriberCount === null || vault.subscriberCount === undefined
        ? '—'
        : String(vault.subscriberCount),
    winRate: winRate === null ? '—' : `${winRate.toFixed(1)}%`,
    roi: roi === null ? '—' : `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
    record: `${vault.settledWins}W / ${vault.settledLosses}L`,
  }
}

export function formatTipsterHandle(handle?: string | null, fallbackAddress?: string) {
  if (handle) return `@${handle}`
  if (fallbackAddress) return fallbackAddress.slice(0, 6) + '…' + fallbackAddress.slice(-4)
  return 'Unknown'
}

export function useProfileVaults(address: string) {
  const [positions, setPositions] = useState<IndexedPosition[]>([])
  const [tipsterVault, setTipsterVault] = useState<IndexedVault | null>(null)
  const [tipsterHandle, setTipsterHandle] = useState<string | null>(null)
  const [onChainHasVault, setOnChainHasVault] = useState(false)
  const [vaultFromIndexer, setVaultFromIndexer] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isIndexerLoading, setIsIndexerLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!address) {
      setPositions([])
      setTipsterVault(null)
      setTipsterHandle(null)
      setOnChainHasVault(false)
      setVaultFromIndexer(false)
      setError(null)
      setIsLoading(false)
      setIsIndexerLoading(false)
      return
    }

    setIsLoading(true)
    setIsIndexerLoading(true)
    setError(null)

    const wallet = address as `0x${string}`

    const [onChainResult, ponderResult] = await Promise.allSettled([
      loadOnChainProfile(wallet),
      loadPonderProfile(address, 0n),
    ])

    const onChain =
      onChainResult.status === 'fulfilled'
        ? onChainResult.value
        : { onChain: { vaultId: 0n, handle: null, hasVault: false }, chainVault: null }

    let ponder: Awaited<ReturnType<typeof loadPonderProfile>> | null = null
    let ponderError: string | null = null

    if (ponderResult.status === 'fulfilled') {
      ponder = ponderResult.value
    } else {
      ponderError =
        ponderResult.reason instanceof Error
          ? ponderResult.reason.message
          : String(ponderResult.reason)
    }

    if (!ponder?.vault && onChain.onChain.vaultId > 0n) {
      try {
        ponder = await loadPonderProfile(address, onChain.onChain.vaultId)
        ponderError = null
      } catch (retryError) {
        ponderError =
          retryError instanceof Error ? retryError.message : String(retryError)
      }
    }

    if (!ponder?.vault) {
      try {
        const discovery = await fetchDiscoveryVaults('newest', 100)
        const matched =
          discovery.vaults.find(
            (vault) => vault.tipster.toLowerCase() === address.toLowerCase()
          ) ?? null
        if (matched) {
          let handle = ponder?.handle ?? matched.tipsterHandle ?? null
          if (!handle) {
            try {
              const names = await ponderQuery<{
                tipsterNames: { items: Array<{ name: string }> }
              }>(
                `query TipsterName($address: String!) {
                  tipsterNames(where: { address: $address }, limit: 1) {
                    items { name }
                  }
                }`,
                { address: address.toLowerCase() }
              )
              handle = names.tipsterNames.items[0]?.name ?? null
            } catch {
              // Handle lookup is best-effort.
            }
          }

          ponder = {
            positions: ponder?.positions ?? [],
            vault: { ...matched, tipsterHandle: matched.tipsterHandle || handle || '' },
            handle,
          }
          ponderError = null
        }
      } catch {
        // Discovery fallback is best-effort.
      }
    }

    const mergedVault = ponder?.vault ?? onChain.chainVault
    const mergedHandle = ponder?.handle ?? onChain.onChain.handle ?? mergedVault?.tipsterHandle ?? null
    const hasVault = Boolean(mergedVault) || onChain.onChain.hasVault || Boolean(ponder?.vault)

    setOnChainHasVault(hasVault)
    setTipsterHandle(mergedHandle || null)
    setTipsterVault(mergedVault)
    setVaultFromIndexer(Boolean(ponder?.vault))
    setPositions(ponder?.positions ?? [])
    setError(mergedVault || hasVault ? null : ponderError)

    setIsLoading(false)
    setIsIndexerLoading(false)
  }, [address])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    positions,
    tipsterVault,
    tipsterHandle,
    onChainHasVault,
    vaultFromIndexer,
    isTipster: tipsterVault !== null || onChainHasVault,
    isLoading,
    isIndexerLoading,
    error,
    refresh,
  }
}
