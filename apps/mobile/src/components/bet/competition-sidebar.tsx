import { colors } from '@/constants/colors'
import { useLeagueLogo } from '@/hooks/use-game-logos'
import { getCountryFlagUri } from '@/utils/azuro-media'
import type { AzuroLeagueRef } from '@/types/azuro'
import { Image } from 'expo-image'
import { Check, Trophy, X } from 'lucide-react-native'
import { useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

type Props = {
  visible: boolean
  leagues: AzuroLeagueRef[]
  selectedLeagueSlug: string | null
  onClose: () => void
  onSelect: (leagueSlug: string | null) => void
}

export function CompetitionSidebar({
  visible,
  leagues,
  selectedLeagueSlug,
  onClose,
  onSelect,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>Competitions</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X color={colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            <LeagueRow
              selected={selectedLeagueSlug === null}
              onPress={() => {
                onSelect(null)
                onClose()
              }}
            />

            {leagues.map((league) => (
              <LeagueRow
                key={`${league.countrySlug}:${league.slug}`}
                league={league}
                selected={selectedLeagueSlug === league.slug}
                onPress={() => {
                  onSelect(league.slug)
                  onClose()
                }}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function LeagueRow({
  league,
  selected,
  onPress,
}: {
  league?: AzuroLeagueRef
  selected: boolean
  onPress: () => void
}) {
  const { logoUri: leagueLogoUri } = useLeagueLogo(
    league?.name,
    league?.countryName,
    league?.countrySlug
  )
  const [imageFailed, setImageFailed] = useState(false)
  const flagUri = league ? getCountryFlagUri(league.countrySlug) : undefined
  const imageUri = leagueLogoUri || flagUri
  const label = league ? `${league.name} · ${league.countryName}` : 'All football'
  const top = league?.isTopLeague

  return (
    <TouchableOpacity style={[styles.row, selected && styles.rowSelected]} onPress={onPress}>
      {league ? (
        imageUri && !imageFailed ? (
          <Image
            source={{ uri: imageUri }}
            style={[
              styles.badgeImage,
              leagueLogoUri ? styles.leagueLogo : styles.flag,
            ]}
            contentFit="contain"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.iconWrap}>
            <Trophy color={colors.primary} size={14} />
          </View>
        )
      ) : null}
      <View style={styles.rowTextWrap}>
        <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={2}>
          {label}
        </Text>
        {top ? <Text style={styles.topTag}>Top league</Text> : null}
      </View>
      {selected ? <Check color={colors.primary} size={18} /> : null}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.overlay,
  },
  dismissArea: {
    width: 56,
  },
  panel: {
    flex: 1,
    backgroundColor: colors.background,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingTop: 18,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 8,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  flag: {
    width: 24,
    height: 18,
    borderRadius: 3,
    backgroundColor: colors.cardDark,
  },
  leagueLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.cardDark,
  },
  badgeImage: {
    backgroundColor: colors.cardDark,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tintedBackground,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 101, 1, 0.08)',
  },
  rowTextWrap: {
    flex: 1,
    gap: 4,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowLabelSelected: {
    color: colors.primary,
  },
  topTag: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
})
