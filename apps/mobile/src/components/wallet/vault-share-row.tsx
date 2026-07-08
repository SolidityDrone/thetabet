import { colors } from '@/constants/colors'
import { formatTipsterHandle } from '@/hooks/use-profile-vaults'
import type { IndexedPosition } from '@/types/indexed-vault'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { Landmark } from 'lucide-react-native'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  position: IndexedPosition
}

/** Vault share tokens are standard 18-decimal ERC20s. */
function formatShares(raw: string): string {
  const value = Number(raw) / 1e18
  if (!Number.isFinite(value) || value === 0) return '0'
  if (value < 0.0001) return '<0.0001'
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export function VaultShareRow({ position }: Props) {
  const router = useDebouncedNavigation()
  const vault = position.vault
  const symbol = vault?.symbol ?? 'SHARE'
  const name = vault?.name ?? `Vault #${position.vaultId}`

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => router.push(`/vault/${position.vaultId}`)}
    >
      <View style={styles.iconWrap}>
        <Landmark size={20} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.symbol} numberOfLines={1}>
          {symbol}
          {vault ? ` · ${formatTipsterHandle(vault.tipsterHandle, vault.tipster)}` : ''}
        </Text>
      </View>
      <View style={styles.balanceCol}>
        <Text style={styles.balance}>
          {formatShares(position.shares)} {symbol}
        </Text>
        <Text style={styles.chainHint}>Vault shares</Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.neonMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  symbol: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  balanceCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  balance: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  chainHint: {
    color: colors.textTertiary,
    fontSize: 11,
  },
})
