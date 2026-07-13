import { loadModel, translate, unloadModel } from '@qvac/sdk'
import { unloadQvacModel } from '@/services/qvac/qvac-client'
import {
  getTranslationModelEntry,
  isTranslationModelInstalled,
  requiresTranslationModel,
} from '@/services/qvac/qvac-translation-models'
import type { QvacOutputLanguage } from '@/services/qvac/qvac-settings'
import {
  extractTranslatableAnalysis,
  formatTranslatableAnalysis,
  hasTranslatableContent,
  isPromptInstructionEcho,
  sanitizeModelAnswer,
  stripPromptEchoLines,
} from '@/services/qvac/match-outcomes'

const TRANSLATABLE_TAGS = new Set([
  'MAIN',
  'HOME',
  'AWAY',
  'HOME_FORM',
  'AWAY_FORM',
  'REASON1',
  'REASON2',
  'REASON3',
])

let translationModelId: string | null = null
let loadedTranslationLang: QvacOutputLanguage | null = null

async function ensureTranslationModel(language: Exclude<QvacOutputLanguage, 'en'>): Promise<string> {
  const entry = getTranslationModelEntry(language)
  if (!entry) {
    throw new Error(`Translation to ${language} is not supported on-device yet.`)
  }
  if (!(await isTranslationModelInstalled(language))) {
    throw new Error(`Download the ${entry.label} model in Settings → Translator first.`)
  }

  if (translationModelId && loadedTranslationLang === language) {
    return translationModelId
  }

  if (translationModelId) {
    await unloadTranslationModel()
  }

  await unloadQvacModel()

  translationModelId = await loadModel({
    modelSrc: entry,
    modelConfig: {
      engine: 'Bergamot',
      from: 'en',
      to: language,
      beamsize: 1,
      normalize: 1,
      temperature: 0.2,
      norepeatngramsize: 3,
      lengthpenalty: 1.1,
    },
  })
  loadedTranslationLang = language
  return translationModelId
}

export async function unloadTranslationModel() {
  if (!translationModelId) return
  try {
    await unloadModel({ modelId: translationModelId })
  } finally {
    translationModelId = null
    loadedTranslationLang = null
  }
}

export async function translateText(
  text: string,
  language: QvacOutputLanguage,
  signal?: AbortSignal
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed || language === 'en') return trimmed
  if (isPromptInstructionEcho(trimmed)) return trimmed
  if (!requiresTranslationModel(language)) return trimmed
  if (signal?.aborted) throw new Error('Translation aborted')

  const modelId = await ensureTranslationModel(language)
  const result = translate({
    modelId,
    text: trimmed,
    modelType: 'nmtcpp-translation',
    stream: false,
  })
  const translated = (await result.text).trim()
  if (!translated || isPromptInstructionEcho(translated)) return trimmed
  return translated
}

export type TranslateScoutOptions = {
  matchTitle?: string
  picksSuffix?: string
}

function buildTranslationSource(answer: string, matchTitle?: string): string {
  const clean = stripPromptEchoLines(sanitizeModelAnswer(answer))
  const extracted = extractTranslatableAnalysis(clean, matchTitle)
  if (hasTranslatableContent(extracted)) {
    return formatTranslatableAnalysis(extracted)
  }
  return clean
    .split('\n')
    .filter((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/i)
      if (!match) return false
      const tag = match[1].toUpperCase()
      if (!TRANSLATABLE_TAGS.has(tag)) return false
      return !isPromptInstructionEcho(match[2])
    })
    .join('\n')
}

function appendSuffix(body: string, picksSuffix?: string): string {
  const trimmedBody = body.trim()
  const trimmedSuffix = picksSuffix?.trim()
  if (!trimmedBody) return trimmedSuffix ?? ''
  if (!trimmedSuffix) return trimmedBody
  return `${trimmedBody}\n${trimmedSuffix}`
}

export async function translateScoutAnswer(
  answer: string,
  language: QvacOutputLanguage,
  signal?: AbortSignal,
  options?: TranslateScoutOptions
): Promise<string> {
  let result = ''
  for await (const partial of streamTranslateScoutAnswer(answer, language, signal, options)) {
    result = partial
  }
  return result
}

/** Translate parsed scout prose; keeps PICK/MARKET lines unchanged. */
export async function* streamTranslateScoutAnswer(
  answer: string,
  language: QvacOutputLanguage,
  signal?: AbortSignal,
  options?: TranslateScoutOptions
): AsyncGenerator<string, string> {
  const picksSuffix = options?.picksSuffix?.trim()
  if (language === 'en') {
    const unchanged = appendSuffix(answer, picksSuffix)
    yield unchanged
    return unchanged
  }

  const source = buildTranslationSource(answer, options?.matchTitle)
  if (!source.trim()) {
    const unchanged = appendSuffix(stripPromptEchoLines(sanitizeModelAnswer(answer)), picksSuffix)
    yield unchanged
    return unchanged
  }

  const lines = source.split('\n')
  const out: string[] = []

  for (const line of lines) {
    if (signal?.aborted) throw new Error('Translation aborted')
    const match = line.match(/^([A-Z][A-Z0-9_]*):\s*(.*)$/i)
    if (!match) continue

    const tag = match[1].toUpperCase()
    const value = match[2].trim()
    if (!TRANSLATABLE_TAGS.has(tag) || !value || isPromptInstructionEcho(value)) continue

    const translated = await translateText(value, language, signal)
    out.push(`${tag}: ${translated}`)
    yield appendSuffix(out.join('\n'), picksSuffix)
  }

  const joined = appendSuffix(out.join('\n'), picksSuffix)
  return joined
}
