import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { BET_TOKEN_DECIMALS, formatBetToken } from '@/config/theta'
import { useConfirmSheet } from '@/context/confirm-sheet'
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio'
import {
  depositIntoVault,
  previewVaultDeposit,
  previewVaultWithdraw,
  readVaultDepositWhitelist,
  withdrawFromVault,
  type VaultDepositStage,
  type VaultWithdrawStage,
} from '@/services/theta-vault'
import type { DiscoveryVault } from '@/types/vault-discovery'
import getErrorMessage from '@/utils/get-error-message'
import { X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { toast } from 'sonner-native'
import type { Address } from 'viem'
import { formatUnits } from 'viem'

type PositionMode = 'add' | 'withdraw'

type Props = {
  vault: DiscoveryVault
  investorAddress?: string
  hasSkippedWallet: boolean
  hasPosition: boolean
  positionUsdtNumber: number
  maxWithdrawNumber: number
  onComplete?: () => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

const QUICK_STAKES = ['10', '25', '50', '100']

function formatAmount(value: number, digits = 2) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function VaultPositionPanel({
  vault,
  investorAddress,
  hasSkippedWallet,
  hasPosition,
  positionUsdtNumber,
  maxWithdrawNumber,
  onComplete,
  expanded,
  onExpandedChange,
}: Props) {
  const { confirm, alert } = useConfirmSheet()
  const { assets, refresh: refreshBalances } = useWalletPortfolio()
  const [mode, setMode] = useState<PositionMode>('add')
  const [amount, setAmount] = useState('25')
  const [previewShares, setPreviewShares] = useState<bigint | null>(null)
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const usdtBalance = useMemo(() => {
    const asset = assets.find((item) => item.asset.id === 'betToken')
    return asset?.balanceNumber ?? 0
  }, [assets])

  const amountNumber = Number(amount)
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0

  const exceedsDepositBalance = mode === 'add' && amountValid && amountNumber > usdtBalance
  const exceedsWithdrawMax = mode === 'withdraw' && amountValid && amountNumber > maxWithdrawNumber

  useEffect(() => {
    if (!investorAddress || hasSkippedWallet) {
      setIsWhitelisted(null)
      return
    }

    let cancelled = false
    void readVaultDepositWhitelist(investorAddress as Address)
      .then((allowed) => {
        if (!cancelled) setIsWhitelisted(allowed)
      })
      .catch(() => {
        if (!cancelled) setIsWhitelisted(null)
      })

    return () => {
      cancelled = true
    }
  }, [investorAddress, hasSkippedWallet])

  useEffect(() => {
    if (!expanded || !amountValid || !vault.address) {
      setPreviewShares(null)
      return
    }

    let cancelled = false
    setIsPreviewLoading(true)

    const preview =
      mode === 'add'
        ? previewVaultDeposit(vault.address as Address, amount)
        : previewVaultWithdraw(vault.address as Address, amount)

    void preview
      .then((shares) => {
        if (!cancelled) setPreviewShares(shares)
      })
      .catch(() => {
        if (!cancelled) setPreviewShares(null)
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [amount, amountValid, expanded, mode, vault.address])

  const blockedReason = useMemo(() => {
    if (hasSkippedWallet) {
      return 'Connect a real wallet to manage vault positions.'
    }
    if (!investorAddress) {
      return 'Unlock your wallet first.'
    }
    if (isWhitelisted === false) {
      return 'This wallet is not whitelisted for vault actions yet.'
    }
    if (!amountValid) {
      return 'Enter a valid amount.'
    }
    if (mode === 'add' && exceedsDepositBalance) {
      return 'Insufficient USDT balance.'
    }
    if (mode === 'withdraw' && !hasPosition) {
      return 'You have no shares to withdraw.'
    }
    if (mode === 'withdraw' && exceedsWithdrawMax) {
      return `Max withdrawable now: ${formatAmount(maxWithdrawNumber)} USDT.`
    }
    return null
  }, [
    amountValid,
    exceedsDepositBalance,
    exceedsWithdrawMax,
    hasPosition,
    hasSkippedWallet,
    investorAddress,
    isWhitelisted,
    maxWithdrawNumber,
    mode,
  ])

  const previewSharesLabel = previewShares
    ? formatUnits(previewShares, BET_TOKEN_DECIMALS)
    : null

  const handleDeposit = useCallback(async () => {
    if (blockedReason || !investorAddress) {
      await alert({ title: 'Cannot add', message: blockedReason ?? 'Wallet not ready.' })
      return
    }

    const sharesLabel = previewShares ? formatBetToken(previewShares, 4) : '—'

    const confirmed = await confirm({
      title: 'Confirm deposit',
      message: [
        `Vault: ${vault.name}`,
        `Add: ${amount} USDT`,
        `You receive: ~${sharesLabel} ${vault.symbol} shares`,
      ].join('\n'),
      confirmLabel: 'Approve & deposit',
    })

    if (!confirmed) return

    setIsSubmitting(true)
    const stageMessages: Record<VaultDepositStage, string> = {
      approving: 'Approving USDT…',
      'waiting-approval': 'Waiting for approval…',
      depositing: 'Depositing…',
      confirming: 'Confirming…',
    }
    let progressToast = toast.loading(stageMessages.approving)

    try {
      await depositIntoVault({
        from: investorAddress as Address,
        vaultAddress: vault.address as Address,
        amount,
        onStage: (stage) => {
          toast.dismiss(progressToast)
          progressToast = toast.loading(stageMessages[stage])
        },
      })
      toast.dismiss(progressToast)
      toast.success('Deposit confirmed', {
        description: `+${amount} USDT in ${vault.name}`,
      })
      void refreshBalances()
      onComplete?.()
      onExpandedChange(false)
    } catch (depositError) {
      toast.dismiss(progressToast)
      const message = getErrorMessage(depositError, 'Deposit failed')
      toast.error('Deposit failed', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    alert,
    amount,
    blockedReason,
    confirm,
    investorAddress,
    onComplete,
    onExpandedChange,
    previewShares,
    refreshBalances,
    vault.address,
    vault.name,
    vault.symbol,
  ])

  const handleWithdraw = useCallback(async () => {
    if (blockedReason || !investorAddress) {
      await alert({ title: 'Cannot withdraw', message: blockedReason ?? 'Wallet not ready.' })
      return
    }

    const sharesLabel = previewShares ? formatBetToken(previewShares, 4) : '—'

    const confirmed = await confirm({
      title: 'Confirm withdrawal',
      message: [
        `Vault: ${vault.name}`,
        `Withdraw: ${amount} USDT`,
        `Redeem: ~${sharesLabel} ${vault.symbol} shares`,
      ].join('\n'),
      confirmLabel: 'Withdraw',
    })

    if (!confirmed) return

    setIsSubmitting(true)
    const stageMessages: Record<VaultWithdrawStage, string> = {
      withdrawing: 'Withdrawing…',
      confirming: 'Confirming…',
    }
    let progressToast = toast.loading(stageMessages.withdrawing)

    try {
      await withdrawFromVault({
        from: investorAddress as Address,
        vaultAddress: vault.address as Address,
        amount,
        onStage: (stage) => {
          toast.dismiss(progressToast)
          progressToast = toast.loading(stageMessages[stage])
        },
      })
      toast.dismiss(progressToast)
      toast.success('Withdrawal confirmed', {
        description: `${amount} USDT from ${vault.name}`,
      })
      void refreshBalances()
      onComplete?.()
      onExpandedChange(false)
    } catch (withdrawError) {
      toast.dismiss(progressToast)
      const message = getErrorMessage(withdrawError, 'Withdrawal failed')
      toast.error('Withdrawal failed', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    alert,
    amount,
    blockedReason,
    confirm,
    investorAddress,
    onComplete,
    onExpandedChange,
    previewShares,
    refreshBalances,
    vault.address,
    vault.name,
    vault.symbol,
  ])

  const ctaLabel = hasPosition ? 'Update position' : 'Invest in vault'

  const setWithdrawFraction = (fraction: number) => {
    if (maxWithdrawNumber <= 0) return
    const next = maxWithdrawNumber * fraction
    setAmount(next.toFixed(6).replace(/\.?0+$/, ''))
  }

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => onExpandedChange(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaButtonText}>{ctaLabel}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{hasPosition ? 'Manage position' : 'Invest in vault'}</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => onExpandedChange(false)}
          hitSlop={8}
        >
          <X color={colors.textSecondary} size={18} />
        </TouchableOpacity>
      </View>

      {hasPosition ? (
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeChip, mode === 'add' && styles.modeChipActive]}
            onPress={() => {
              setMode('add')
              setAmount('25')
            }}
          >
            <Text style={[styles.modeChipText, mode === 'add' && styles.modeChipTextActive]}>
              Add USDT
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, mode === 'withdraw' && styles.modeChipActive]}
            onPress={() => {
              setMode('withdraw')
              const defaultWithdraw = Math.min(25, maxWithdrawNumber)
              setAmount(defaultWithdraw > 0 ? String(defaultWithdraw) : '0')
            }}
          >
            <Text style={[styles.modeChipText, mode === 'withdraw' && styles.modeChipTextActive]}>
              Withdraw
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.balanceHint}>
        {mode === 'add'
          ? `Wallet: ${formatAmount(usdtBalance)} USDT`
          : `Position: ${formatAmount(positionUsdtNumber)} USDT · max withdraw ${formatAmount(maxWithdrawNumber)} USDT`}
      </Text>

      {mode === 'add' ? (
        <View style={styles.quickRow}>
          {QUICK_STAKES.map((value) => {
            const selected = amount === value
            return (
              <TouchableOpacity
                key={value}
                style={[styles.quickChip, selected && styles.quickChipSelected]}
                onPress={() => setAmount(value)}
              >
                <Text style={[styles.quickChipText, selected && styles.quickChipTextSelected]}>
                  {value}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ) : (
        <View style={styles.quickRow}>
          {[
            { label: '25%', fraction: 0.25 },
            { label: '50%', fraction: 0.5 },
            { label: 'Max', fraction: 1 },
          ].map(({ label, fraction }) => (
            <TouchableOpacity
              key={label}
              style={styles.quickChip}
              onPress={() => setWithdrawFraction(fraction)}
            >
              <Text style={styles.quickChipText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputWrap}>
        <Text style={styles.inputLabel}>
          {mode === 'add' ? 'Amount to add (USDT)' : 'Amount to withdraw (USDT)'}
        </Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder={mode === 'add' ? '25' : '10'}
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      <View style={styles.previewRow}>
        <Text style={styles.previewLabel}>
          {mode === 'add' ? 'You receive' : 'Shares to redeem'}
        </Text>
        {isPreviewLoading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Text style={styles.previewValue}>
            {previewSharesLabel ? `${previewSharesLabel} ${vault.symbol}` : '—'}
          </Text>
        )}
      </View>

      {blockedReason ? <Text style={styles.blockedText}>{blockedReason}</Text> : null}

      <TouchableOpacity
        style={[
          styles.submitButton,
          (isSubmitting || Boolean(blockedReason)) && styles.submitButtonDisabled,
        ]}
        onPress={mode === 'add' ? handleDeposit : handleWithdraw}
        disabled={isSubmitting || Boolean(blockedReason)}
        activeOpacity={0.85}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.submitButtonText}>
            {mode === 'add' ? 'Approve & deposit' : 'Withdraw USDT'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  ctaButton: {
    borderRadius: theme.radius.sharp,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 48,
  },
  ctaButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  panel: {
    gap: 10,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDark,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    flex: 1,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  modeChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  modeChipTextActive: {
    color: colors.primary,
  },
  balanceHint: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickChip: {
    flex: 1,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    paddingVertical: 8,
    alignItems: 'center',
  },
  quickChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  quickChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  quickChipTextSelected: {
    color: colors.primary,
  },
  inputWrap: {
    gap: 4,
  },
  inputLabel: {
    ...theme.typography.caption,
    fontSize: 10,
  },
  input: {
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.neonMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  previewValue: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  blockedText: {
    color: colors.warning,
    fontSize: 11,
    lineHeight: 16,
  },
  submitButton: {
    borderRadius: theme.radius.sharp,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 48,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
})
