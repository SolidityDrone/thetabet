import Header from '@/components/header'
import { colors } from '@/constants/colors'
import { networkConfigs } from '@/config/networks'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NetworkType } from '@tetherto/wdk-react-native-provider'

/** Legacy route — ThetaBet only sends on Polygon. */
export default function SelectNetworkScreen() {
  const insets = useSafeAreaInsets()
  const router = useDebouncedNavigation()
  const params = useLocalSearchParams<Record<string, string>>()
  const network = networkConfigs[NetworkType.POLYGON]

  useEffect(() => {
    router.replace({
      pathname: '/send/details',
      params: {
        ...params,
        networkName: network.name,
        networkId: network.id,
      },
    })
  }, [network.id, network.name, params, router])

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header title="Send funds" style={styles.header} />
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.hint}>Opening send on Polygon…</Text>
      </View>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
})
