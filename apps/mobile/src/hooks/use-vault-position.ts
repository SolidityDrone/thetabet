import { BET_TOKEN_DECIMALS } from '@/config/theta'
import {
  previewVaultRedeemAssets,
  readVaultMaxWithdraw,
  readVaultShareBalance,
} from '@/services/theta-vault'
import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { formatUnits } from 'viem'

export function useVaultPosition(vaultAddress?: string, investorAddress?: string) {
  const [shares, setShares] = useState<bigint>(0n)
  const [maxWithdrawAssets, setMaxWithdrawAssets] = useState<bigint>(0n)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!vaultAddress || !investorAddress) {
      setShares(0n)
      setMaxWithdrawAssets(0n)
      return
    }

    setIsLoading(true)
    try {
      const [nextShares, maxAssets] = await Promise.all([
        readVaultShareBalance(vaultAddress as Address, investorAddress as Address),
        readVaultMaxWithdraw(vaultAddress as Address, investorAddress as Address),
      ])
      setShares(nextShares)
      setMaxWithdrawAssets(maxAssets)
    } catch {
      setShares(0n)
      setMaxWithdrawAssets(0n)
    } finally {
      setIsLoading(false)
    }
  }, [investorAddress, vaultAddress])

  useEffect(() => {
    void load()
  }, [load])

  const [positionUsdt, setPositionUsdt] = useState<bigint>(0n)

  useEffect(() => {
    if (!vaultAddress || shares <= 0n) {
      setPositionUsdt(0n)
      return
    }

    let cancelled = false
    void previewVaultRedeemAssets(vaultAddress as Address, shares)
      .then((assets) => {
        if (!cancelled) setPositionUsdt(assets)
      })
      .catch(() => {
        if (!cancelled) setPositionUsdt(0n)
      })

    return () => {
      cancelled = true
    }
  }, [shares, vaultAddress])

  const hasPosition = shares > 0n
  const positionUsdtNumber = Number(formatUnits(positionUsdt, BET_TOKEN_DECIMALS))
  const maxWithdrawNumber = Number(formatUnits(maxWithdrawAssets, BET_TOKEN_DECIMALS))

  return {
    shares,
    positionUsdt,
    positionUsdtNumber,
    maxWithdrawAssets,
    maxWithdrawNumber,
    hasPosition,
    isLoading,
    refresh: load,
  }
}
