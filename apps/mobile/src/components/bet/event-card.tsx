import { CompetitionBadge } from '@/components/bet/competition-badge'
import { TeamLogo } from '@/components/bet/team-logo'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useGameLogos } from '@/hooks/use-game-logos'
import { getLiveLabel } from '@/services/azuro/feed'
import type { GameData } from '@azuro-org/toolkit'
import { GameState } from '@azuro-org/toolkit'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  game: GameData
  onPress?: () => void
  compact?: boolean
  large?: boolean
  /** When false, skips TheSportsDB logo fetch (Azuro + shield fallback only). */
  resolveLogos?: boolean
}

export function EventCard({
  game,
  onPress,
  compact = false,
  large = false,
  resolveLogos = true,
}: Props) {
  const [home, away] = game.participants
  const isLive = game.state === GameState.Live
  const logoSize = large ? 56 : compact ? 36 : 44
  const { home: homeLogo, away: awayLogo } = useGameLogos(resolveLogos ? game : null)

  const content = (
    <>
      <View style={styles.header}>
        <CompetitionBadge
          leagueName={game.league?.name ?? 'Football'}
          countryName={game.country?.name}
          countrySlug={game.country?.slug}
          compact={compact}
        />
        <View style={[styles.statusPill, isLive && styles.statusPillLive]}>
          <Text style={[styles.statusText, isLive && styles.statusTextLive]}>
            {getLiveLabel(game)}
          </Text>
        </View>
      </View>

      <View style={styles.teamsRow}>
        <View style={styles.teamCol}>
          <TeamLogo
            uri={homeLogo}
            azuroUri={home?.image}
            name={home?.name ?? 'Home'}
            size={logoSize}
          />
          <Text style={[styles.teamName, large && styles.teamNameLarge]} numberOfLines={2}>
            {home?.name ?? 'Home'}
          </Text>
        </View>

        <Text style={styles.vs}>vs</Text>

        <View style={styles.teamCol}>
          <TeamLogo
            uri={awayLogo}
            azuroUri={away?.image}
            name={away?.name ?? 'Away'}
            size={logoSize}
          />
          <Text style={[styles.teamName, large && styles.teamNameLarge]} numberOfLines={2}>
            {away?.name ?? 'Away'}
          </Text>
        </View>
      </View>
    </>
  )

  if (!onPress) {
    return <View style={[styles.card, compact && styles.cardCompact]}>{content}</View>
  }

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {content}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.pitchLine,
    padding: 12,
    gap: 10,
  },
  cardCompact: {
    padding: 10,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusPill: {
    borderRadius: theme.radius.sharp,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  statusPillLive: {
    backgroundColor: colors.dangerBackground,
    borderColor: colors.dangerBorder,
  },
  statusText: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statusTextLive: {
    color: colors.live,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  teamNameLarge: {
    fontSize: 14,
  },
  vs: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
})
