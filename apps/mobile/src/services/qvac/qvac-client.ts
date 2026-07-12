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

export const QVAC_INFERENCE_MODE = 'cpu-only' as const

const LOAD_MODEL_TIMEOUT_MS = 240_000
const FIRST_TOKEN_TIMEOUT_MS = 180_000
const STREAM_IDLE_TIMEOUT_MS = 120_000

function timeoutError(label: string, timeoutMs: number) {
  const sec = Math.round(timeoutMs / 1000)
  return new Error(`${label} timed out after ${sec}s. Force-close the app, reload Metro, and try again.`)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function nextEventWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
  label: string
): Promise<IteratorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      iterator.next(),
      new Promise<IteratorResult<T>>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** CPU-only llamacpp config — never use GPU/Vulkan on Android (crashes on many devices). */
export function buildCpuModelConfig(ctxSize: number) {
  return {
    ctx_size: ctxSize,
    verbosity: VERBOSITY.ERROR,
    // Force CPU-only — Vulkan half-initializes on many Android GPUs and segfaults.
    device: 'cpu',
    gpu_layers: 0,
    'split-mode': 'none' as const,
    'main-gpu': 0,
  }
}

let modelId: string | null = null
let loadedPreset: QvacModelPreset | null = null
let loadedCtxSize: number | null = null
let activeRequestId: string | null = null

async function ensureModelLoaded(preset: QvacModelPreset, ctxSize: number) {
  const entry = getQvacModelRegistry(preset)
  if (!(await isQvacModelMarkedInstalled(preset))) {
    throw new Error(
      `${entry.label} is not downloaded yet. Open Settings → Local AI and tap Download first.`
    )
  }

  if (modelId && loadedPreset === preset && loadedCtxSize === ctxSize) return modelId
  if (modelId) {
    await unloadQvacModel()
  }

  try {
    modelId = await withTimeout(
      loadModel({
        modelSrc: entry.src,
        modelType: 'llm',
        modelConfig: buildCpuModelConfig(ctxSize),
      }),
      LOAD_MODEL_TIMEOUT_MS,
      'Model load'
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.toLowerCase().includes('no plugin') || msg.toLowerCase().includes('not supported')) {
      throw new Error(
        'QVAC inference engine is not loaded. Re-run `npm run bundle:qvac` to build the full AI worker bundle, then restart the app.'
      )
    }
    if (msg.includes('ADDON_NOT_FOUND') && msg.includes('llm-llamacpp')) {
      throw new Error(
        'LLM native addon failed to load. Re-run `npm run bundle:qvac && npm run link:bare`, rebuild the debug APK, reinstall, force-close the app, then reopen.'
      )
    }
    if (msg.includes('QVAC worker bundle changed')) {
      throw error instanceof Error ? error : new Error(msg)
    }
    throw error
  }
  loadedPreset = preset
  loadedCtxSize = ctxSize
  return modelId
}

export async function ensureModelReady(): Promise<string> {
  const settings = await loadQvacSettings()
  return ensureModelLoaded(settings.modelPreset, settings.ctxSize)
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
      loadedCtxSize = null
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

export type CompletionOpts = {
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  /** Pre-filled assistant text — forces continuation instead of chat greetings. */
  assistantPrefix?: string
}

function completionErrorMessage(event: {
  stopReason?: string
  error?: { message?: string }
}): string | null {
  if (event.stopReason === 'error' && event.error?.message) {
    return event.error.message
  }
  return null
}

export async function* streamCompletion(
  prompt: string,
  opts: CompletionOpts = {}
): AsyncGenerator<string> {
  const loadedModelId = await ensureModelReady()

  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: prompt },
  ]
  if (opts.assistantPrefix) {
    history.push({ role: 'assistant', content: opts.assistantPrefix })
  }

  const run = completion({
    modelId: loadedModelId,
    history,
    stream: true,
    generationParams: {
      temp: opts.temperature ?? 0.4,
      predict: opts.maxTokens ?? 320,
    },
  })

  activeRequestId = run.requestId

  try {
    if (opts.assistantPrefix) {
      yield opts.assistantPrefix
    }
    const iterator = run.events[Symbol.asyncIterator]()
    let gotContent = false
    while (true) {
      const timeoutMs = gotContent ? STREAM_IDLE_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS
      const label = gotContent ? 'Inference stream' : 'Model first token'
      const { done, value: event } = await nextEventWithTimeout(iterator, timeoutMs, label)
      if (done) break
      if (opts.signal?.aborted) {
        await cancelQvacInference(run.requestId)
        return
      }
      if (event.type === 'completionDone') {
        const err = completionErrorMessage(event)
        if (err) throw new Error(err)
      }
      if (event.type === 'contentDelta' && event.text) {
        gotContent = true
        yield event.text
      }
    }
  } finally {
    if (activeRequestId === run.requestId) {
      activeRequestId = null
    }
  }
}

export async function completeOnce(prompt: string, opts: CompletionOpts = {}): Promise<string> {
  let out = ''
  for await (const chunk of streamCompletion(prompt, opts)) {
    out += chunk
  }
  return out
}
