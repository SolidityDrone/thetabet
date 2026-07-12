import { completeOnce } from '@/services/qvac/qvac-client'
import { buildTipsterHintsPrompt } from '@/services/tipster-notes/storage'
import type { MatchHintContext } from '@/services/tipster-notes/types'

export type ParsedAskCommand = {
  question: string
  gameId?: string
  useResearch: boolean
}

export function parseAskCommand(text: string): ParsedAskCommand | null {
  const trimmed = text.trim()
  if (!/^\/ask\b/i.test(trimmed)) return null

  let rest = trimmed.replace(/^\/ask\b/i, '').trim()
  const useResearch = /^--research\b/i.test(rest)
  if (useResearch) rest = rest.replace(/^--research\b/i, '').trim()

  if (!rest) return null

  const idMatch = rest.match(/^(\d{4,})\s+(.+)$/s)
  if (idMatch) {
    return { gameId: idMatch[1], question: idMatch[2].trim(), useResearch }
  }

  return { question: rest, useResearch }
}

export async function runTipsterAsk(
  ownerId: string,
  question: string,
  context: MatchHintContext = {}
): Promise<string> {
  const hints = await buildTipsterHintsPrompt(ownerId, context)
  const matchLine = context.matchTitle ? `Match: ${context.matchTitle}` : ''
  const leagueLine = context.league ? `League: ${context.league}` : ''
  const gameLine = context.gameId ? `Game id: ${context.gameId}` : ''

  const prompt = [
    'You are a concise football betting assistant for a tipster app.',
    hints ||
      '(No tipster notes on file — answer from general knowledge and say when notes are missing.)',
    '',
    'Rules:',
    '- Tipster convictions outrank everything else when present.',
    '- Answer the question directly in 2–5 sentences.',
    '- No URLs, no thinking tags, no markdown.',
    matchLine,
    leagueLine,
    gameLine,
    '',
    `Question: ${question}`,
    '',
    'Answer:',
  ]
    .filter(Boolean)
    .join('\n')

  const answer = await completeOnce(prompt, {
    maxTokens: 180,
    temperature: 0.35,
  })

  return answer.trim() || 'No answer — add tipster notes in Profile or on a match page.'
}
