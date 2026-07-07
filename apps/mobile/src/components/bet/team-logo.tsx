import { colors } from '@/constants/colors'
import { encodeAzuroImageUri } from '@/utils/azuro-media'
import { Image } from 'expo-image'
import { Shield } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'

type Props = {
  /** Azuro CDN url — tried first when present */
  azuroUri?: string | null
  /** Fallback url (e.g. TheSportsDB) when Azuro is missing or fails */
  uri?: string | null
  name: string
  size?: number
}

export function TeamLogo({ azuroUri, uri, name, size = 42 }: Props) {
  const azuro = useMemo(() => encodeAzuroImageUri(azuroUri), [azuroUri])
  const [azuroFailed, setAzuroFailed] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)

  useEffect(() => {
    setAzuroFailed(false)
    setFallbackFailed(false)
  }, [azuro, uri])

  const showUri =
    azuro && !azuroFailed
      ? azuro
      : uri && !fallbackFailed
        ? uri
        : undefined

  if (showUri) {
    return (
      <Image
        source={{ uri: showUri }}
        style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="contain"
        transition={150}
        accessibilityLabel={name}
        onError={() => {
          if (azuro && !azuroFailed && showUri === azuro) {
            setAzuroFailed(true)
            return
          }
          setFallbackFailed(true)
        }}
      />
    )
  }

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityLabel={name}
    >
      <Shield color={colors.primary} size={size * 0.46} strokeWidth={1.75} />
    </View>
  )
}

const styles = StyleSheet.create({
  logo: {
    backgroundColor: colors.cardDark,
  },
  fallback: {
    backgroundColor: colors.tintedBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
})
