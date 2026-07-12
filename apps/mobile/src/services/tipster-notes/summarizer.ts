import { completeOnce } from '@/services/qvac/qvac-client'
import { setMatchHintSummary, setNoteSummary } from '@/services/tipster-notes/storage'
import type { TipsterHintLayer, TipsterHintLine, TipsterHintWeight } from '@/services/tipster-notes/types'

export type SummarizeTarget =
  | { kind: 'thesis' }
  | { kind: 'league'; key: string; label: string }
  | { kind: 'team'; key: string; label: string }
  | { kind: 'match'; key: string; label: string }

const LAYER_FOR_TARGET: Record<SummarizeTarget['kind'], TipsterHintLayer> = {
  thesis: 'thesis',
  league: 'league',
  team: 'team',
  match: 'match',
}

function parseHintLines(raw: string, defaultLayer: TipsterHintLayer, scope?: string): TipsterHintLine[] {
  const lines: TipsterHintLine[] = []
  for (const row of raw.split('\n')) {
    const trimmed = row.trim()
    if (!trimmed) continue

    const tagged = trimmed.match(/^\[([A-Z]+):(HIGH|MED|LOW)\]\s*(.*)$/i)
    if (tagged) {
      const layer = tagged[1].toLowerCase() as TipsterHintLayer
      const weight = tagged[2].toLowerCase() as TipsterHintWeight
      const text = tagged[3].trim()
      if (text) {
        lines.push({
          layer: ['thesis', 'league', 'team', 'match'].includes(layer) ? layer : defaultLayer,
          weight: weight === 'med' || weight === 'low' ? weight : 'high',
          text,
          scope,
        })
      }
      continue
    }

    if (trimmed.startsWith('- ')) {
      lines.push({
        layer: defaultLayer,
        weight: 'high',
        text: trimmed.slice(2).trim(),
        scope,
      })
    }
  }
  return lines.slice(0, 12)
}

function buildSummarizePrompt(raw: string, target: SummarizeTarget): string {
  const scope =
    target.kind === 'thesis'
      ? 'global betting worldview'
      : target.kind === 'league'
        ? `league: ${target.label}`
        : target.kind === 'team'
          ? `team: ${target.label}`
          : `match: ${target.label}`

  return [
    'You compress a tipster\'s raw notes into weighted hint lines for a betting AI.',
    'Output ONLY hint lines, one per line, no prose.',
    'Format exactly: [LAYER:WEIGHT] short conviction',
    'LAYER = THESIS | LEAGUE | TEAM | MATCH',
    'WEIGHT = HIGH | MED | LOW (use HIGH for strong recurring opinions)',
    `Scope: ${scope}`,
    '',
    'Raw notes:',
    raw.trim(),
    '',
    'Example lines:',
    '[THESIS:HIGH] Serie A fixtures lean overs — open games common',
    '[TEAM:HIGH] Roma often hits over 1.5 goals',
    '',
    'Now output hints:',
  ].join('\n')
}

export async function summarizeTipsterNote(
  ownerId: string,
  target: SummarizeTarget,
  raw: string
): Promise<TipsterHintLine[]> {
  const trimmed = raw.trim()
  if (!trimmed) {
    await setNoteSummary(ownerId, target, [])
    return []
  }

  const scope =
    target.kind === 'league' || target.kind === 'team' || target.kind === 'match'
      ? target.label
      : undefined

  let summary: TipsterHintLine[] = []
  try {
    const out = await completeOnce(buildSummarizePrompt(trimmed, target), {
      maxTokens: 220,
      temperature: 0.2,
      assistantPrefix: '[',
    })
    const combined = `[${out.trim()}`
    summary = parseHintLines(combined, LAYER_FOR_TARGET[target.kind], scope)
  } catch {
    summary = []
  }

  if (!summary.length) {
    summary = [
      {
        layer: LAYER_FOR_TARGET[target.kind],
        weight: 'high',
        text: trimmed.slice(0, 240),
        scope,
      },
    ]
  }

  await setNoteSummary(ownerId, target, summary)
  return summary
}

export async function summarizeMatchHint(
  ownerId: string,
  gameId: string,
  hintId: string,
  raw: string,
  matchTitle: string
): Promise<TipsterHintLine[]> {
  const trimmed = raw.trim()
  if (!trimmed) {
    await setMatchHintSummary(ownerId, gameId, hintId, [])
    return []
  }

  const target: SummarizeTarget = { kind: 'match', key: gameId, label: matchTitle }
  let summary: TipsterHintLine[] = []
  try {
    const out = await completeOnce(buildSummarizePrompt(trimmed, target), {
      maxTokens: 220,
      temperature: 0.2,
      assistantPrefix: '[',
    })
    const combined = `[${out.trim()}`
    summary = parseHintLines(combined, 'match', matchTitle)
  } catch {
    summary = []
  }

  if (!summary.length) {
    summary = [
      {
        layer: 'match',
        weight: 'high',
        text: trimmed.slice(0, 240),
        scope: matchTitle,
      },
    ]
  }

  await setMatchHintSummary(ownerId, gameId, hintId, summary)
  return summary
}
