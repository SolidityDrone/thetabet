import { TipsterMatchHintsSheet } from '@/components/tipster/tipster-match-hints-sheet'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { getMatchHints, loadTipsterNotes } from '@/services/tipster-notes/storage'
import { ChevronRight, List, Sparkles } from 'lucide-react-native'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  ownerId: string
  gameId: string
  matchTitle: string
  league?: string | null
}

export function TipsterMatchNotesPanel({ ownerId, gameId, matchTitle, league }: Props) {
  const [sheetVisible, setSheetVisible] = React.useState(false)
  const [hintCount, setHintCount] = React.useState(0)
  const [lockedCount, setLockedCount] = React.useState(0)
  const [loaded, setLoaded] = React.useState(false)

  const reload = React.useCallback(() => {
    if (!ownerId || !gameId) return
    void loadTipsterNotes(ownerId).then((store) => {
      const hints = getMatchHints(store.matches[gameId])
      setHintCount(hints.length)
      setLockedCount(hints.reduce((sum, hint) => sum + (hint.summary?.length ?? 0), 0))
      setLoaded(true)
    })
  }, [ownerId, gameId])

  React.useEffect(() => {
    reload()
  }, [reload])

  if (!ownerId || !loaded) return null

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <Sparkles size={16} color={colors.gold} />
          <Text style={styles.title}>My match hints</Text>
        </View>
        <Text style={styles.hint}>
          Register convictions by voice or paste. Locked hints outweigh web scout in AI and /ask.
        </Text>
        <TouchableOpacity style={styles.openRow} onPress={() => setSheetVisible(true)}>
          <View style={styles.openLeft}>
            <List size={18} color={colors.primary} />
            <View>
              <Text style={styles.openTitle}>
                {hintCount ? `${hintCount} hint${hintCount === 1 ? '' : 's'}` : 'Open hints list'}
              </Text>
              <Text style={styles.openSubtitle}>
                {lockedCount
                  ? `${lockedCount} locked for AI`
                  : hintCount
                    ? 'Summarize hints to lock them'
                    : 'Add your first take'}
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <TipsterMatchHintsSheet
        visible={sheetVisible}
        ownerId={ownerId}
        gameId={gameId}
        matchTitle={matchTitle}
        league={league}
        onClose={() => {
          setSheetVisible(false)
          reload()
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardDark,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  openLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  openTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  openSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
})
