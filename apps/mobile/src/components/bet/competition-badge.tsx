import { colors } from '@/constants/colors'
import { useLeagueLogo } from '@/hooks/use-game-logos'
import { getCountryFlagUri } from '@/utils/azuro-media'
import { Image } from 'expo-image'
import { Trophy } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

type Props = {
  leagueName: string
  countryName?: string
  countrySlug?: string
  compact?: boolean
}

export function CompetitionBadge({
  leagueName,
  countryName,
  countrySlug,
  compact = false,
}: Props) {
  const { logoUri: leagueLogoUri } = useLeagueLogo(leagueName, countryName, countrySlug)
  const [imageFailed, setImageFailed] = useState(false)
  const flagUri = getCountryFlagUri(countrySlug)
  const imageUri = leagueLogoUri || flagUri
  const size = compact ? 18 : 22

  return (
    <View style={styles.row}>
      {imageUri && !imageFailed ? (
        <Image
          source={{ uri: imageUri }}
          style={[
            styles.badgeImage,
            leagueLogoUri
              ? { width: size, height: size, borderRadius: size / 2 }
              : { width: size, height: size * 0.75, borderRadius: 3 },
          ]}
          contentFit="contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={[styles.iconWrap, { width: size, height: size }]}>
          <Trophy color={colors.primary} size={compact ? 11 : 13} />
        </View>
      )}
      <View style={styles.textWrap}>
        <Text style={[styles.league, compact && styles.leagueCompact]} numberOfLines={1}>
          {leagueName}
        </Text>
        {countryName && !compact ? (
          <Text style={styles.country} numberOfLines={1}>
            {countryName}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  badgeImage: {
    backgroundColor: colors.cardDark,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: colors.tintedBackground,
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  league: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  leagueCompact: {
    fontSize: 11,
  },
  country: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '500',
  },
})
