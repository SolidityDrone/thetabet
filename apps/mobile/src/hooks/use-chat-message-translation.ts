import {
  loadQvacSettings,
  QVAC_OUTPUT_LANGUAGE_OPTIONS,
  type QvacOutputLanguage,
} from '@/services/qvac/qvac-settings'
import { translateText } from '@/services/qvac/qvac-translation'
import { isTranslationModelInstalled, requiresTranslationModel } from '@/services/qvac/qvac-translation-models'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner-native'

type MessageTranslationEntry = {
  translated?: string
  loading: boolean
  showTranslated: boolean
}

export function useChatMessageTranslation() {
  const [outputLanguage, setOutputLanguage] = useState<QvacOutputLanguage>('en')
  const [byMessageId, setByMessageId] = useState<Record<string, MessageTranslationEntry>>({})
  const activeRequest = useRef<string | null>(null)

  useEffect(() => {
    loadQvacSettings()
      .then((settings) => setOutputLanguage(settings.outputLanguage))
      .catch(() => setOutputLanguage('en'))
  }, [])

  const getEntry = useCallback(
    (messageId: string) => byMessageId[messageId],
    [byMessageId]
  )

  const toggleMessageTranslation = useCallback(
    async (messageId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const existing = byMessageId[messageId]
      if (existing?.translated) {
        setByMessageId((current) => ({
          ...current,
          [messageId]: {
            ...existing,
            showTranslated: !existing.showTranslated,
          },
        }))
        return
      }

      if (existing?.loading || activeRequest.current === messageId) return

      if (outputLanguage === 'en') {
        toast.info('Set an output language in Settings → Translator to translate chat messages.')
        return
      }

      if (!requiresTranslationModel(outputLanguage)) {
        toast.info('Translation is not available for the selected language.')
        return
      }

      const installed = await isTranslationModelInstalled(outputLanguage)
      if (!installed) {
        const label =
          QVAC_OUTPUT_LANGUAGE_OPTIONS.find((option) => option.code === outputLanguage)?.label ??
          outputLanguage
        toast.info(`Download the ${label} translation model in Settings → Translator first.`)
        return
      }

      activeRequest.current = messageId
      setByMessageId((current) => ({
        ...current,
        [messageId]: { loading: true, showTranslated: false },
      }))

      try {
        const translated = await translateText(trimmed, outputLanguage)
        setByMessageId((current) => ({
          ...current,
          [messageId]: {
            translated,
            loading: false,
            showTranslated: true,
          },
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        toast.error(message || 'Translation failed')
        setByMessageId((current) => {
          const next = { ...current }
          delete next[messageId]
          return next
        })
      } finally {
        if (activeRequest.current === messageId) {
          activeRequest.current = null
        }
      }
    },
    [byMessageId, outputLanguage]
  )

  const getDisplayText = useCallback(
    (messageId: string, original: string) => {
      const entry = byMessageId[messageId]
      if (entry?.showTranslated && entry.translated) {
        return entry.translated
      }
      return original
    },
    [byMessageId]
  )

  const isTranslating = useCallback(
    (messageId: string) => byMessageId[messageId]?.loading === true,
    [byMessageId]
  )

  const isShowingTranslation = useCallback(
    (messageId: string) =>
      byMessageId[messageId]?.showTranslated === true && Boolean(byMessageId[messageId]?.translated),
    [byMessageId]
  )

  const targetLanguageLabel =
    QVAC_OUTPUT_LANGUAGE_OPTIONS.find((option) => option.code === outputLanguage)?.label ?? 'Translated'

  return {
    outputLanguage,
    targetLanguageLabel,
    toggleMessageTranslation,
    getDisplayText,
    isTranslating,
    isShowingTranslation,
    getEntry,
  }
}
