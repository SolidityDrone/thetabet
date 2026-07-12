/**
 * Match Scout — parallel web research + locked picks + streamed preview.
 *
 * Pipeline:
 *   1. web — scouts (internal intel)
 *   2. preview — streamed analysis (MAIN / HOME / AWAY / REASON)
 *   3. picks — locked to catalog after analysis
 */
import { completeOnce, ensureModelReady, streamCompletion } from '@/services/qvac/qvac-client'
import { loadQvacSettings, QVAC_OUTPUT_LANGUAGE_OPTIONS } from '@/services/qvac/qvac-settings'
import { streamTranslateScoutAnswer, unloadTranslationModel } from '@/services/qvac/qvac-translation'
import {
  isTranslationModelInstalled,
  requiresTranslationModel,
} from '@/services/qvac/qvac-translation-models'
import { ddgSearch, fetchPageText, siteOf } from '@/services/qvac/web-research'
import {
  buildOutcomeCatalog,
  buildSmartFallbackPicks,
  createStreamSanitizer,
  formatOutcomeCatalogForPrompt,
  formatPicksAnswerBlock,
  hasSubstantiveAnalysis,
  hasTranslatableTaggedOutput,
  isGarbageModelOutput,
  MODEL_REPLY_RULES,
  OUTCOME_NAMING_RULES,
  parsePickSuggestions,
  parseTeamSides,
  pickDiverseMarketsForAi,
  sanitizeModelAnswer,
  hasThinkingNoise,
  stripPromptEchoLines,
  teamSideHints,
  type MatchMarketInput,
  type MatchPickSuggestion,
} from '@/services/qvac/match-outcomes'

export type ScoutId = 'history' | 'form' | 'injuries' | 'tactics' | 'atmosphere'

export type ScoutFieldSpec = { key: string; label: string; hint: string }

export type ScoutSpec = {
  id: ScoutId
  label: string
  mission: string
  buildQuery: (matchTitle: string, league?: string | null) => string
  fields: ScoutFieldSpec[]
}

export const SCOUTS: ScoutSpec[] = [
  {
    id: 'history',
    label: 'Head-to-head',
    mission: 'Past meetings between the two sides',
    buildQuery: (m) => `${m} head to head results history`,
    fields: [
      { key: 'last_meetings', label: 'Recent meetings', hint: 'e.g. "3 of last 5 won by home side"' },
      { key: 'balance', label: 'H2H balance', hint: 'e.g. "12 home wins, 8 away, 5 draws"' },
      { key: 'trend', label: 'Trend', hint: 'one short sentence' },
    ],
  },
  {
    id: 'form',
    label: 'Current form',
    mission: 'Recent results and momentum',
    buildQuery: (m) => `${m} recent form last 5 matches results`,
    fields: [
      { key: 'home_last5', label: 'Home last 5', hint: 'like "WWDLW" if known' },
      { key: 'away_last5', label: 'Away last 5', hint: 'like "LDWWL" if known' },
      { key: 'momentum', label: 'Momentum', hint: 'which side is in better shape, one sentence' },
    ],
  },
  {
    id: 'injuries',
    label: 'Injuries & bans',
    mission: 'Missing players and suspensions',
    buildQuery: (m) => `${m} injuries suspensions team news`,
    fields: [
      { key: 'home_absences', label: 'Home absences', hint: 'player names or "none reported"' },
      { key: 'away_absences', label: 'Away absences', hint: 'player names or "none reported"' },
      { key: 'impact', label: 'Impact', hint: 'one sentence on how absences shift the odds' },
    ],
  },
  {
    id: 'tactics',
    label: 'Coach & tactics',
    mission: 'Formations, coach changes, untested lineups',
    buildQuery: (m) => `${m} predicted lineup formation coach tactics`,
    fields: [
      { key: 'formations', label: 'Formations', hint: 'like "4-3-3 vs 3-5-2" if known' },
      { key: 'coach_changes', label: 'Coach changes', hint: 'recent manager changes or untested lineups, or "none"' },
      { key: 'tactical_note', label: 'Tactical note', hint: 'one sentence, style matchup' },
    ],
  },
  {
    id: 'atmosphere',
    label: 'Crowd & context',
    mission: 'Venue, fan support strength, match stakes',
    buildQuery: (m, league) => `${m} ${league ?? ''} stadium attendance atmosphere stakes`,
    fields: [
      { key: 'home_support', label: 'Home support', hint: 'one of: strong, average, weak, unknown' },
      { key: 'stakes', label: 'Stakes', hint: 'relegation, title race, derby, friendly…' },
      { key: 'context', label: 'Context', hint: 'one sentence, anything else that matters' },
    ],
  },
]

export type ScoutSource = { title: string; url: string; site: string }

export type ScoutResult = {
  id: ScoutId
  fields: Record<string, string | null>
  sources: ScoutSource[]
}

export type MatchDossier = {
  matchTitle: string
  scouts: ScoutResult[]
}

export type ScoutEvent =
  | { type: 'stage'; stage: 'loading-model' | 'web' | 'synthesis' }
  | { type: 'activity'; message: string }
  | { type: 'scout-search'; scout: ScoutId; query: string }
  | { type: 'scout-reading'; scout: ScoutId; site: string; url: string }
  | { type: 'scout-web-done'; scout: ScoutId; sources: ScoutSource[] }
  | { type: 'scout-done'; scout: ScoutId; result: ScoutResult }
  | { type: 'answer-delta'; text: string }
  | { type: 'picks'; picks: MatchPickSuggestion[] }
  | { type: 'answer-reset' }
  | { type: 'synthesis-error'; message: string }
  | { type: 'dossier'; dossier: MatchDossier }
  | { type: 'done'; dossier: MatchDossier }

export type MatchScoutInput = {
  gameId?: string | null
  matchTitle: string
  startsAt?: string | null
  league?: string | null
  markets: MatchMarketInput[]
  tipsterHintsBlock?: string
}

const HITS_PER_SCOUT = 3
const PAGES_PER_SCOUT = 2
const PAGE_CHARS = 400
const SYNTH_MAX_WEB = 1100
const PREVIEW_TOKENS = 480

function formatDiverseCatalog(markets: MatchMarketInput[]): string {
  return formatOutcomeCatalogForPrompt(markets, 6)
}

function tipsterBlock(input: MatchScoutInput): string {
  return input.tipsterHintsBlock?.trim() ?? ''
}

function buildPicksOnlyPrompt(input: MatchScoutInput, intel: WebIntel[]): string {
  const markets = pickDiverseMarketsForAi(input.markets, 4)
  const catalog = formatDiverseCatalog(markets)
  const webBrief = buildCompactWebBrief(intel).slice(0, 280)
  const sides = teamSideHints(input.matchTitle)
  const hints = tipsterBlock(input)

  return [
    MODEL_REPLY_RULES,
    hints,
    `Match: ${input.matchTitle}`,
    sides ?? '',
    '',
    '=== AVAILABLE OUTCOMES (you MUST pick from this list) ===',
    catalog,
    OUTCOME_NAMING_RULES,
    hints ? 'Tipster convictions outrank scout intel when they conflict.' : '',
    webBrief ? `Scout intel:\n${webBrief}` : '',
    '',
    'Pick the best 1-3 outcomes. Copy outcome labels exactly as shown in quotes.',
    'PICK: <exact outcome label>',
    'MARKET: <exact market title>',
    'ALT2: <exact outcome label or NONE>',
    'MARKET2: <exact market title or NONE>',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildPreviewPrompt(
  input: MatchScoutInput,
  intel: WebIntel[],
  picks: MatchPickSuggestion[] = []
): string {
  const webBrief = buildCompactWebBrief(intel)
  const sides = parseTeamSides(input.matchTitle)
  const home = sides?.home ?? 'Home'
  const away = sides?.away ?? 'Away'
  const markets = pickDiverseMarketsForAi(input.markets, 4)
  const catalog = formatDiverseCatalog(markets)
  const hints = tipsterBlock(input)
  const playBlock =
    picks.length > 0
      ? picks
          .map(
            (p, i) =>
              `Bet ${i + 1}: "${p.outcomeTitle}" in ${p.conditionTitle} @ ${p.decimalOdds.toFixed(2)}x`
          )
          .join('\n')
      : `Recommend plays from these live odds (copy exact labels in REASON lines):\n${catalog}`

  return [
    MODEL_REPLY_RULES,
    hints,
    `Betting preview for ${input.matchTitle}.`,
    input.league ? `Competition: ${input.league}` : '',
    teamSideHints(input.matchTitle) ?? '',
    hints ? 'Tipster convictions outrank scout facts when they conflict.' : '',
    '',
    'Scout facts (synthesize — never copy URLs or headlines):',
    webBrief,
    '',
    'Bets to justify:',
    playBlock,
    '',
    'Write like a tipster article. Argue cause then bet. Use scout facts — never copy instruction text or meta-descriptions.',
    'Never write only the match name in MAIN — always add who you favour, odds, and why.',
    '',
    'Example style (write NEW analysis for this match — do not copy this example):',
    `MAIN: ${home} arrive as slight favourites around 2.10 — midfield control and knockout experience should tell.`,
    `HOME: ${home} won four of five recently, conceding once; the spine is intact despite one doubtful wide option.`,
    `AWAY: ${away} dominated possession but struggled to convert; their best creator is back and pace wide matters.`,
    'REASON1: Main bet fits because the favourite presses well when the underdog must chase.',
    'REASON2: Alt play targets value if the favourite sits deep (or NONE).',
    'REASON3: Longshot only if live odds drift (or NONE).',
    '',
    'Your reply — tagged lines with real sentences only:',
    'MAIN:',
    'HOME:',
    'AWAY:',
    'REASON1:',
    'REASON2:',
    'REASON3:',
  ]
    .filter(Boolean)
    .join('\n')
}

type WebIntel = {
  scout: ScoutSpec
  pages: Array<{ site: string; text: string }>
  sources: ScoutSource[]
}

function scoutResultFromWeb(item: WebIntel): ScoutResult {
  const excerpt = item.pages
    .map((p) => p.text)
    .join(' ')
    .slice(0, 280)
  const fields: Record<string, string | null> = {}
  for (let i = 0; i < item.scout.fields.length; i++) {
    const f = item.scout.fields[i]
    fields[f.key] = i === 0 && excerpt ? excerpt : null
  }
  return { id: item.scout.id, fields, sources: item.sources }
}

export function buildFallbackPreviewAnswer(
  dossier: { scouts: Array<{ id: string; fields: Record<string, string | null> }> },
  picks: MatchPickSuggestion[],
  matchTitle: string,
  intelText: string
): string {
  const sides = parseTeamSides(matchTitle)
  const snippets = intelText
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((line) => line.length > 28 && !line.startsWith('('))
    .slice(0, 5)

  const mainPick = picks[0]
  const lead = mainPick
    ? `Main play ${mainPick.outcomeTitle} (${mainPick.conditionTitle}) at ${mainPick.decimalOdds.toFixed(2)}x`
    : 'Scout pass completed'

  const mainBody = snippets[0] ?? `${lead} — built from web scout intel.`
  const lines = [`MAIN: ${lead}. ${mainBody}`.slice(0, 320)]

  if (sides) {
    const homeNote =
      snippets.find((s) => s.toLowerCase().includes(sides.home.toLowerCase().slice(0, 5))) ??
      snippets[1] ??
      `${sides.home} tracked in form and injury scouts.`
    const awayNote =
      snippets.find((s) => s.toLowerCase().includes(sides.away.toLowerCase().slice(0, 5))) ??
      snippets[2] ??
      `${sides.away} tracked in form and injury scouts.`
    lines.push(`HOME: ${homeNote.slice(0, 220)}`)
    lines.push(`AWAY: ${awayNote.slice(0, 220)}`)
  }

  picks.forEach((pick, index) => {
    const note = snippets[index + 1] ?? snippets[0] ?? lead
    lines.push(`REASON${index + 1}: ${pick.outcomeTitle} — ${note.slice(0, 160)}`)
  })

  return lines.join('\n')
}

export function dossierToText(dossier: MatchDossier): string {
  const lines: string[] = []
  for (const result of dossier.scouts) {
    const spec = SCOUTS.find((s) => s.id === result.id)
    if (!spec) continue
    const filled = spec.fields
      .map((f) => (result.fields[f.key] ? `${f.label}: ${result.fields[f.key]}` : null))
      .filter(Boolean)
    const sourceNames = result.sources
      .map((s) => s.site)
      .filter(Boolean)
      .slice(0, 2)
      .join(', ')
    if (filled.length === 0 && result.sources.length === 0) continue
    const body =
      filled.length > 0
        ? filled.map((l) => `- ${l}`).join('\n')
        : '- (sources found, page text unavailable)'
    lines.push(sourceNames ? `${spec.label} (${sourceNames}):\n${body}` : `${spec.label}:\n${body}`)
  }
  return lines.join('\n\n') || '(no reliable data found)'
}

function buildCompactWebBrief(intel: WebIntel[]): string {
  let used = 0
  const parts: string[] = []
  for (const item of intel) {
    const text = item.pages.map((p) => p.text).join(' ').slice(0, 180)
    if (!text) continue
    const line = `${item.scout.label}: ${text}`
    if (used + line.length > SYNTH_MAX_WEB) break
    parts.push(line)
    used += line.length + 1
  }
  return parts.join('\n') || '(no web data)'
}

async function collectWebIntel(
  spec: ScoutSpec,
  input: MatchScoutInput,
  signal: AbortSignal | undefined,
  emit: (e: ScoutEvent) => void
): Promise<WebIntel> {
  const query = spec.buildQuery(input.matchTitle, input.league)
  emit({ type: 'scout-search', scout: spec.id, query })

  let hits: Awaited<ReturnType<typeof ddgSearch>> = []
  try {
    hits = await ddgSearch(query, 4)
  } catch {
    hits = []
  }

  const fetchResults = await Promise.all(
    hits.slice(0, HITS_PER_SCOUT).map(async (hit) => {
      if (signal?.aborted) return { hit, text: '' }
      emit({ type: 'scout-reading', scout: spec.id, site: hit.site, url: hit.url })
      const text = await fetchPageText(hit.url)
      return { hit, text }
    })
  )

  const pages: Array<{ site: string; text: string }> = []
  const sources: ScoutSource[] = []
  for (const { hit, text } of fetchResults) {
    if (pages.length >= PAGES_PER_SCOUT) break
    if (text.length < 120) continue
    pages.push({ site: hit.site, text: text.slice(0, PAGE_CHARS) })
    sources.push({ title: hit.title, url: hit.url, site: siteOf(hit.url) })
  }

  emit({ type: 'scout-web-done', scout: spec.id, sources })

  const intel: WebIntel = { scout: spec, pages, sources }
  emit({ type: 'scout-done', scout: spec.id, result: scoutResultFromWeb(intel) })
  return intel
}

async function* waitWithDrain(
  promise: Promise<unknown>,
  drain: () => Generator<ScoutEvent, void, unknown>,
  signal?: AbortSignal,
  intervalMs = 40
) {
  const settled = promise.then(() => true)
  while (true) {
    yield* drain()
    const finished = await Promise.race([
      settled,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), intervalMs)),
    ])
    if (finished) break
    if (signal?.aborted) return
  }
  yield* drain()
}

/**
 * Full pipeline as an async generator of progress events.
 * Web collection runs fully in parallel; only one LLM pass at the end.
 */
export async function* runMatchScout(
  input: MatchScoutInput,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ScoutEvent> {
  const signal = options?.signal

  const queue: ScoutEvent[] = []
  const emit = (e: ScoutEvent) => queue.push(e)
  function* drain() {
    while (queue.length > 0) yield queue.shift() as ScoutEvent
  }

  yield { type: 'stage', stage: 'loading-model' }
  emit({ type: 'activity', message: 'Loading local model (CPU)…' })

  const webPromises = SCOUTS.map((spec) => collectWebIntel(spec, input, signal, emit))
  const webAll = Promise.all(webPromises)

  yield* waitWithDrain(ensureModelReady(), drain, signal)
  if (signal?.aborted) return

  yield { type: 'stage', stage: 'web' }
  yield* waitWithDrain(webAll, drain, signal)
  if (signal?.aborted) return

  const intel = await webAll

  const dossier: MatchDossier = {
    matchTitle: input.matchTitle,
    scouts: intel.map((item) => scoutResultFromWeb(item)),
  }

  if (signal?.aborted) return
  yield { type: 'dossier', dossier }
  yield { type: 'stage', stage: 'synthesis' }

  const catalog = buildOutcomeCatalog(input.markets)
  if (catalog.length === 0) {
    yield {
      type: 'synthesis-error',
      message: 'No active outcomes on this page — wait for markets to load, then Refresh.',
    }
    yield { type: 'done', dossier }
    return
  }

  let fullAnswer = ''
  let picks: MatchPickSuggestion[] = []
  let lockedEnglishAnalysis = ''

  yield { type: 'answer-reset' }
  yield { type: 'activity', message: 'Starting model (CPU)…' }
  try {
    let previewBody = ''
    let rawPreviewChars = 0
    let tokenCount = 0
    const streamSanitizer = createStreamSanitizer()
    for await (const chunk of streamCompletion(buildPreviewPrompt(input, intel), {
      maxTokens: PREVIEW_TOKENS,
      temperature: 0.38,
      signal,
      assistantPrefix: 'MAIN: ',
    })) {
      if (signal?.aborted) return
      if (!chunk) continue
      rawPreviewChars += chunk.length
      const safe = streamSanitizer.feed(chunk)
      if (safe) {
        tokenCount += 1
        previewBody += safe
        yield { type: 'answer-delta', text: safe }
      }
      if (streamSanitizer.isThinking() || (hasThinkingNoise(chunk) && !safe)) {
        yield {
          type: 'activity',
          message: `Model reasoning (hidden) · ${rawPreviewChars} chars`,
        }
      } else if (tokenCount === 1) {
        yield { type: 'activity', message: 'Streaming analysis…' }
      } else if (tokenCount > 0 && tokenCount % 8 === 0) {
        yield { type: 'activity', message: `Streaming analysis · ${previewBody.length} chars` }
      }
    }
    const streamedClean = sanitizeModelAnswer(previewBody)
    const streamWasGood =
      !isGarbageModelOutput(streamedClean) &&
      hasSubstantiveAnalysis(streamedClean, input.matchTitle)

    if (streamWasGood) {
      lockedEnglishAnalysis = streamedClean
      fullAnswer = streamedClean
    } else {
      fullAnswer = streamedClean
    }
  } catch (e) {
    const lastError = e instanceof Error ? e.message : String(e)
    yield { type: 'synthesis-error', message: lastError }
  }

  if (
    !signal?.aborted &&
    !lockedEnglishAnalysis &&
    (isGarbageModelOutput(fullAnswer) || !hasSubstantiveAnalysis(fullAnswer, input.matchTitle))
  ) {
    try {
      yield { type: 'answer-reset' }
      yield { type: 'activity', message: 'Rewriting analysis…' }
      let retryBody = ''
      const retrySanitizer = createStreamSanitizer()
      for await (const chunk of streamCompletion(
        [
          buildPreviewPrompt(input, intel),
          'Rewrite as a tipster preview using scout facts. No URLs. No thinking tags. Never repeat instruction text. MAIN/HOME/AWAY/REASON lines with real sentences only.',
        ].join('\n'),
        {
          assistantPrefix: 'MAIN: ',
          maxTokens: PREVIEW_TOKENS,
          temperature: 0.42,
          signal,
        }
      )) {
        if (signal?.aborted) return
        if (!chunk) continue
        const safe = retrySanitizer.feed(chunk)
        if (!safe) continue
        retryBody += safe
        yield { type: 'answer-delta', text: safe }
      }
      const trimmed = sanitizeModelAnswer(retryBody.trim())
      if (trimmed && !isGarbageModelOutput(trimmed) && hasSubstantiveAnalysis(trimmed, input.matchTitle)) {
        fullAnswer = /^main:/i.test(trimmed) ? trimmed : `MAIN: ${trimmed}`
      }
    } catch {
      // Preview retry is best-effort.
    }
  }

  if (!signal?.aborted && !lockedEnglishAnalysis && !hasSubstantiveAnalysis(fullAnswer, input.matchTitle)) {
    const intelText = dossierToText(dossier)
    const fallbackPicks = buildSmartFallbackPicks(catalog, input.matchTitle)
    fullAnswer = buildFallbackPreviewAnswer(dossier, fallbackPicks, input.matchTitle, intelText)
    yield { type: 'answer-reset' }
    yield { type: 'answer-delta', text: fullAnswer }
  }

  yield { type: 'activity', message: 'Locking picks…' }
  picks = parsePickSuggestions(fullAnswer, catalog, input.matchTitle)
  if (picks.length === 0) {
    try {
      const picksRaw = await completeOnce(buildPicksOnlyPrompt(input, intel), {
        assistantPrefix: 'PICK: ',
        maxTokens: 120,
        temperature: 0.05,
        signal,
      })
      picks = parsePickSuggestions(sanitizeModelAnswer(picksRaw), catalog, input.matchTitle)
    } catch {
      // Fall through to smart fallback.
    }
  }
  if (picks.length === 0) {
    picks = buildSmartFallbackPicks(catalog, input.matchTitle)
  }

  const picksBlock = formatPicksAnswerBlock(picks).trimEnd()
  const analysisForAnswer = lockedEnglishAnalysis || fullAnswer
  if (picksBlock) {
    fullAnswer = analysisForAnswer ? `${analysisForAnswer}\n${picksBlock}` : picksBlock
  } else {
    fullAnswer = analysisForAnswer
  }

  if (picks.length > 0) {
    yield { type: 'picks', picks }
  }

  fullAnswer = sanitizeModelAnswer(fullAnswer)
  const englishAnalysis = lockedEnglishAnalysis || stripPromptEchoLines(fullAnswer.split(/\n(?=PICK:)/i)[0] ?? fullAnswer)

  const userSettings = await loadQvacSettings()
  if (
    !signal?.aborted &&
    requiresTranslationModel(userSettings.outputLanguage) &&
    englishAnalysis
  ) {
    const lang = userSettings.outputLanguage
    const langLabel =
      QVAC_OUTPUT_LANGUAGE_OPTIONS.find((o) => o.code === lang)?.label ?? lang.toUpperCase()

    if (!(await isTranslationModelInstalled(lang))) {
      yield {
        type: 'synthesis-error',
        message: `Download the ${langLabel} translation model in Settings → Output language.`,
      }
    } else {
      yield { type: 'activity', message: `Translating to ${langLabel}…` }
      try {
        let translated = fullAnswer
        for await (const partial of streamTranslateScoutAnswer(englishAnalysis, lang, signal, {
          matchTitle: input.matchTitle,
          picksSuffix: picksBlock || undefined,
        })) {
          if (signal?.aborted) return
          if (!partial || partial === translated) continue
          translated = partial
          yield { type: 'answer-reset' }
          yield { type: 'answer-delta', text: partial }
        }
        if (translated && translated !== fullAnswer && hasTranslatableTaggedOutput(translated)) {
          fullAnswer = translated
        } else if (translated !== fullAnswer) {
          yield { type: 'answer-reset' }
          yield { type: 'answer-delta', text: fullAnswer }
          yield {
            type: 'synthesis-error',
            message: 'Translation looked invalid — kept English analysis.',
          }
        }
      } catch (e) {
        const lastError = e instanceof Error ? e.message : String(e)
        yield { type: 'synthesis-error', message: `Translation failed: ${lastError}` }
      } finally {
        await unloadTranslationModel()
      }
    }
  }

  yield { type: 'done', dossier }
}
