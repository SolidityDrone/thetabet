import { colors } from '@/constants/colors'
import { faviconUrl } from '@/services/qvac/web-research'
import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

type Props = {
  site: string
  size?: number
}

export function SiteFavicon({ site, size = 16 }: Props) {
  const [failed, setFailed] = useState(false)
  const letter = (site.replace(/^www\./, '').charAt(0) || '?').toUpperCase()

  if (failed || !site) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 4 }]}>
        <Text style={[styles.letter, { fontSize: Math.max(8, size * 0.55) }]}>{letter}</Text>
      </View>
    )
  }

  return (
    <Image
      source={{ uri: faviconUrl(site, 64) }}
      style={{ width: size, height: size, borderRadius: size / 4 }}
      contentFit="cover"
      onError={() => setFailed(true)}
    />
  )
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: colors.textSecondary,
    fontWeight: '800',
  },
})
