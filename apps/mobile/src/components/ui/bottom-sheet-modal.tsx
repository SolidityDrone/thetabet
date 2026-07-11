import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useModalBottomInset } from '@/hooks/use-modal-bottom-inset'
import type { ReactNode } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

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
  const bottomInset = useModalBottomInset()
  const { height: windowHeight } = useWindowDimensions()
  const maxSheetHeight = Math.round(windowHeight * 0.84 - bottomInset)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={dismissOnBackdrop ? onClose : undefined}
        />
        <View
          style={[
            styles.sheetContainer,
            { marginBottom: bottomInset, maxHeight: maxSheetHeight },
          ]}
        >
          <View style={[styles.card, cardStyle]}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <View style={styles.cardBody}>{children}</View>
          </View>
        </View>
      </View>
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
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheetContainer: {
    width: '100%',
    flexShrink: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.borderNeon,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
    overflow: 'hidden',
    flexGrow: 1,
    flexShrink: 1,
  },
  cardBody: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
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
    flexWrap: 'wrap',
    flexShrink: 0,
    paddingTop: 4,
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
