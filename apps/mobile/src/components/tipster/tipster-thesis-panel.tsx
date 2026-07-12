import { TipsterMatchHintsSheet } from '@/components/tipster/tipster-match-hints-sheet'
import {
  TipsterPickerSheet,
  TipsterSelectField,
  type TipsterPickerOption,
} from '@/components/tipster/tipster-picker-sheet'
import { TipsterVoiceTextField } from '@/components/tipster/tipster-voice-text-field'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useAzuroMatchCatalog } from '@/hooks/use-azuro-match-catalog'
import { useVoiceFieldFill } from '@/hooks/use-voice-field-fill'
import { summarizeTipsterNote } from '@/services/tipster-notes/summarizer'
import {
  findLeagueLabel,
  formatGameKickoff,
  normalizeTeamKey,
} from '@/services/tipster-notes/match-catalog'
import {
  getMatchHints,
  loadTipsterNotes,
  updateLeagueNote,
  updateTeamNote,
  updateThesisNote,
} from '@/services/tipster-notes/storage'
import { BookOpen, List, RefreshCw } from 'lucide-react-native'
import React from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { toast } from 'sonner-native'

type Props = {
  ownerId: string
  onUpdated?: () => void
}

type PickerKind =
  | 'league-note-competition'
  | 'team-note-competition'
  | 'team-note-team'
  | 'match-competition'
  | 'match-team'
  | 'match-game'
  | null

const ALL_TEAMS_KEY = '__all_teams__'

export function TipsterThesisPanel({ ownerId, onUpdated }: Props) {
  const catalog = useAzuroMatchCatalog()
  const voice = useVoiceFieldFill()

  const [thesis, setThesis] = React.useState('')
  const [leagueSlug, setLeagueSlug] = React.useState<string | null>(null)
  const [leagueNote, setLeagueNote] = React.useState('')
  const [teamLeagueSlug, setTeamLeagueSlug] = React.useState<string | null>(null)
  const [teamKey, setTeamKey] = React.useState<string | null>(null)
  const [teamNote, setTeamNote] = React.useState('')
  const [matchLeagueSlug, setMatchLeagueSlug] = React.useState<string | null>(null)
  const [matchTeamKey, setMatchTeamKey] = React.useState<string | null>(null)
  const [matchGameId, setMatchGameId] = React.useState<string | null>(null)
  const [matchHintCount, setMatchHintCount] = React.useState(0)
  const [hintsSheetVisible, setHintsSheetVisible] = React.useState(false)
  const [picker, setPicker] = React.useState<PickerKind>(null)
  const [busy, setBusy] = React.useState<'thesis' | 'league' | 'team' | null>(null)
  const [loaded, setLoaded] = React.useState(false)

  const selectedLeagueName = React.useMemo(() => {
    if (!leagueSlug) return ''
    const league = catalog.leagues.find((item) => item.slug === leagueSlug)
    return league?.name ?? leagueSlug
  }, [catalog.leagues, leagueSlug])

  const leagueNoteKey = React.useMemo(
    () => (selectedLeagueName ? normalizeTeamKey(selectedLeagueName) : ''),
    [selectedLeagueName]
  )

  const selectedTeamName = React.useMemo(() => {
    if (!teamKey || !teamLeagueSlug) return ''
    return (
      catalog.getTeamsForLeague(teamLeagueSlug).find((team) => team.key === teamKey)?.name ?? teamKey
    )
  }, [catalog, teamKey, teamLeagueSlug])

  const selectedMatch = React.useMemo(
    () => catalog.games.find((game) => game.id === matchGameId) ?? null,
    [catalog.games, matchGameId]
  )

  const reloadNotes = React.useCallback(async () => {
    if (!ownerId) return
    const store = await loadTipsterNotes(ownerId)
    setThesis(store.thesis.raw)

    if (leagueNoteKey) {
      setLeagueNote(store.leagues[leagueNoteKey]?.raw ?? '')
    }
    if (teamKey) {
      setTeamNote(store.teams[teamKey]?.raw ?? '')
    }
    if (matchGameId) {
      setMatchHintCount(getMatchHints(store.matches[matchGameId]).length)
    }
  }, [ownerId, leagueNoteKey, teamKey, matchGameId])

  React.useEffect(() => {
    if (!ownerId) return
    let active = true
    void loadTipsterNotes(ownerId).then((store) => {
      if (!active) return
      setThesis(store.thesis.raw)
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [ownerId])

  React.useEffect(() => {
    if (!ownerId || !loaded) return
    void reloadNotes()
  }, [ownerId, loaded, leagueNoteKey, teamKey, matchGameId, reloadNotes])

  React.useEffect(() => {
    if (!matchLeagueSlug) return
    void catalog.loadLeagueGames(matchLeagueSlug)
  }, [matchLeagueSlug, catalog.loadLeagueGames])

  React.useEffect(() => {
    if (!teamLeagueSlug) return
    void catalog.loadLeagueGames(teamLeagueSlug)
  }, [teamLeagueSlug, catalog.loadLeagueGames])

  const competitionOptions = React.useMemo(
    (): TipsterPickerOption[] =>
      catalog.leagues.map((league) => ({
        key: league.slug,
        label: league.name,
        subtitle: league.countryName,
        meta: league.isTopLeague ? 'Top league' : undefined,
      })),
    [catalog.leagues]
  )

  const teamOptions = React.useMemo((): TipsterPickerOption[] => {
    const slug =
      picker === 'team-note-team'
        ? teamLeagueSlug
        : picker === 'match-team'
          ? matchLeagueSlug
          : null
    if (!slug) return []
    return catalog.getTeamsForLeague(slug).map((team) => ({
      key: team.key,
      label: team.name,
    }))
  }, [catalog, matchLeagueSlug, picker, teamLeagueSlug])

  const matchOptions = React.useMemo((): TipsterPickerOption[] => {
    if (!matchLeagueSlug) return []
    const matches = catalog.getMatchesFor(matchLeagueSlug, matchTeamKey)
    return matches.map((game) => ({
      key: game.id,
      label: game.title,
      subtitle: `${game.leagueName} · ${game.countryName}`,
      meta: formatGameKickoff(game.startsAt) || game.state,
    }))
  }, [catalog, matchLeagueSlug, matchTeamKey])

  const pickerConfig = React.useMemo(() => {
    switch (picker) {
      case 'league-note-competition':
        return {
          title: 'Competition',
          options: competitionOptions,
          selectedKey: leagueSlug,
          searchable: true,
        }
      case 'team-note-competition':
        return {
          title: 'Competition',
          options: competitionOptions,
          selectedKey: teamLeagueSlug,
          searchable: true,
        }
      case 'team-note-team':
        return {
          title: 'Team',
          options: teamOptions,
          selectedKey: teamKey,
          searchable: true,
          emptyLabel: teamLeagueSlug
            ? 'No teams in this competition yet'
            : 'Pick a competition first',
        }
      case 'match-competition':
        return {
          title: 'Competition',
          options: competitionOptions,
          selectedKey: matchLeagueSlug,
          searchable: true,
        }
      case 'match-team':
        return {
          title: 'Team filter',
          options: [
            { key: ALL_TEAMS_KEY, label: 'All teams', subtitle: 'Show every match' },
            ...teamOptions,
          ],
          selectedKey: matchTeamKey ?? ALL_TEAMS_KEY,
          searchable: true,
          emptyLabel: matchLeagueSlug
            ? 'No teams in this competition yet'
            : 'Pick a competition first',
        }
      case 'match-game':
        return {
          title: 'Match',
          options: matchOptions,
          selectedKey: matchGameId,
          searchable: true,
          loading: catalog.loadingLeagueGames,
          emptyLabel: matchLeagueSlug
            ? 'No bettable matches for this filter'
            : 'Pick a competition first',
        }
      default:
        return null
    }
  }, [
    competitionOptions,
    leagueSlug,
    matchGameId,
    matchLeagueSlug,
    matchOptions,
    matchTeamKey,
    picker,
    teamKey,
    teamLeagueSlug,
    teamOptions,
    catalog.loadingLeagueGames,
  ])

  const handlePickerSelect = (option: TipsterPickerOption) => {
    switch (picker) {
      case 'league-note-competition':
        setLeagueSlug(option.key)
        break
      case 'team-note-competition':
        setTeamLeagueSlug(option.key)
        setTeamKey(null)
        setTeamNote('')
        break
      case 'team-note-team':
        setTeamKey(option.key)
        break
      case 'match-competition':
        setMatchLeagueSlug(option.key)
        setMatchTeamKey(null)
        setMatchGameId(null)
        setMatchHintCount(0)
        catalog.setActiveLeagueSlug(option.key)
        void catalog.loadLeagueGames(option.key)
        break
      case 'match-team':
        setMatchTeamKey(option.key === ALL_TEAMS_KEY ? null : option.key)
        setMatchGameId(null)
        setMatchHintCount(0)
        break
      case 'match-game':
        setMatchGameId(option.key)
        break
      default:
        break
    }
    setPicker(null)
  }

  const runSummarize = async (
    kind: 'thesis' | 'league' | 'team',
    raw: string,
    label: string,
    key: string
  ) => {
    if (!ownerId || !raw.trim()) {
      toast.error('Write a note first')
      return
    }
    try {
      setBusy(kind)
      if (kind === 'thesis') await updateThesisNote(ownerId, raw)
      else if (kind === 'league') await updateLeagueNote(ownerId, label, raw)
      else await updateTeamNote(ownerId, label, raw)

      await summarizeTipsterNote(
        ownerId,
        kind === 'thesis'
          ? { kind: 'thesis' }
          : kind === 'league'
            ? { kind: 'league', key, label }
            : { kind: 'team', key, label },
        raw
      )
      toast.success(`${label} hints locked`)
      onUpdated?.()
    } catch (error) {
      toast.error(String(error))
    } finally {
      setBusy(null)
    }
  }

  if (!ownerId || !loaded) return null

  const matchTeamLabel =
    matchTeamKey == null
      ? 'All teams'
      : catalog
          .getTeamsForLeague(matchLeagueSlug)
          .find((team) => team.key === matchTeamKey)?.name ?? 'Team'

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <BookOpen size={18} color={colors.primary} />
          <Text style={styles.title}>Tipster thesis</Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => void catalog.refresh()}
            disabled={catalog.refreshing}
          >
            {catalog.refreshing ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <RefreshCw size={16} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Same competitions and matches as the Bet tab. Notes apply to every AI run and /ask.
        </Text>

        {catalog.loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.loadingText}>Loading competitions…</Text>
          </View>
        ) : null}

        {catalog.error ? (
          <Text style={styles.errorText}>Could not refresh match list: {catalog.error}</Text>
        ) : null}

        <Text style={styles.sectionLabel}>Global worldview</Text>
        <TipsterVoiceTextField
          fieldId="thesis"
          voice={voice}
          value={thesis}
          onChangeText={setThesis}
          onBlur={() => void updateThesisNote(ownerId, thesis)}
          placeholder="e.g. Open leagues lean overs. Favour goals when both sides need points."
        />
        <TouchableOpacity
          style={styles.button}
          onPress={() => void runSummarize('thesis', thesis, 'Global', 'thesis')}
          disabled={busy !== null}
        >
          {busy === 'thesis' ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.buttonText}>Summarize global thesis</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>League pattern</Text>
        <TipsterSelectField
          label="Competition"
          value={findLeagueLabel(catalog.leagues, leagueSlug)}
          onPress={() => setPicker('league-note-competition')}
        />
        <TipsterVoiceTextField
          fieldId="league-note"
          voice={voice}
          value={leagueNote}
          onChangeText={setLeagueNote}
          onBlur={() =>
            leagueSlug && selectedLeagueName
              ? void updateLeagueNote(ownerId, selectedLeagueName, leagueNote)
              : undefined
          }
          placeholder="League-specific lean for the selected competition…"
          editable={Boolean(leagueSlug)}
        />
        <TouchableOpacity
          style={[styles.buttonSecondary, !leagueSlug && styles.buttonDisabled]}
          onPress={() =>
            leagueSlug
              ? void runSummarize('league', leagueNote, selectedLeagueName, leagueNoteKey)
              : toast.error('Select a competition first')
          }
          disabled={busy !== null || !leagueSlug}
        >
          {busy === 'league' ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.buttonSecondaryText}>Summarize league note</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Team pattern</Text>
        <TipsterSelectField
          label="Competition"
          value={findLeagueLabel(catalog.leagues, teamLeagueSlug)}
          onPress={() => setPicker('team-note-competition')}
        />
        <TipsterSelectField
          label="Team"
          value={selectedTeamName}
          placeholder={teamLeagueSlug ? 'Select team' : 'Pick competition first'}
          disabled={!teamLeagueSlug}
          onPress={() => setPicker('team-note-team')}
        />
        <TipsterVoiceTextField
          fieldId="team-note"
          voice={voice}
          value={teamNote}
          onChangeText={setTeamNote}
          onBlur={() =>
            teamKey && selectedTeamName
              ? void updateTeamNote(ownerId, selectedTeamName, teamNote)
              : undefined
          }
          placeholder="Club-specific pattern for the selected team…"
          editable={Boolean(teamKey)}
        />
        <TouchableOpacity
          style={[styles.buttonSecondary, !teamKey && styles.buttonDisabled]}
          onPress={() =>
            teamKey
              ? void runSummarize('team', teamNote, selectedTeamName, normalizeTeamKey(selectedTeamName))
              : toast.error('Select a team first')
          }
          disabled={busy !== null || !teamKey}
        >
          {busy === 'team' ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.buttonSecondaryText}>Summarize team note</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Match hints</Text>
        <Text style={styles.sectionHint}>
          Pick a fixture from the live Bet feed, then add voice or pasted hints.
        </Text>
        <TipsterSelectField
          label="Competition"
          value={findLeagueLabel(catalog.leagues, matchLeagueSlug)}
          onPress={() => setPicker('match-competition')}
        />
        <TipsterSelectField
          label="Team"
          value={matchTeamLabel}
          placeholder={matchLeagueSlug ? 'Filter by team' : 'Pick competition first'}
          disabled={!matchLeagueSlug}
          onPress={() => setPicker('match-team')}
        />
        <TipsterSelectField
          label="Match"
          value={
            selectedMatch
              ? `${selectedMatch.title}${
                  formatGameKickoff(selectedMatch.startsAt)
                    ? ` · ${formatGameKickoff(selectedMatch.startsAt)}`
                    : ''
                }`
              : ''
          }
          placeholder={matchLeagueSlug ? 'Select match' : 'Pick competition first'}
          disabled={!matchLeagueSlug}
          onPress={() => setPicker('match-game')}
        />
        <TouchableOpacity
          style={[styles.matchOpenButton, !matchGameId && styles.buttonDisabled]}
          onPress={() => {
            if (!matchGameId) {
              toast.error('Select a match first')
              return
            }
            setHintsSheetVisible(true)
          }}
          disabled={!matchGameId}
        >
          <List size={16} color={colors.background} />
          <Text style={styles.matchOpenButtonText}>
            {matchHintCount
              ? `Manage ${matchHintCount} hint${matchHintCount === 1 ? '' : 's'}`
              : 'Add match hints'}
          </Text>
        </TouchableOpacity>
      </View>

      {pickerConfig ? (
        <TipsterPickerSheet
          visible={picker !== null}
          title={pickerConfig.title}
          options={pickerConfig.options}
          selectedKey={pickerConfig.selectedKey}
          searchable={pickerConfig.searchable}
          loading={'loading' in pickerConfig ? pickerConfig.loading : false}
          emptyLabel={'emptyLabel' in pickerConfig ? pickerConfig.emptyLabel : undefined}
          onSelect={handlePickerSelect}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {matchGameId && selectedMatch ? (
        <TipsterMatchHintsSheet
          visible={hintsSheetVisible}
          ownerId={ownerId}
          gameId={matchGameId}
          matchTitle={selectedMatch.title}
          league={selectedMatch.leagueName}
          onClose={() => {
            setHintsSheetVisible(false)
            void reloadNotes()
            onUpdated?.()
          }}
        />
      ) : null}
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
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshButton: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDark,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
  },
  sectionHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  errorText: {
    color: colors.warning,
    fontSize: 12,
  },
  input: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    color: colors.text,
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 11,
  },
  buttonSecondary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 13,
  },
  buttonSecondaryText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  matchOpenButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
  },
  matchOpenButtonText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
})
