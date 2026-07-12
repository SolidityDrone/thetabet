import { VoiceFieldOverlay } from '@/components/tipster/voice-field-overlay'
import { colors } from '@/constants/colors'
import {
  appendVoiceText,
  useVoiceFieldFill,
  type VoiceFillController,
} from '@/hooks/use-voice-field-fill'
import { Mic } from 'lucide-react-native'
import React from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'

export type { VoiceFillController }

type FieldProps = {
  fieldId: string
  voice: VoiceFillController
  value: string
  onChangeText: (text: string) => void
  onBlur?: () => void
  label?: string
  containerStyle?: StyleProp<ViewStyle>
  inputStyle?: StyleProp<ViewStyle>
  disabled?: boolean
  onTranscribed?: (text: string) => void
} & Pick<TextInputProps, 'placeholder' | 'placeholderTextColor' | 'multiline' | 'editable'>

export function TipsterVoiceTextField({
  fieldId,
  voice,
  value,
  onChangeText,
  onBlur,
  label,
  containerStyle,
  inputStyle,
  disabled,
  onTranscribed,
  placeholder,
  placeholderTextColor,
  multiline = true,
  editable = true,
}: FieldProps) {
  const [overlayOpen, setOverlayOpen] = React.useState(false)
  const [typing, setTyping] = React.useState(false)
  const inputRef = React.useRef<TextInput>(null)
  const fieldDisabled = disabled || editable === false

  const openOverlay = () => {
    if (fieldDisabled) return
    inputRef.current?.blur()
    setTyping(false)
    setOverlayOpen(true)
  }

  const openKeyboard = () => {
    setOverlayOpen(false)
    setTyping(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={openOverlay}
        disabled={fieldDisabled}
        style={[styles.inputWrap, voice.isFieldRecording(fieldId) && styles.inputWrapRecording]}
      >
        <TextInput
          ref={inputRef}
          style={[styles.input, inputStyle]}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor ?? colors.textTertiary}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          editable={!fieldDisabled && typing && !voice.isFieldBusy(fieldId)}
          showSoftInputOnFocus={typing}
          onFocus={() => {
            if (!typing) {
              inputRef.current?.blur()
              openOverlay()
            }
          }}
          pointerEvents={typing ? 'auto' : 'none'}
        />
        {!fieldDisabled ? (
          <View style={styles.voiceBadge}>
            <Mic size={14} color={colors.primary} />
            <Text style={styles.voiceBadgeText}>Tap to speak</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {!fieldDisabled ? (
        <TouchableOpacity style={styles.typeLink} onPress={openKeyboard}>
          <Text style={styles.typeLinkText}>Type manually instead</Text>
        </TouchableOpacity>
      ) : null}

      <VoiceFieldOverlay
        visible={overlayOpen}
        fieldId={fieldId}
        fieldLabel={label}
        preview={value}
        voice={voice}
        onClose={() => setOverlayOpen(false)}
        onAppend={(text) => {
          onChangeText(appendVoiceText(value, text))
          onTranscribed?.(text)
        }}
        onOverwrite={(text) => {
          onChangeText(text)
          onTranscribed?.(text)
        }}
        onClear={() => onChangeText('')}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  inputWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardDark,
    minHeight: 72,
    overflow: 'hidden',
  },
  inputWrapRecording: {
    borderColor: colors.primary,
  },
  input: {
    minHeight: 72,
    color: colors.text,
    padding: 12,
    paddingBottom: 34,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  voiceBadge: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.tintedBackground,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  voiceBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  typeLink: {
    alignSelf: 'flex-start',
  },
  typeLinkText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
  },
})
