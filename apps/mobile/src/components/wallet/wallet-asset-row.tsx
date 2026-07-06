import { colors } from '@/constants/colors'
import type { ChainAssetBalance } from '@/services/chain-balances'
import { Image, StyleSheet, Text, View } from 'react-native'

type Props = {
  item: ChainAssetBalance
}

function formatDisplayBalance(balance: string, symbol: string) {
  const value = Number.parseFloat(balance)
  if (!Number.isFinite(value) || value === 0) {
    return `0 ${symbol}`
  }
  if (value < 0.0001) {
    return `<0.0001 ${symbol}`
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`
}

export function WalletAssetRow({ item }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Image source={item.asset.icon} style={styles.icon} resizeMode="contain" />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.asset.name}</Text>
        <Text style={styles.symbol}>{item.asset.symbol}</Text>
      </View>
      <View style={styles.balanceCol}>
        <Text style={styles.balance}>{formatDisplayBalance(item.balance, item.asset.symbol)}</Text>
        <Text style={styles.chainHint}>Polygon Amoy</Text>
      </View>
    </View>
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
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 28,
    height: 28,
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
