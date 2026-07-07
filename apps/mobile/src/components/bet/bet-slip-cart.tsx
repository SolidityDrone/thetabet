import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { azuroBetToken } from '@/config/azuro'
import type { AzuroBetMode, AzuroBetSelection } from '@/types/azuro'
import { X } from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  selection: AzuroBetSelection
  mode: AzuroBetMode
  onModeChange: (mode: AzuroBetMode) => void
  canBetAsTipster: boolean
  tipsterLabel?: string
  stake: string
  onStakeChange: (value: string) => void
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
  stake,
  onStakeChange,
  potentialPayout,
  quoteText,
  placementBlockedReason,
  isPlacing,
  onClear,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets()

  const handleConfirmPress = () => {
    const stakeNum = Number(stake)
    if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
      Alert.alert('Invalid stake', 'Enter a valid stake amount.')
      return
    }

    if (placementBlockedReason) {
      Alert.alert('Bet not available', placementBlockedReason)
      return
    }

    if (mode === 'tipster') {
      Alert.alert('Coming soon', 'Vault (tipster) bets are not wired yet. Use “Per se” for now.')
      return
    }

    Alert.alert(
      'Confirm bet',
      [
        `${selection.gameTitle}`,
        `${selection.conditionTitle} · ${selection.outcomeTitle}`,
        `Odds ${selection.decimalOdds.toFixed(2)}`,
        `Stake ${stake} ${azuroBetToken.symbol}`,
        `Potential win ${potentialPayout.toFixed(2)} ${azuroBetToken.symbol}`,
        '',
        'This will approve USDT for the Azuro relayer, then submit your bet.',
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve & bet', onPress: onConfirm },
      ]
    )
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
            mode === 'tipster' && styles.modeChipActive,
            !canBetAsTipster && styles.modeChipDisabled,
          ]}
          disabled={!canBetAsTipster}
          onPress={() => onModeChange('tipster')}
        >
          <Text
            style={[
              styles.modeChipText,
              mode === 'tipster' && styles.modeChipTextActive,
              !canBetAsTipster && styles.modeChipTextDisabled,
            ]}
          >
            As tipster
          </Text>
        </TouchableOpacity>
      </View>
      {canBetAsTipster && tipsterLabel ? (
        <Text style={styles.tipsterHint}>Vault: {tipsterLabel}</Text>
      ) : (
        <Text style={styles.tipsterHint}>Tipster vault bets need a profile setup first.</Text>
      )}

      <View style={styles.stakeRow}>
        <View style={styles.stakeInputWrap}>
          <Text style={styles.inputLabel}>Stake ({azuroBetToken.symbol})</Text>
          <TextInput
            style={styles.input}
            value={stake}
            onChangeText={onStakeChange}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={colors.textTertiary}
          />
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
              : mode === 'personal'
                ? 'Approve & place bet'
                : 'Place vault bet'}
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
