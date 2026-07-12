import { loadModel, transcribe, unloadModel } from '@qvac/sdk'
import { getSttModelRef, isSttModelInstalled } from '@/services/qvac/qvac-stt-models'

let whisperModelId: string | null = null

async function ensureWhisperReady(): Promise<string> {
  if (!(await isSttModelInstalled())) {
    throw new Error(
      'Speech model not downloaded. Open Settings → Local AI and download Speech-to-text first.'
    )
  }
  if (whisperModelId) return whisperModelId

  const model = getSttModelRef()
  try {
    whisperModelId = await loadModel({
      modelSrc: model.src,
      modelType: 'whispercpp-transcription',
      modelConfig: {
        language: 'en',
        n_threads: 4,
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.toLowerCase().includes('no plugin') || msg.toLowerCase().includes('not supported')) {
      throw new Error(
        'Whisper engine is not loaded. Re-run `npm run bundle:qvac`, rebuild the app, then restart.'
      )
    }
    throw error
  }
  return whisperModelId
}

export async function transcribeAudioFile(uri: string): Promise<string> {
  const modelId = await ensureWhisperReady()
  const text = await transcribe({
    modelId,
    audioChunk: uri,
    prompt: 'Sports betting tipster notes.',
  })
  return text.trim()
}

export async function unloadSttModel() {
  if (!whisperModelId) return
  try {
    await unloadModel({ modelId: whisperModelId })
  } finally {
    whisperModelId = null
  }
}
