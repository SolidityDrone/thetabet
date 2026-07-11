import { SiteFavicon } from '@/components/ai/site-favicon'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

export type ScoutWebVisit = {
  site: string
  url: string
}

type Props = {
  visits: ScoutWebVisit[]
  activeSite?: string | null
}

export function ScoutWebStrip({ visits, activeSite }: Props) {
  if (visits.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {visits.map((visit) => {
        const active = activeSite === visit.site
        return (
          <View key={visit.url} style={[styles.chip, active && styles.chipActive]}>
            <SiteFavicon site={visit.site} size={14} />
            <Text style={[styles.site, active && styles.siteActive]} numberOfLines={1}>
              {visit.site}
            </Text>
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 28,
  },
  row: {
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sharp,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    maxWidth: 140,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.neonMuted,
  },
  site: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 1,
  },
  siteActive: {
    color: colors.text,
  },
})
