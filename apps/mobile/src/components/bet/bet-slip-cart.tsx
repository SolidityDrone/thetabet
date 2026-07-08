import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { azuroBetToken } from '@/config/azuro'
import { useConfirmSheet } from '@/context/confirm-sheet'
import type { AzuroBetMode, AzuroBetSelection } from '@/types/azuro'
import { X } from 'lucide-react-native'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TIPSTER_QUICK_STAKES = ['1', '2', '5', '10', '25']

type Props = {
  selection: AzuroBetSelection
  mode: AzuroBetMode
  onModeChange: (mode: AzuroBetMode) => void
  canBetAsTipster: boolean
  tipsterLabel?: string
  vaultTotalUsdt?: number
  vaultFreeUsdt?: number
  vaultTotalLabel?: string
  stake: string
  onStakeChange: (value: string) => void
  effectiveStakeUsdt: number
  potentialPayout: number
  quoteText: string | null
  placementBlockedReason?: string | null
  isPlacing: boolean
  onClear: () => void
  onConfirm: () => void
}

export function BetSlipCart({
  selection,
  mode,
  onModeChange,
  canBetAsTipster,
  tipsterLabel,
  vaultTotalUsdt = 0,
  vaultFreeUsdt = 0,
  vaultTotalLabel,
  stake,
  onStakeChange,
  effectiveStakeUsdt,
  potentialPayout,
  quoteText,
  placementBlockedReason,
  isPlacing,
  onClear,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets()
  const { confirm, alert } = useConfirmSheet()
  const isTipster = mode === 'tipster'

  const handleConfirmPress = async () => {
    const stakeNum = Number(stake)

    if (isTipster) {
      if (!Number.isFinite(stakeNum) || stakeNum <= 0 || stakeNum > 100) {
        await alert({
          title: 'Invalid stake',
          message: 'Enter a vault stake between 0.1% and 100%.',
        })
        return
      }
      if (effectiveStakeUsdt <= 0) {
        await alert({
          title: 'Vault empty',
          message: 'Your vault has no liquidity to stake on this bet.',
        })
        return
      }
      if (vaultFreeUsdt > 0 && effectiveStakeUsdt > vaultFreeUsdt + 0.000001) {
        await alert({
          title: 'Not enough free liquidity',
          message: `Only ~${vaultFreeUsdt.toFixed(2)} USDT is free in your vault right now. Lower the stake % or wait for open bets to settle.`,
        })
        return
      }
    } else if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
      await alert({ title: 'Invalid stake', message: 'Enter a valid stake amount.' })
      return
    }

    if (placementBlockedReason) {
      await alert({ title: 'Bet not available', message: placementBlockedReason })
      return
    }

    if (isTipster) {
      const confirmed = await confirm({
        title: 'Confirm vault bet',
        message: [
          `${selection.gameTitle}`,
          `${selection.conditionTitle} · ${selection.outcomeTitle}`,
          `Odds ${selection.decimalOdds.toFixed(2)}`,
          `Vault stake ${stake}% (~${effectiveStakeUsdt.toFixed(2)} USDT)`,
          `Potential win ${potentialPayout.toFixed(2)} ${azuroBetToken.symbol}`,
          '',
          'This places an on-chain Azuro bet from your vault liquidity.',
        ].join('\n'),
        confirmLabel: 'Place vault bet',
      })
      if (confirmed) {
        onConfirm()
      }
      return
    }

    const confirmed = await confirm({
      title: 'Confirm bet',
      message: [
        `${selection.gameTitle}`,
        `${selection.conditionTitle} · ${selection.outcomeTitle}`,
        `Odds ${selection.decimalOdds.toFixed(2)}`,
        `Stake ${stake} ${azuroBetToken.symbol}`,
        `Potential win ${potentialPayout.toFixed(2)} ${azuroBetToken.symbol}`,
        '',
        'This will approve USDT for the Azuro relayer, then submit your bet.',
      ].join('\n'),
      confirmLabel: 'Approve & bet',
    })

    if (confirmed) {
      onConfirm()
    }
  }

  return (
    <View style={[styles.cart, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.headerRow}>
        <Text style={styles.cartTitle}>BET SLIP</Text>
        <TouchableOpacity style={styles.clearButton} onPress={onClear} hitSlop={8}>
          <X color={colors.textSecondary} size={18} />
        </TouchableOpacity>
      </View>

      <View style={styles.selectionCard}>
        <Text style={styles.selectionTitle} numberOfLines={1}>
          {selection.gameTitle}
        </Text>
        <Text style={styles.selectionMeta} numberOfLines={2}>
          {selection.conditionTitle} · {selection.outcomeTitle}
        </Text>
        <Text style={styles.selectionOdds}>Odds {selection.decimalOdds.toFixed(2)}</Text>
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'personal' && styles.modeChipActive]}
          onPress={() => onModeChange('personal')}
        >
          <Text style={[styles.modeChipText, mode === 'personal' && styles.modeChipTextActive]}>
            Per se
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeChip,
            isTipster && styles.modeChipActive,
            !canBetAsTipster && styles.modeChipDisabled,
          ]}
          disabled={!canBetAsTipster}
          onPress={() => onModeChange('tipster')}
        >
          <Text
            style={[
              styles.modeChipText,
              isTipster && styles.modeChipTextActive,
              !canBetAsTipster && styles.modeChipTextDisabled,
            ]}
          >
            As tipster
          </Text>
        </TouchableOpacity>
      </View>
      {canBetAsTipster && tipsterLabel ? (
        <Text style={styles.tipsterHint}>
          Vault: {tipsterLabel}
          {vaultTotalLabel ? ` · ${vaultTotalLabel} USDT total` : ''}
          {vaultFreeUsdt > 0 ? ` · ${vaultFreeUsdt.toFixed(2)} free` : ''}
        </Text>
      ) : (
        <Text style={styles.tipsterHint}>Tipster vault bets need a profile setup first.</Text>
      )}

      {isTipster ? (
        <View style={styles.quickStakeRow}>
          {TIPSTER_QUICK_STAKES.map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.quickStakeChip, stake === value && styles.quickStakeChipActive]}
              onPress={() => onStakeChange(value)}
            >
              <Text
                style={[
                  styles.quickStakeText,
                  stake === value && styles.quickStakeTextActive,
                ]}
              >
                {value}%
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.stakeRow}>
        <View style={styles.stakeInputWrap}>
          <Text style={styles.inputLabel}>
            {isTipster ? 'Vault stake (%)' : `Stake (${azuroBetToken.symbol})`}
          </Text>
          <TextInput
            style={styles.input}
            value={stake}
            onChangeText={onStakeChange}
            keyboardType="decimal-pad"
            placeholder={isTipster ? '5' : '1'}
            placeholderTextColor={colors.textTertiary}
          />
          {isTipster ? (
            <Text style={styles.stakeHint}>
              ~{effectiveStakeUsdt > 0 ? effectiveStakeUsdt.toFixed(2) : '0.00'} USDT from vault
              {vaultTotalUsdt > 0 ? ` (${stake || '0'}% of ${vaultTotalUsdt.toFixed(2)})` : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.payoutBox}>
          <Text style={styles.payoutLabel}>Potential win</Text>
          <Text style={styles.payoutValue}>
            {potentialPayout > 0 ? potentialPayout.toFixed(2) : '—'} {azuroBetToken.symbol}
          </Text>
        </View>
      </View>

      {quoteText ? <Text style={styles.quoteText}>{quoteText}</Text> : null}

      {placementBlockedReason ? (
        <Text style={styles.blockedText}>{placementBlockedReason}</Text>
      ) : null}

      <TouchableOpacity
        style={[
          styles.confirmButton,
          (isPlacing || placementBlockedReason) && styles.confirmButtonDisabled,
        ]}
        disabled={isPlacing || Boolean(placementBlockedReason)}
        onPress={handleConfirmPress}
      >
        {isPlacing ? (
          <ActivityIndicator color={colors.black} />
        ) : (
          <Text style={styles.confirmButtonText}>
            {placementBlockedReason
              ? 'Not bettable on-chain yet'
              : isTipster
                ? 'Place vault bet'
                : 'Approve & place bet'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  cart: {
    borderTopWidth: 1,
    borderTopColor: colors.borderNeon,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartTitle: {
    ...theme.typography.caption,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  clearButton: {
    padding: 4,
  },
  selectionCard: {
    borderRadius: theme.radius.sharp,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    padding: 10,
    gap: 2,
  },
  selectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  selectionMeta: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  selectionOdds: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
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
  modeChipDisabled: {
    opacity: 0.4,
  },
  modeChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  modeChipTextActive: {
    color: colors.primary,
  },
  modeChipTextDisabled: {
    color: colors.textTertiary,
  },
  tipsterHint: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '600',
  },
  quickStakeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickStakeChip: {
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickStakeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  quickStakeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  quickStakeTextActive: {
    color: colors.primary,
  },
  stakeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  stakeInputWrap: {
    flex: 1,
    gap: 3,
  },
  inputLabel: {
    ...theme.typography.caption,
    fontSize: 10,
    color: colors.textTertiary,
  },
  input: {
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 15,
    fontWeight: '700',
  },
  stakeHint: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
  },
  payoutBox: {
    minWidth: 108,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    backgroundColor: colors.neonMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  payoutLabel: {
    ...theme.typography.caption,
    fontSize: 9,
    color: colors.textTertiary,
  },
  payoutValue: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  quoteText: {
    color: colors.textTertiary,
    fontSize: 10,
  },
  blockedText: {
    color: colors.warning ?? colors.gold,
    fontSize: 11,
    lineHeight: 16,
  },
  confirmButton: {
    borderRadius: theme.radius.sharp,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.primaryDim,
  },
  confirmButtonDisabled: {
    opacity: 0.55,
  },
  confirmButtonText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
})
