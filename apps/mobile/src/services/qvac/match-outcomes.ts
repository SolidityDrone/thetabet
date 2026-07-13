/** Flat catalog entry for an active Azuro outcome the user can bet on. */
export type OutcomeOption = {
  conditionId: string
  conditionTitle: string
  outcomeId: string
  outcomeTitle: string
  decimalOdds: number
  rawOdds: string
}

export type MatchMarketInput = {
  conditionId: string
  conditionTitle: string
  outcomes: Array<{
    outcomeId: string
    title: string
    decimalOdds: number
    rawOdds: string
  }>
}

export type MatchPickSuggestion = OutcomeOption & {
  rank: 1 | 2 | 3
  reason?: string | null
}

function norm(s: string) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function buildOutcomeCatalog(markets: MatchMarketInput[]): OutcomeOption[] {
  const out: OutcomeOption[] = []
  for (const m of markets) {
    for (const o of m.outcomes) {
      out.push({
        conditionId: m.conditionId,
        conditionTitle: m.conditionTitle,
        outcomeId: o.outcomeId,
        outcomeTitle: o.title,
        decimalOdds: o.decimalOdds,
        rawOdds: o.rawOdds,
      })
    }
  }
  return out
}

const MAX_INFERENCE_MARKETS = 80
const MAX_INFERENCE_OUTCOMES = 20

/** Drop empty/suspended markets before peer RPC — matches pear-end validation. */
export function sanitizeMarketsForInference(markets: MatchMarketInput[]): MatchMarketInput[] {
  const clean: MatchMarketInput[] = []

  for (const market of markets) {
    const conditionId = String(market?.conditionId ?? '').trim()
    const conditionTitle = String(market?.conditionTitle ?? '').trim()
    if (!conditionId || !conditionTitle || !Array.isArray(market.outcomes)) continue

    const outcomes = market.outcomes
      .map((outcome) => {
        const outcomeId = String(outcome?.outcomeId ?? '').trim()
        const title = String(outcome?.title ?? '').trim()
        const decimalOdds = Number(outcome?.decimalOdds)
        if (!outcomeId || !title || !Number.isFinite(decimalOdds) || decimalOdds <= 1) return null
        return {
          outcomeId,
          title,
          decimalOdds,
          rawOdds:
            typeof outcome?.rawOdds === 'string' && outcome.rawOdds.trim()
              ? outcome.rawOdds.trim()
              : String(decimalOdds),
        }
      })
      .filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== null)
      .slice(0, MAX_INFERENCE_OUTCOMES)

    if (outcomes.length === 0) continue
    clean.push({ conditionId, conditionTitle, outcomes })
    if (clean.length >= MAX_INFERENCE_MARKETS) break
  }

  return clean
}

function extractTaggedLine(answer: string, tag: string): string | null {
  const re = new RegExp(`^${tag}:\\s*(.+)$`, 'im')
  const m = answer.match(re)
  if (!m) return null
  const v = m[1].trim()
  if (!v || /^none$/i.test(v)) return null
  return v
}

const BOILERPLATE_RE = [
  /i(?:'m| am) ready to assist/i,
  /i(?:'m| am) ready to help/i,
  /please provide/i,
  /how can i help/i,
  /what(?:'s| is) the match/i,
  /match between/i,
  /as (?:an? )?(?:ai|assistant|language model)/i,
  /i(?:'d| would) be happy to/i,
  /let me know/i,
  /share (?:the )?(?:match|details|information)/i,
  /once you provide/i,
  /to help you(?: with)?/i,
  /i can help/i,
  /feel free to/i,
  /do(?:n't| not) have (?:the |an? )?(?:outcome|odds|list|market)/i,
  /outcomes? (?:are |is )?not (?:available|provided|loaded)/i,
  /without (?:the |an? )?(?:outcome|odds|market) list/i,
]

const THINK_TAG = 'think'
const THINK_OPEN_RE = new RegExp(`<${THINK_TAG}>|<<think>>`, 'i')
const THINK_CLOSE_RE = new RegExp(`</${THINK_TAG}>|<<\\/redacted_thinking>>`, 'i')
const THINK_TAG_FRAGMENT_RE = new RegExp(
  `<(?:\\/?${THINK_TAG}(?:>|)?|<?<?redacted_thinking)?$`,
  'i'
)

/** Strip Qwen thinking / chat-template noise from completed text. */
export function sanitizeModelAnswer(text: string): string {
  return text
    .replace(new RegExp(`[\\s\\S]*?</${THINK_TAG}>`, 'gi'), '')
    .replace(/<<think>>[\s\S]*?<<\/redacted_thinking>>/gi, '')
    .replace(new RegExp(`</?${THINK_TAG}>`, 'gi'), '')
    .replace(/<<\/?redacted_thinking>>/gi, '')
    .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/gi, '')
    .trim()
}

function splitPartialThinkTag(pending: string): { emit: string; hold: string } {
  const lastOpen = pending.lastIndexOf('<')
  if (lastOpen === -1) return { emit: pending, hold: '' }
  const tail = pending.slice(lastOpen)
  if (THINK_TAG_FRAGMENT_RE.test(tail)) {
    return { emit: pending.slice(0, lastOpen), hold: tail }
  }
  return { emit: pending, hold: '' }
}

export function hasThinkingNoise(text: string): boolean {
  return new RegExp(`<${THINK_TAG}|<\\/think>|redacted_thinking`, 'i').test(text)
}

/** Incremental filter — drops thinking tokens before they reach the UI. */
export function createStreamSanitizer() {
  let inThink = false
  let pending = ''
  let held = ''

  function feed(chunk: string): string {
    pending = held + chunk
    held = ''
    let emit = ''

    while (pending.length > 0) {
      if (inThink) {
        const closeMatch = pending.match(THINK_CLOSE_RE)
        const answerBreak = pending.match(/(?:^|\n)(?:MAIN|HOME|AWAY):/i)
        if (
          answerBreak &&
          answerBreak.index !== undefined &&
          (!closeMatch || closeMatch.index === undefined || answerBreak.index < closeMatch.index)
        ) {
          inThink = false
          continue
        }
        if (!closeMatch || closeMatch.index === undefined) {
          pending = ''
          break
        }
        pending = pending.slice(closeMatch.index + closeMatch[0].length)
        inThink = false
        continue
      }

      const openMatch = pending.match(THINK_OPEN_RE)
      if (!openMatch || openMatch.index === undefined || openMatch[0].length === 0) {
        const split = splitPartialThinkTag(pending)
        emit += split.emit
        held = split.hold
        pending = ''
        break
      }

      emit += pending.slice(0, openMatch.index)
      pending = pending.slice(openMatch.index + openMatch[0].length)
      inThink = true
    }

    return emit
      .replace(new RegExp(`</?${THINK_TAG}>`, 'gi'), '')
      .replace(/<<\/?redacted_thinking>>/gi, '')
  }

  function isThinking(): boolean {
    return inThink || held.length > 0
  }

  return { feed, isThinking }
}

function isTemplateEcho(text: string): boolean {
  return (
    isPromptInstructionEcho(text) ||
    /<\s*.+\s*-\s*(?:form|injuries|key players).*\d-\d\s*sentences?\s*>/i.test(text) ||
    (/HOME:|AWAY:/i.test(text) && /<\s*[^>]{8,}\s*>/i.test(text) && /\d-\d\s*sentences/i.test(text))
  )
}

/** Model echoing our tagged prompt instructions instead of real analysis. */
export function isPromptInstructionEcho(text: string): boolean {
  const t = text.trim()
  if (t.length < 12) return false
  const patterns = [
    /^two or three sentences\b/i,
    /\bmain prediction\b.*\b(?:favourite|favorite)\b/i,
    /\b(?:favourite|favorite)\b.*\bodds\b.*\bwhy\b/i,
    /^one sentence tactical motivation/i,
    /\bwrite real prose\b/i,
    /\bnever copy instruction\b/i,
    /\bform, injuries, and (?:tournament run|key players)\b/i,
    /\brecommend plays from these live odds\b/i,
    /\bcopy exact labels in reason\b/i,
    /^due o tre frasi\b/i,
    /\bprevisione principale\b/i,
    /\buna frase\b.*\bmotivazione tattica\b/i,
    /\bquote\b.*\bperch[eé]\b/i,
  ]
  return patterns.some((re) => re.test(t))
}

export function isGarbageModelOutput(text: string): boolean {
  const t = sanitizeModelAnswer(text).trim()
  if (!t) return true
  if (/redacted_thinking/i.test(text)) return true
  if (/<\/?think>/i.test(text)) return true
  if (isTemplateEcho(t)) return true
  if (BOILERPLATE_RE.some((re) => re.test(t))) return true
  return false
}

export const MODEL_REPLY_RULES =
  'Reply with tagged lines only. No thinking blocks. No think XML tags. No redacted_thinking tags. No placeholder text in angle brackets.'

const RAW_INTEL_RE = [
  /\[[\w.-]+\]/,
  /https?:\/\//i,
  /\b\w+\.(com|net|org|io)\b/i,
  /\bhead to head\b.*\bhistory\b/i,
  /\brecent form last \d\b/i,
  /\binjuries suspensions team news\b/i,
]

/** Detect pasted scout/page text — not bettor-facing argumentation. */
export function isRawIntelDump(text: string): boolean {
  const t = text.trim()
  if (t.length < 10) return false
  if (RAW_INTEL_RE.some((re) => re.test(t))) return true
  if (
    t.length > 200 &&
    !/\b(because|favor|favour|lean|back|play|value|expect|likely|struggling|injur|form|goals?|win|draw|odds|squad|attack|defen)\b/i.test(
      t
    )
  ) {
    return true
  }
  return false
}

function isUsableReason(text: string, matchTitle?: string): boolean {
  const t = text.trim()
  if (t.length < 12) return false
  if (isBoilerplate(t) || isRawIntelDump(t) || isPromptInstructionEcho(t)) return false
  if (matchTitle && norm(stripMatchLeadIn(t, matchTitle)) === '') return false
  return true
}

function isMatchTitleEcho(text: string, matchTitle?: string): boolean {
  if (!matchTitle) return false
  const cleaned = stripMatchLeadIn(text.trim(), matchTitle)
  if (!cleaned) return true
  const t = norm(cleaned)
  const title = norm(matchTitle)
  if (t === title) return true
  if (t.startsWith(title) && t.length < title.length + 20) return true
  return false
}

function isNearDuplicateText(a: string, b: string | null | undefined): boolean {
  if (!b) return false
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const shorter = na.length < nb.length ? na : nb
  const longer = na.length < nb.length ? nb : na
  return longer.includes(shorter) && shorter.length > 40
}

function isUsableProse(text: string, matchTitle?: string): boolean {
  const t = sanitizeModelAnswer(text).trim()
  if (t.length < 24) return false
  if (matchTitle && isMatchTitleEcho(t, matchTitle)) return false
  if (isBoilerplate(t) || isRawIntelDump(t) || isTemplateEcho(t)) return false
  if (/redacted_thinking/i.test(t)) return false
  return true
}

function normalizeProseBlock(text: string, tag: string, matchTitle?: string): string {
  let cleaned = stripMatchLeadIn(text.trim(), matchTitle)
  if (tag === 'MAIN' && matchTitle && cleaned) {
    const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length > 1 && isMatchTitleEcho(lines[0], matchTitle)) {
      cleaned = lines.slice(1).join(' ')
    }
  }
  return cleaned.trim()
}

function extractProseBlock(answer: string, tag: string, matchTitle?: string): string | null {
  const block = answer.match(
    new RegExp(
      `^${tag}:\\s*([\\s\\S]*?)(?=^(?:MAIN|HOME|AWAY|HOME_FORM|AWAY_FORM|MOTIVATION|ANALYSIS|PICK|REASON\\d*|MARKET\\d*|ALT\\d*):|$)`,
      'im'
    )
  )
  if (block?.[1]) {
    const text = normalizeProseBlock(block[1], tag, matchTitle)
    if (text && isUsableProse(text, matchTitle) && !isTitleOnlyMain(text, matchTitle)) return text
  }

  const single = extractTaggedLine(answer, tag)
  if (single) {
    const text = normalizeProseBlock(single, tag, matchTitle)
    if (text && isUsableProse(text, matchTitle) && !isTitleOnlyMain(text, matchTitle)) return text
  }
  return null
}

function extractProseSection(answer: string, tags: string[], matchTitle?: string): string | null {
  for (const tag of tags) {
    const val = extractProseBlock(answer, tag, matchTitle)
    if (val) return val
  }
  return null
}

export type MatchPreviewSections = {
  main: string | null
  homeForm: string | null
  awayForm: string | null
}

function isTitleOnlyMain(text: string, matchTitle?: string): boolean {
  if (!matchTitle) return false
  if (isMatchTitleEcho(text, matchTitle)) return true
  const body = stripMatchLeadIn(text, matchTitle)
  if (!body) return true
  if (body.length < 48 && !isArgumentative(body)) return true
  return false
}

function extractLenientProse(answer: string, tag: string, matchTitle?: string): string | null {
  const text = extractPartialProse(answer, tag)
  if (!text) return null
  const cleaned = normalizeProseBlock(text, tag, matchTitle)
  if (!cleaned || isTitleOnlyMain(cleaned, matchTitle) || isTemplateEcho(cleaned) || isBoilerplate(cleaned) || isPromptInstructionEcho(cleaned)) {
    return null
  }
  if (/redacted_thinking/i.test(cleaned)) return null
  return cleaned
}

export type MatchCommentary = MatchPreviewSections & {
  reasons: string[]
}

/** UI-facing parser — accepts shorter prose; drops title-only MAIN lines. */
export function parseCommentary(answer: string, matchTitle?: string): MatchCommentary {
  const clean = sanitizeModelAnswer(answer)
  return {
    main:
      extractLenientProse(clean, 'MAIN', matchTitle) ??
      extractLenientProse(clean, 'MOTIVATION', matchTitle) ??
      extractLenientProse(clean, 'ANALYSIS', matchTitle),
    homeForm: extractLenientProse(clean, 'HOME', matchTitle) ?? extractLenientProse(clean, 'HOME_FORM', matchTitle),
    awayForm: extractLenientProse(clean, 'AWAY', matchTitle) ?? extractLenientProse(clean, 'AWAY_FORM', matchTitle),
    reasons: collectReasons(clean, matchTitle),
  }
}

export function parseCommentaryReasons(answer: string, matchTitle?: string): string[] {
  return collectReasons(sanitizeModelAnswer(answer), matchTitle)
}

export function parsePreviewSections(answer: string, matchTitle?: string): MatchPreviewSections {
  const clean = sanitizeModelAnswer(answer)
  return {
    main: extractProseSection(clean, ['MAIN', 'MOTIVATION', 'ANALYSIS'], matchTitle),
    homeForm: extractProseSection(clean, ['HOME', 'HOME_FORM'], matchTitle),
    awayForm: extractProseSection(clean, ['AWAY', 'AWAY_FORM'], matchTitle),
  }
}

/** Lenient parser for live streaming — no minimum length gate. */
export function parsePreviewSectionsPartial(answer: string, matchTitle?: string): MatchPreviewSections {
  const clean = sanitizeModelAnswer(answer)
  return {
    main:
      cleanPartialProse(clean, 'MAIN', matchTitle) ??
      cleanPartialProse(clean, 'MOTIVATION', matchTitle) ??
      cleanPartialProse(clean, 'ANALYSIS', matchTitle),
    homeForm: cleanPartialProse(clean, 'HOME', matchTitle) ?? cleanPartialProse(clean, 'HOME_FORM', matchTitle),
    awayForm: cleanPartialProse(clean, 'AWAY', matchTitle) ?? cleanPartialProse(clean, 'AWAY_FORM', matchTitle),
  }
}

function cleanPartialProse(answer: string, tag: string, matchTitle?: string): string | null {
  const text = extractPartialProse(answer, tag)
  if (!text) return null
  if (isTemplateEcho(text) || /redacted_thinking/i.test(text) || isBoilerplate(text) || isPromptInstructionEcho(text)) return null

  let cleaned = stripMatchLeadIn(text, matchTitle)
  if (matchTitle && cleaned && isMatchTitleEcho(cleaned, matchTitle)) {
    const rest = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(1)
      .join(' ')
    cleaned = rest.length > 0 ? stripMatchLeadIn(rest, matchTitle) : ''
  }

  if (!cleaned || (matchTitle && isMatchTitleEcho(cleaned, matchTitle))) return null
  return cleaned
}

function extractPartialProse(answer: string, tag: string): string | null {
  const block = answer.match(
    new RegExp(
      `^${tag}:\\s*([\\s\\S]*?)(?=^(?:MAIN|HOME|AWAY|HOME_FORM|AWAY_FORM|MOTIVATION|ANALYSIS|PICK|REASON\\d*|MARKET\\d*|ALT\\d*):|$)`,
      'im'
    )
  )
  if (!block?.[1]) return null
  const text = block[1].trim()
  return text.length > 0 ? text : null
}

/** Raw model output for the preview pass — no parsing, only hide pick structure lines. */
export function formatRawAnalysisStream(answer: string): string {
  return stripPromptEchoLines(
    sanitizeModelAnswer(answer)
      .split('\n')
      .filter((line) => !/^(PICK|MARKET\d*|ALT\d*):\s*/i.test(line.trim()))
      .join('\n')
      .trim()
  )
}

/** Incremental preview while tokens arrive — no strict prose gates. */
export function formatStreamingAnalysisDisplay(answer: string, matchTitle?: string): string {
  let clean = sanitizeModelAnswer(answer)
  if (!clean.trim()) return ''

  clean = clean
    .split('\n')
    .filter((line) => !/^(PICK|MARKET\d*|ALT\d*|REASON\d*):\s*/i.test(line.trim()))
    .join('\n')

  const sides = matchTitle ? parseTeamSides(matchTitle) : null
  const parts: string[] = []

  for (const spec of [
    { tag: 'MAIN', prefix: '' },
    { tag: 'HOME', prefix: sides ? `${sides.home}: ` : '' },
    { tag: 'AWAY', prefix: sides ? `${sides.away}: ` : '' },
  ] as const) {
    const block = clean.match(
      new RegExp(
        `^${spec.tag}:\\s*([\\s\\S]*?)(?=^(?:MAIN|HOME|AWAY|REASON\\d*|PICK|MARKET\\d*|ALT\\d*):|$)`,
        'im'
      )
    )
    if (!block?.[1]) continue
    let body = block[1]
      .replace(/\n(?:MAIN|HOME|AWAY|REASON\d*|PICK|MARKET\d*|ALT\d*):?\s*$/i, '')
      .trim()
    if (!body || isPromptInstructionEcho(body)) continue
    parts.push(`${spec.prefix}${body}`)
  }

  if (parts.length > 0) return parts.join('\n\n')

  const tail = clean.replace(/^MAIN:\s*/i, '').trim()
  if (!tail || isPromptInstructionEcho(tail)) return ''
  if (/^(HOME|AWAY|REASON\d*|PICK|MARKET|ALT\d*):/i.test(tail)) return ''
  return tail.replace(/\n(?:HOME|AWAY|REASON\d*):[\s\S]*$/i, '').trim()
}

/** Bettor-facing analysis in the sheet — prose only, no tags or prompt echoes. */
export function formatAnalysisStreamDisplay(answer: string, matchTitle?: string): string {
  const stripped = formatRawAnalysisStream(answer)
  if (!stripped) return ''

  const commentary = parseCommentary(stripped, matchTitle)
  const partial = parsePreviewSectionsPartial(stripped, matchTitle)
  const sides = matchTitle ? parseTeamSides(matchTitle) : null
  const parts: string[] = []

  const main = commentary.main ?? partial.main
  const home = commentary.homeForm ?? partial.homeForm
  const away = commentary.awayForm ?? partial.awayForm

  if (main) parts.push(main)

  if (home || away) {
    const form: string[] = []
    if (home) form.push(`${sides?.home ?? 'Home'}: ${home}`)
    if (away) form.push(`${sides?.away ?? 'Away'}: ${away}`)
    parts.push(form.join('\n\n'))
  }

  if (parts.length > 0) return parts.join('\n\n')

  return stripped
    .split('\n')
    .map((line) => {
      const match = line.match(/^(MAIN|HOME|AWAY|REASON\d*):\s*(.+)$/i)
      if (!match) return line.trim()
      const [, tag, value] = match
      if (isPromptInstructionEcho(value)) return ''
      const upper = tag.toUpperCase()
      if (upper === 'HOME') return `${sides?.home ?? 'Home'}: ${value}`
      if (upper === 'AWAY') return `${sides?.away ?? 'Away'}: ${value}`
      if (upper.startsWith('REASON')) return ''
      return value
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

/** @deprecated use formatRawAnalysisStream */
export function formatLivePreviewDraft(answer: string): string {
  return formatRawAnalysisStream(answer)
}

export function formatPicksAnswerBlock(picks: MatchPickSuggestion[]): string {
  if (picks.length === 0) return ''
  const lines = [`PICK: ${picks[0].outcomeTitle}`, `MARKET: ${picks[0].conditionTitle}`]
  if (picks[1]) {
    lines.push(`ALT2: ${picks[1].outcomeTitle}`, `MARKET2: ${picks[1].conditionTitle}`)
  }
  if (picks[2]) {
    lines.push(`ALT3: ${picks[2].outcomeTitle}`, `MARKET3: ${picks[2].conditionTitle}`)
  }
  return `${lines.join('\n')}\n`
}

export function attachReasonsToPicks(
  answer: string,
  picks: MatchPickSuggestion[],
  matchTitle?: string
): MatchPickSuggestion[] {
  const clean = sanitizeModelAnswer(answer)
  const mainText = extractProseSection(clean, ['MAIN', 'MOTIVATION', 'ANALYSIS'], matchTitle)
  const reasonByRank: Record<1 | 2 | 3, string | null> = {
    1: extractTaggedLine(clean, 'REASON1'),
    2: extractTaggedLine(clean, 'REASON2'),
    3: extractTaggedLine(clean, 'REASON3'),
  }

  return picks.map((pick) => {
    const tagged = reasonByRank[pick.rank]
    if (!tagged || !isUsableReason(tagged, matchTitle) || isPromptInstructionEcho(tagged)) {
      return { ...pick, reason: null }
    }
    if (isNearDuplicateText(tagged, mainText)) {
      return { ...pick, reason: null }
    }
    return { ...pick, reason: tagged }
  })
}

function isBoilerplate(text: string): boolean {
  const t = text.trim()
  if (t.length < 8) return true
  if (BOILERPLATE_RE.some((re) => re.test(t))) return true
  if (/\?\s*$/.test(t) && /what|which|provide|help|match/i.test(t)) return true
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Strip "For {match title}," lead-ins the model echoes without adding analysis. */
function stripMatchLeadIn(text: string, matchTitle?: string): string {
  let t = text.trim()
  if (!matchTitle) return t

  const title = matchTitle.trim()
  t = t.replace(new RegExp(`^for\\s+${escapeRegex(title)}\\s*[,;:.–—-]?\\s*`, 'i'), '').trim()

  const nt = norm(t)
  const nTitle = norm(title)
  const nForTitle = norm(`for ${title}`)
  if (nt === nTitle || nt === nForTitle || nt.startsWith(`${nTitle} `) && nt.length < nTitle.length + 12) {
    return ''
  }
  return t
}

function isArgumentative(text: string): boolean {
  return /\b(because|so|therefore|lean|back|play|value|makes sense|favor|likely|expect|struggling|momentum|injur|form|draw|under|over|tight|wins?|loses?|goals?|price|fair|live|angle|case|risk)\b/i.test(
    text
  )
}

function isTrivialMotivation(text: string, matchTitle?: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (isBoilerplate(t) || isRawIntelDump(t)) return true

  const body = stripMatchLeadIn(t, matchTitle)
  if (body.length < 24) return true
  if (!isArgumentative(body)) return true
  return false
}

function extractMotivationBlock(answer: string, matchTitle?: string): string | null {
  const tagged = extractTaggedLine(answer, 'MOTIVATION')
  if (tagged) {
    const cleaned = stripMatchLeadIn(tagged, matchTitle)
    if (cleaned && !isTrivialMotivation(cleaned, matchTitle) && !isRawIntelDump(cleaned)) return cleaned
  }

  const block = answer.match(/^MOTIVATION:\s*([\s\S]*?)(?=^PICK:|^MARKET:|^ALT2:|^REASON1:|$)/im)
  if (block?.[1]) {
    const cleaned = stripMatchLeadIn(block[1].trim(), matchTitle)
    if (cleaned && !isTrivialMotivation(cleaned, matchTitle) && !isRawIntelDump(cleaned)) return cleaned
  }
  return null
}

function extractAnalysisBlock(answer: string): string | null {
  const tagged = extractTaggedLine(answer, 'ANALYSIS')
  if (tagged && !isBoilerplate(tagged)) return tagged

  const block = answer.match(/^ANALYSIS:\s*([\s\S]*?)(?=^PICK:|^MARKET:|^ALT2:|^REASON1:|$)/im)
  if (block?.[1]) {
    const text = block[1].trim()
    if (text && !isBoilerplate(text)) return text
  }
  return null
}

function collectReasons(answer: string, matchTitle?: string): string[] {
  const reasons: string[] = []
  for (const tag of ['REASON1', 'REASON2', 'REASON3', 'REASON']) {
    const r = extractTaggedLine(answer, tag)
    if (r && isUsableReason(r, matchTitle) && !reasons.includes(r)) reasons.push(r)
  }
  return reasons
}

function cleanProse(answer: string): string {
  let prose = answer
    .replace(/^(PICK|MARKET\d*|ALT\d*|REASON\d*|REASON|ANALYSIS|MOTIVATION):\s*.+$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const lines = prose.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t || isBoilerplate(t)) continue
    if (kept[kept.length - 1] === t) continue
    kept.push(t)
  }
  return kept.join('\n').trim()
}

/** Bettor-facing analysis report — prediction + team form + why (no raw tags). */
export function buildAnalysisDisplayText(
  answer: string,
  matchTitle?: string,
  scoutIntel?: string | null
): string {
  const commentary = parseCommentary(answer, matchTitle)
  const sides = matchTitle ? parseTeamSides(matchTitle) : null
  const parts: string[] = []

  if (commentary.main) parts.push(commentary.main)

  if (commentary.homeForm || commentary.awayForm) {
    const form: string[] = []
    if (commentary.homeForm) form.push(`${sides?.home ?? 'Home'}: ${commentary.homeForm}`)
    if (commentary.awayForm) form.push(`${sides?.away ?? 'Away'}: ${commentary.awayForm}`)
    parts.push(form.join('\n\n'))
  }

  if (parts.length > 0) return parts.join('\n\n')

  const draft = formatAnalysisStreamDisplay(answer, matchTitle)
  if (draft && !isTitleOnlyMain(draft, matchTitle)) return draft

  const intel = scoutIntel?.trim()
  if (intel && intel.length > 40) return intel

  return ''
}

/** Full preview text: main tip + team form + per-pick motivations. */
export function buildMatchPreviewText(
  answer: string,
  picks: MatchPickSuggestion[],
  matchTitle?: string
): string {
  const analysis = buildAnalysisDisplayText(answer, matchTitle)
  const withReasons = attachReasonsToPicks(answer, picks, matchTitle)
  const parts = analysis ? [analysis] : []

  for (const pick of withReasons) {
    if (!pick.reason) continue
    const label = pick.rank === 1 ? 'Main tip' : pick.rank === 2 ? 'Alt play' : 'Longshot'
    parts.push(
      `${label} — ${pick.outcomeTitle} (${pick.conditionTitle}) @ ${pick.decimalOdds.toFixed(2)}x: ${pick.reason}`
    )
  }

  return parts.join('\n\n')
}

/** @deprecated use buildMatchPreviewText */
export function buildPickMotivationText(
  answer: string,
  picks: MatchPickSuggestion[],
  matchTitle?: string
): string {
  return buildMatchPreviewText(answer, picks, matchTitle)
}

export function hasSubstantiveAnalysis(answer: string, matchTitle?: string): boolean {
  const commentary = parseCommentary(answer, matchTitle)
  return Boolean(commentary.main || commentary.homeForm || commentary.awayForm)
}

export type TranslatableAnalysis = {
  main: string | null
  home: string | null
  away: string | null
  reasons: [string | null, string | null, string | null]
}

/** Parsed prose only — skips prompt echoes and pick structure lines. */
export function extractTranslatableAnalysis(
  answer: string,
  matchTitle?: string
): TranslatableAnalysis {
  const c = parseCommentary(answer, matchTitle)
  return {
    main: c.main,
    home: c.homeForm,
    away: c.awayForm,
    reasons: [c.reasons[0] ?? null, c.reasons[1] ?? null, c.reasons[2] ?? null],
  }
}

export function hasTranslatableContent(analysis: TranslatableAnalysis): boolean {
  return Boolean(
    analysis.main || analysis.home || analysis.away || analysis.reasons.some(Boolean)
  )
}

export function formatTranslatableAnalysis(analysis: TranslatableAnalysis): string {
  const lines: string[] = []
  if (analysis.main) lines.push(`MAIN: ${analysis.main}`)
  if (analysis.home) lines.push(`HOME: ${analysis.home}`)
  if (analysis.away) lines.push(`AWAY: ${analysis.away}`)
  if (analysis.reasons[0]) lines.push(`REASON1: ${analysis.reasons[0]}`)
  if (analysis.reasons[1]) lines.push(`REASON2: ${analysis.reasons[1]}`)
  if (analysis.reasons[2]) lines.push(`REASON3: ${analysis.reasons[2]}`)
  return lines.join('\n')
}

/** Drop tagged lines that only repeat prompt instructions. */
export function stripPromptEchoLines(answer: string): string {
  return answer
    .split('\n')
    .filter((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/i)
      if (!match) return true
      return !isPromptInstructionEcho(match[2])
    })
    .join('\n')
}

/** Language-agnostic check that tagged analysis lines exist and are not prompt echoes. */
export function hasTranslatableTaggedOutput(answer: string): boolean {
  for (const line of answer.split('\n')) {
    const match = line.match(/^(MAIN|HOME|AWAY|REASON[123]):\s*(.+)$/i)
    if (!match) continue
    const value = match[2].trim()
    if (value.length >= 20 && !isPromptInstructionEcho(value)) return true
  }
  return false
}

export function hasSubstantiveMotivation(answer: string, matchTitle?: string): boolean {
  return hasSubstantiveAnalysis(answer, matchTitle)
}

export function parseTeamSides(matchTitle: string): { home: string; away: string } | null {
  const m = matchTitle.match(/^(.+?)\s+(?:vs\.?|v\.?|–|—|-)\s+(.+)$/i)
  if (!m) return null
  return { home: m[1].trim(), away: m[2].trim() }
}

export function teamSideHints(matchTitle: string): string | null {
  const sides = parseTeamSides(matchTitle)
  if (!sides) return null
  return `Team 1 = ${sides.home} (home). Team 2 = ${sides.away} (away). Use exact outcome labels from the list.`
}

function extractTaggedLines(answer: string, tag: string): string[] {
  const re = new RegExp(`^${tag}:\\s*(.+)$`, 'gim')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(answer)) !== null) {
    const v = m[1].trim()
    if (v && !/^none$/i.test(v)) out.push(v)
  }
  return out
}

function findCatalogMentions(answer: string, catalog: OutcomeOption[]): OutcomeOption[] {
  const lower = answer.toLowerCase()
  const found: OutcomeOption[] = []
  const seen = new Set<string>()
  const sorted = [...catalog].sort((a, b) => b.outcomeTitle.length - a.outcomeTitle.length)
  for (const entry of sorted) {
    const title = entry.outcomeTitle
    if (title.length < 2) continue
    const key = `${entry.conditionId}:${entry.outcomeId}`
    if (seen.has(key)) continue
    if (lower.includes(title.toLowerCase())) {
      found.push(entry)
      seen.add(key)
    }
  }
  return found
}

function inferFromTeamNames(
  answer: string,
  catalog: OutcomeOption[],
  matchTitle?: string
): OutcomeOption[] {
  if (!matchTitle) return []
  const sides = parseTeamSides(matchTitle)
  if (!sides) return []

  const lower = answer.toLowerCase()
  const homeHit = lower.includes(sides.home.toLowerCase())
  const awayHit = lower.includes(sides.away.toLowerCase())
  if (!homeHit && !awayHit) return []

  const resultMarket = catalog.filter((c) => /match result|winner|1x2|full time/i.test(c.conditionTitle))
  const pool = resultMarket.length > 0 ? resultMarket : catalog
  const out: OutcomeOption[] = []

  if (homeHit) {
    const home =
      pool.find((c) => /^(team 1|1|home)$/i.test(c.outcomeTitle.trim())) ??
      pool.find((c) => norm(c.outcomeTitle) === norm(sides.home))
    if (home) out.push(home)
  }
  if (awayHit) {
    const away =
      pool.find((c) => /^(team 2|2|away)$/i.test(c.outcomeTitle.trim())) ??
      pool.find((c) => norm(c.outcomeTitle) === norm(sides.away))
    if (away) out.push(away)
  }
  return out
}

/** Map model labels like "Argentina" to catalog entries like "Team 1". */
function resolveOutcomeLabel(
  label: string,
  marketTitle: string | null,
  catalog: OutcomeOption[],
  matchTitle?: string
): OutcomeOption | null {
  const direct = matchOutcomeLabel(label, marketTitle, catalog)
  if (direct) return direct
  if (!matchTitle) return null

  const sides = parseTeamSides(matchTitle)
  if (!sides) return null

  let pool = catalog
  if (marketTitle) {
    const mnorm = norm(marketTitle)
    const inMarket = catalog.filter((c) => norm(c.conditionTitle) === mnorm)
    if (inMarket.length > 0) pool = inMarket
  } else {
    const resultMarket = catalog.filter((c) =>
      /match result|winner|1x2|full time/i.test(c.conditionTitle)
    )
    if (resultMarket.length > 0) pool = resultMarket
  }

  const want = norm(label)
  const homeSynonyms = new Set([norm(sides.home), 'home', '1', 'team 1'])
  const awaySynonyms = new Set([norm(sides.away), 'away', '2', 'team 2'])

  if (homeSynonyms.has(want)) {
    return (
      pool.find((c) => /^(team 1|1|home)$/i.test(c.outcomeTitle.trim())) ??
      pool.find((c) => norm(c.outcomeTitle) === norm(sides.home)) ??
      null
    )
  }
  if (awaySynonyms.has(want)) {
    return (
      pool.find((c) => /^(team 2|2|away)$/i.test(c.outcomeTitle.trim())) ??
      pool.find((c) => norm(c.outcomeTitle) === norm(sides.away)) ??
      null
    )
  }
  return null
}

/** Exact match only — "Team 1" must not match "NG & Team 1". */
export function matchOutcomeLabel(
  label: string,
  marketTitle: string | null,
  catalog: OutcomeOption[]
): OutcomeOption | null {
  const want = norm(label)
  if (!want) return null

  let pool = catalog
  if (marketTitle) {
    const mnorm = norm(marketTitle)
    const inMarket = catalog.filter((c) => norm(c.conditionTitle) === mnorm)
    if (inMarket.length > 0) pool = inMarket
  }

  const exact = pool.filter((c) => norm(c.outcomeTitle) === want)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    return exact.sort((a, b) => b.decimalOdds - a.decimalOdds)[0]
  }

  return null
}

/**
 * Pull structured picks from the model answer (PICK / MARKET / ALT2 / ALT3 lines)
 * and map them to real catalog entries.
 */
export function parsePickSuggestions(
  answer: string,
  catalog: OutcomeOption[],
  matchTitle?: string
): MatchPickSuggestion[] {
  const clean = sanitizeModelAnswer(answer)
  const picks: Array<{ rank: 1 | 2 | 3; label: string; market: string | null; reason: string | null }> = []

  const pick1 = extractTaggedLine(clean, 'PICK') ?? extractTaggedLines(clean, 'PICK')[0]
  const market1 = extractTaggedLine(clean, 'MARKET') ?? extractTaggedLines(clean, 'MARKET')[0]
  const reason1 = extractTaggedLine(clean, 'REASON1') ?? extractTaggedLine(clean, 'REASON')
  if (pick1 && !isGarbageModelOutput(pick1)) {
    picks.push({ rank: 1, label: pick1, market: market1, reason: reason1 })
  }

  const alt2 = extractTaggedLine(clean, 'ALT2') ?? extractTaggedLines(clean, 'ALT2')[0]
  const market2 = extractTaggedLine(clean, 'MARKET2') ?? extractTaggedLines(clean, 'MARKET2')[0]
  const reason2 = extractTaggedLine(clean, 'REASON2')
  if (alt2 && !/^none$/i.test(alt2) && !isGarbageModelOutput(alt2)) {
    picks.push({ rank: 2, label: alt2, market: market2 ?? market1, reason: reason2 })
  }

  const alt3 = extractTaggedLine(clean, 'ALT3') ?? extractTaggedLines(clean, 'ALT3')[0]
  const market3 = extractTaggedLine(clean, 'MARKET3') ?? extractTaggedLines(clean, 'MARKET3')[0]
  const reason3 = extractTaggedLine(clean, 'REASON3')
  if (alt3 && !/^none$/i.test(alt3) && !isGarbageModelOutput(alt3)) {
    picks.push({ rank: 3, label: alt3, market: market3 ?? market1, reason: reason3 })
  }

  const seen = new Set<string>()
  const suggestions: MatchPickSuggestion[] = []

  for (const p of picks) {
    const matched = resolveOutcomeLabel(p.label, p.market, catalog, matchTitle)
    if (!matched) continue
    const key = `${matched.conditionId}:${matched.outcomeId}`
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push({
      ...matched,
      rank: p.rank,
      reason: p.reason && isUsableReason(p.reason, matchTitle) ? p.reason : null,
    })
  }

  if (suggestions.length === 0) {
    const mentioned = findCatalogMentions(clean, catalog)
    let rank = 1
    for (const entry of mentioned) {
      if (rank > 3) break
      const key = `${entry.conditionId}:${entry.outcomeId}`
      if (seen.has(key)) continue
      seen.add(key)
      suggestions.push({ ...entry, rank: rank as 1 | 2 | 3, reason: reason1 ?? null })
      rank++
    }
  }

  if (suggestions.length === 0) {
    const inferred = inferFromTeamNames(clean, catalog, matchTitle)
    let rank = 1
    for (const entry of inferred) {
      if (rank > 3) break
      const key = `${entry.conditionId}:${entry.outcomeId}`
      if (seen.has(key)) continue
      seen.add(key)
      suggestions.push({ ...entry, rank: rank as 1 | 2 | 3, reason: null })
      rank++
    }
  }

  return fillDiversePickSuggestions(suggestions, catalog, matchTitle)
}

export function formatOutcomeCatalogForPrompt(
  markets: MatchMarketInput[],
  maxOutcomesPerMarket = 8
): string {
  return markets
    .map((m) => {
      const lines = m.outcomes.slice(0, maxOutcomesPerMarket).map(
        (o) => `  - "${o.title}" @ ${o.decimalOdds.toFixed(2)}x`
      )
      return `Market: "${m.conditionTitle}"\n${lines.join('\n')}`
    })
    .join('\n\n')
}

/** Pick markets from different buckets so alts can span result / totals / BTTS etc. */
export function pickDiverseMarketsForAi(
  markets: MatchMarketInput[],
  maxMarkets = 4
): MatchMarketInput[] {
  const buckets: Array<{ test: RegExp; pick: MatchMarketInput | null }> = [
    { test: /match result|winner|1x2|full time/i, pick: null },
    { test: /total|over|under|goals|asian/i, pick: null },
    { test: /both teams|btts|ng &|to score/i, pick: null },
    { test: /double chance|handicap|draw no bet/i, pick: null },
  ]

  const rest: MatchMarketInput[] = []
  for (const market of markets) {
    let placed = false
    for (const bucket of buckets) {
      if (bucket.pick || !bucket.test.test(market.conditionTitle)) continue
      bucket.pick = { ...market, outcomes: market.outcomes.slice(0, 4) }
      placed = true
      break
    }
    if (!placed) rest.push(market)
  }

  const picked: MatchMarketInput[] = []
  for (const bucket of buckets) {
    if (bucket.pick) picked.push(bucket.pick)
  }
  for (const market of rest) {
    if (picked.length >= maxMarkets) break
    if (picked.some((m) => m.conditionId === market.conditionId)) continue
    picked.push({ ...market, outcomes: market.outcomes.slice(0, 4) })
  }

  if (picked.length === 0) {
    return pickPrimaryMarketsForAi(markets, maxMarkets)
  }
  return picked.slice(0, maxMarkets)
}

export function buildSmartFallbackPicks(
  catalog: OutcomeOption[],
  matchTitle?: string
): MatchPickSuggestion[] {
  if (catalog.length === 0) return []

  const resultPool = catalog.filter((c) =>
    /match result|winner|1x2|full time/i.test(c.conditionTitle)
  )
  const mainPool = resultPool.length > 0 ? resultPool : catalog
  const nonDraw = mainPool.filter((c) => !/^(draw|x|tie)$/i.test(c.outcomeTitle.trim()))
  const favorites = [...(nonDraw.length > 0 ? nonDraw : mainPool)].sort(
    (a, b) => a.decimalOdds - b.decimalOdds
  )

  const out: MatchPickSuggestion[] = []
  const usedOutcomes = new Set<string>()
  const usedMarkets = new Set<string>()

  const push = (entry: OutcomeOption, rank: 1 | 2 | 3) => {
    const key = `${entry.conditionId}:${entry.outcomeId}`
    if (usedOutcomes.has(key)) return
    out.push({ ...entry, rank, reason: null })
    usedOutcomes.add(key)
    usedMarkets.add(entry.conditionId)
  }

  if (favorites[0]) push(favorites[0], 1)

  const altBuckets = [/total|over|under|goals/i, /both teams|btts|ng/i, /double chance|handicap/i]
  let rank = 2 as 2 | 3
  for (const re of altBuckets) {
    if (out.length >= 3) break
    const candidate = catalog.find(
      (c) =>
        re.test(c.conditionTitle) &&
        !usedOutcomes.has(`${c.conditionId}:${c.outcomeId}`) &&
        !usedMarkets.has(c.conditionId)
    )
    if (candidate) {
      push(candidate, rank)
      rank = 3
    }
  }

  for (const entry of favorites.slice(1)) {
    if (out.length >= 3) break
    if (usedMarkets.has(entry.conditionId) && out.length > 0) continue
    push(entry, (out.length + 1) as 1 | 2 | 3)
  }

  for (const entry of catalog) {
    if (out.length >= 3) break
    if (usedOutcomes.has(`${entry.conditionId}:${entry.outcomeId}`)) continue
    if (usedMarkets.has(entry.conditionId) && out.length > 0) continue
    push(entry, (out.length + 1) as 1 | 2 | 3)
  }

  return out.slice(0, 3).map((pick, index) => ({
    ...pick,
    rank: (index + 1) as 1 | 2 | 3,
  }))
}

export function fillDiversePickSuggestions(
  suggestions: MatchPickSuggestion[],
  catalog: OutcomeOption[],
  matchTitle?: string,
  maxPicks = 3
): MatchPickSuggestion[] {
  const out: MatchPickSuggestion[] = []
  const usedOutcomes = new Set<string>()
  const usedMarkets = new Set<string>()

  for (const suggestion of [...suggestions].sort((a, b) => a.rank - b.rank)) {
    const key = `${suggestion.conditionId}:${suggestion.outcomeId}`
    if (usedOutcomes.has(key)) continue
    if (usedMarkets.has(suggestion.conditionId) && out.length > 0) continue
    out.push(suggestion)
    usedOutcomes.add(key)
    usedMarkets.add(suggestion.conditionId)
  }

  if (out.length === 0) {
    return buildSmartFallbackPicks(catalog, matchTitle)
  }

  if (out.length < maxPicks) {
    for (const candidate of buildSmartFallbackPicks(catalog, matchTitle)) {
      if (out.length >= maxPicks) break
      const key = `${candidate.conditionId}:${candidate.outcomeId}`
      if (usedOutcomes.has(key) || usedMarkets.has(candidate.conditionId)) continue
      out.push({ ...candidate, rank: (out.length + 1) as 1 | 2 | 3 })
      usedOutcomes.add(key)
      usedMarkets.add(candidate.conditionId)
    }
  }

  return out.slice(0, maxPicks).map((pick, index) => ({
    ...pick,
    rank: (index + 1) as 1 | 2 | 3,
  }))
}

/** Primary match-winner style markets first — keeps synthesis prompts small. */
export function pickPrimaryMarketsForAi(
  markets: MatchMarketInput[],
  maxMarkets = 2
): MatchMarketInput[] {
  const preferred = [
    /^match result$/i,
    /^winner$/i,
    /full time result/i,
    /^1x2$/i,
    /match winner/i,
  ]
  const deprioritize = [/1st half/i, /2nd half/i, /corner/i, /card/i, /asian total/i]

  const sorted = [...markets].sort((left, right) => {
    const leftScore = preferred.findIndex((re) => re.test(left.conditionTitle))
    const rightScore = preferred.findIndex((re) => re.test(right.conditionTitle))
    const leftRank = leftScore >= 0 ? leftScore : 99
    const rightRank = rightScore >= 0 ? rightScore : 99
    if (leftRank !== rightRank) return leftRank - rightRank

    const leftBad = deprioritize.some((re) => re.test(left.conditionTitle)) ? 1 : 0
    const rightBad = deprioritize.some((re) => re.test(right.conditionTitle)) ? 1 : 0
    if (leftBad !== rightBad) return leftBad - rightBad

    return left.conditionTitle.localeCompare(right.conditionTitle)
  })

  return sorted.slice(0, maxMarkets).map((m) => ({
    ...m,
    outcomes: m.outcomes.slice(0, 5),
  }))
}

export function formatOutcomeCatalogCompact(markets: MatchMarketInput[]): string {
  return markets
    .map((m) => {
      const outs = m.outcomes.map((o) => `"${o.title}" ${o.decimalOdds.toFixed(2)}x`).join(' | ')
      return `${m.conditionTitle}: ${outs}`
    })
    .join('\n')
}

export const OUTCOME_NAMING_RULES = [
  'Outcome labels are EXACT bookmaker strings — copy them character-for-character.',
  '"Team 1" / "1" = home wins the market (e.g. Match Result).',
  '"NG & Team 1" = BOTH teams score AND home wins — completely different from "Team 1".',
  '"Draw" / "X" is not "Team 1". Combined markets (NG&, Over&, etc.) are separate bets.',
  'Never shorten a label: if the list says "NG & Team 1", do not answer "Team 1".',
].join('\n')
