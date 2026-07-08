import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import type { ReactNode } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  visible: boolean
  onClose: () => void
  title?: string
  message?: string
  children?: ReactNode
  dismissOnBackdrop?: boolean
  cardStyle?: StyleProp<ViewStyle>
}

export function BottomSheetModal({
  visible,
  onClose,
  title,
  message,
  children,
  dismissOnBackdrop = true,
  cardStyle,
}: Props) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={dismissOnBackdrop ? onClose : undefined}
      >
        <Pressable
          style={[styles.card, { paddingBottom: Math.max(insets.bottom, 20) }, cardStyle]}
          onPress={(event) => event.stopPropagation()}
        >
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

type SheetActionsProps = {
  onCancel?: () => void
  cancelLabel?: string
  onConfirm?: () => void
  confirmLabel?: string
  confirmDisabled?: boolean
  destructive?: boolean
  children?: ReactNode
}

export function SheetActions({
  onCancel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirmLabel = 'Confirm',
  confirmDisabled = false,
  destructive = false,
  children,
}: SheetActionsProps) {
  return (
    <View style={styles.actions}>
      {children}
      {onCancel ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>{cancelLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {onConfirm ? (
        <TouchableOpacity
          style={[
            destructive ? styles.destructiveButton : styles.primaryButton,
            confirmDisabled && styles.buttonDisabled,
          ]}
          onPress={onConfirm}
          disabled={confirmDisabled}
        >
          <Text
            style={destructive ? styles.destructiveButtonText : styles.primaryButtonText}
          >
            {confirmLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.borderNeon,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: theme.radius.sharp,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.primaryDim,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryButton: {
    borderColor: colors.borderNeon,
    borderWidth: 1,
    borderRadius: theme.radius.sharp,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  destructiveButton: {
    backgroundColor: colors.danger,
    borderRadius: theme.radius.sharp,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  destructiveButtonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
