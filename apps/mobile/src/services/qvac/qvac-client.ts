import {
  cancel,
  completion,
  loadModel,
  unloadModel,
  VERBOSITY,
} from '@qvac/sdk'
import {
  getQvacModelRegistry,
  isQvacModelMarkedInstalled,
} from '@/services/qvac/qvac-model-manager'
import { loadQvacSettings, type QvacModelPreset } from '@/services/qvac/qvac-settings'

const MAX_MARKETS = 8
const MAX_OUTCOMES_PER_MARKET = 6
const MAX_SOURCES = 3
const MAX_SOURCE_CHARS = 500
const MAX_OUTPUT_TOKENS = 420

let modelId: string | null = null
let loadedPreset: QvacModelPreset | null = null
let activeRequestId: string | null = null

async function ensureModelLoaded(preset: QvacModelPreset, ctxSize: number) {
  const entry = getQvacModelRegistry(preset)
  if (!(await isQvacModelMarkedInstalled(preset))) {
    throw new Error(
      `${entry.label} is not downloaded yet. Open Settings → Local AI and tap Download first.`
    )
  }

  if (modelId && loadedPreset === preset) return modelId
  if (modelId) {
    await unloadQvacModel()
  }

  try {
    modelId = await loadModel({
      modelSrc: entry.src,
      modelType: 'llm',
      modelConfig: {
        ctx_size: ctxSize,
        verbosity: VERBOSITY.ERROR,
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.toLowerCase().includes('no plugin') || msg.toLowerCase().includes('not supported')) {
      throw new Error(
        'QVAC inference engine is not loaded. Re-run `npm run bundle:qvac` to build the full AI worker bundle, then restart the app.'
      )
    }
    throw error
  }
  loadedPreset = preset
  return modelId
}

export async function unloadQvacModel() {
  if (activeRequestId) {
    try {
      await cancel({ requestId: activeRequestId })
    } catch {
      // Best-effort cancel before unload.
    } finally {
      activeRequestId = null
    }
  }

  if (modelId) {
    try {
      await unloadModel({ modelId })
    } finally {
      modelId = null
      loadedPreset = null
    }
  }
}

export async function cancelQvacInference(requestId?: string | null) {
  const target = requestId ?? activeRequestId
  if (!target) return
  await cancel({ requestId: target })
  if (activeRequestId === target) {
    activeRequestId = null
  }
}

export type MatchResearchInput = {
  matchTitle: string
  startsAt?: string | null
  league?: string | null
  markets: Array<{
    conditionTitle: string
    outcomes: Array<{ title: string; decimalOdds: number }>
  }>
  sources: Array<{ title: string; url: string; text: string }>
}

function buildPrompt(input: MatchResearchInput): string {
  const marketText = input.markets
    .slice(0, MAX_MARKETS)
    .map((m) => {
      const outcomes = m.outcomes
        .slice(0, MAX_OUTCOMES_PER_MARKET)
        .map((o) => `- ${o.title} (${o.decimalOdds.toFixed(2)}x)`)
        .join('\n')
      return `Market: ${m.conditionTitle}\n${outcomes}`
    })
    .join('\n\n')

  const sourcesText = input.sources
    .slice(0, MAX_SOURCES)
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}\n${s.text.slice(0, MAX_SOURCE_CHARS).trim()}`
    )
    .join('\n\n')

  return [
    'You are ThetaBet Match Analyst. Give one strong betting tip for this match.',
    `Match: ${input.matchTitle}`,
    input.league ? `League: ${input.league}` : '',
    input.startsAt ? `Kickoff: ${input.startsAt}` : '',
    '',
    'Pick only from these outcomes:',
    marketText || '(no markets)',
    '',
    'Research notes:',
    sourcesText || '(no web sources)',
    '',
    'Reply briefly:',
    '1) Best pick (exact outcome label)',
    '2) Why (3 short bullets, cite [1]/[2])',
    '3) Risk (1-2 bullets)',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function* streamMatchTip(
  input: MatchResearchInput,
  options?: { signal?: AbortSignal }
): AsyncGenerator<string> {
  const settings = await loadQvacSettings()
  const loadedModelId = await ensureModelLoaded(settings.modelPreset, settings.ctxSize)
  const prompt = buildPrompt(input)

  const run = completion({
    modelId: loadedModelId,
    history: [{ role: 'user', content: prompt }],
    stream: true,
    generationParams: {
      temp: 0.4,
      predict: MAX_OUTPUT_TOKENS,
    },
  })

  activeRequestId = run.requestId

  try {
    for await (const event of run.events) {
      if (options?.signal?.aborted) {
        await cancelQvacInference(run.requestId)
        return
      }
      if (event.type === 'contentDelta' && event.text) {
        yield event.text
      }
    }
  } finally {
    if (activeRequestId === run.requestId) {
      activeRequestId = null
    }
  }
}
