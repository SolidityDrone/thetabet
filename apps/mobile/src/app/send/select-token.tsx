import { assetConfig } from '@/config/assets'
import { DEFAULT_CHAIN_ID, getChain } from '@/config/chains'
import { networkConfigs } from '@/config/networks'
import Header from '@/components/header'
import { colors } from '@/constants/colors'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useThetaWalletAddress } from '@/hooks/use-theta-wallet-address'
import { fetchChainBalances } from '@/services/chain-balances'
import { getPolUsdPrice } from '@/services/native-token-price'
import formatAmount from '@/utils/format-amount'
import formatTokenAmount from '@/utils/format-token-amount'
import { addToRecentTokens, getRecentTokens } from '@/utils/recent-tokens'
import { AssetTicker, NetworkType } from '@tetherto/wdk-react-native-provider'
import { AssetSelector, type Token } from '@tetherto/wdk-uikit-react-native'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const SEND_ASSETS = [
  { chainAssetId: 'betToken', tokenId: 'usdt' },
  { chainAssetId: 'matic', tokenId: 'pol' },
] as const

export default function SelectTokenScreen() {
  const insets = useSafeAreaInsets()
  const router = useDebouncedNavigation()
  const params = useLocalSearchParams<{ scannedAddress?: string }>()
  const { address } = useThetaWalletAddress()
  const chain = getChain(DEFAULT_CHAIN_ID)
  const network = networkConfigs[NetworkType.POLYGON]

  const [recentTokens, setRecentTokens] = useState<string[]>([])
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getRecentTokens('send').then(setRecentTokens)
  }, [])

  useEffect(() => {
    let active = true

    const loadTokens = async () => {
      setLoading(true)
      try {
        const balances = address
          ? await fetchChainBalances(chain, address)
          : chain.assets.map((asset) => ({
              asset,
              balance: '0',
              balanceNumber: 0,
            }))

        const polPrice = await getPolUsdPrice()
        const tokensWithBalances: Token[] = []

        for (const mapping of SEND_ASSETS) {
          const config = assetConfig[mapping.tokenId]
          if (!config) continue

          const row = balances.find((item) => item.asset.id === mapping.chainAssetId)
          const totalBalance = row?.balanceNumber ?? 0
          const usdValue =
            mapping.tokenId === 'pol' ? totalBalance * polPrice : totalBalance

          tokensWithBalances.push({
            id: mapping.tokenId,
            symbol: config.symbol,
            name: config.name,
            balance: formatTokenAmount(
              totalBalance,
              mapping.tokenId === 'usdt' ? AssetTicker.USDT : ('pol' as AssetTicker),
              false
            ),
            balanceUSD: `${formatAmount(usdValue)} USD`,
            icon: config.icon,
            color: config.color,
            hasBalance: totalBalance > 0,
          })
        }

        if (!active) return

        setTokens(
          tokensWithBalances.sort((a, b) => {
            const aValue = Number.parseFloat(a.balanceUSD.replace(/[$,]/g, ''))
            const bValue = Number.parseFloat(b.balanceUSD.replace(/[$,]/g, ''))
            if (aValue === 0 && bValue === 0) return a.name.localeCompare(b.name)
            if (aValue === 0) return 1
            if (bValue === 0) return -1
            return bValue - aValue
          })
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadTokens()
    return () => {
      active = false
    }
  }, [address, chain])

  const handleSelectToken = useCallback(
    async (token: Token) => {
      if (!token.hasBalance) return

      const updatedRecent = await addToRecentTokens(token.name, 'send')
      setRecentTokens(updatedRecent)

      router.push({
        pathname: '/send/details',
        params: {
          tokenId: token.id,
          tokenSymbol: token.symbol,
          tokenName: token.name,
          tokenBalance: token.balance,
          tokenBalanceUSD: token.balanceUSD,
          networkName: network.name,
          networkId: network.id,
          ...(params.scannedAddress ? { scannedAddress: params.scannedAddress } : {}),
        },
      })
    },
    [network.id, network.name, params.scannedAddress, router]
  )

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header title="Send funds" style={styles.header} />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <AssetSelector
          tokens={tokens}
          recentTokens={recentTokens}
          onSelectToken={handleSelectToken}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: 16,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
