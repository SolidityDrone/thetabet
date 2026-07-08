import { BottomSheetModal, SheetActions } from '@/components/ui/bottom-sheet-modal'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { StyleSheet, Text, View } from 'react-native'

export type ConfirmSheetOptions = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export type AlertSheetOptions = {
  title: string
  message?: string
  buttonLabel?: string
}

type ConfirmRequest = ConfirmSheetOptions & {
  kind: 'confirm'
  resolve: (confirmed: boolean) => void
}

type AlertRequest = AlertSheetOptions & {
  kind: 'alert'
  resolve: () => void
}

type SheetRequest = ConfirmRequest | AlertRequest

type ConfirmSheetContextValue = {
  confirm: (options: ConfirmSheetOptions) => Promise<boolean>
  alert: (options: AlertSheetOptions) => Promise<void>
}

const ConfirmSheetContext = createContext<ConfirmSheetContextValue | null>(null)

export function ConfirmSheetProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<SheetRequest | null>(null)
  const queueRef = useRef<SheetRequest[]>([])
  const activeRef = useRef(false)

  const pumpQueue = useCallback(() => {
    if (activeRef.current) return
    const next = queueRef.current.shift()
    if (!next) {
      setRequest(null)
      return
    }
    activeRef.current = true
    setRequest(next)
  }, [])

  const closeActive = useCallback(() => {
    activeRef.current = false
    setRequest(null)
    requestAnimationFrame(() => pumpQueue())
  }, [pumpQueue])

  const enqueue = useCallback(
    (item: SheetRequest) => {
      queueRef.current.push(item)
      pumpQueue()
    },
    [pumpQueue]
  )

  const confirm = useCallback(
    (options: ConfirmSheetOptions) =>
      new Promise<boolean>((resolve) => {
        enqueue({
          kind: 'confirm',
          ...options,
          resolve,
        })
      }),
    [enqueue]
  )

  const alert = useCallback(
    (options: AlertSheetOptions) =>
      new Promise<void>((resolve) => {
        enqueue({
          kind: 'alert',
          ...options,
          resolve,
        })
      }),
    [enqueue]
  )

  const value = useMemo(() => ({ confirm, alert }), [alert, confirm])

  const handleCancel = useCallback(() => {
    if (!request) return
    if (request.kind === 'confirm') {
      request.resolve(false)
    } else {
      request.resolve()
    }
    closeActive()
  }, [closeActive, request])

  const handleConfirm = useCallback(() => {
    if (!request) return
    if (request.kind === 'confirm') {
      request.resolve(true)
    } else {
      request.resolve()
    }
    closeActive()
  }, [closeActive, request])

  return (
    <ConfirmSheetContext.Provider value={value}>
      {children}
      <BottomSheetModal
        visible={request !== null}
        onClose={handleCancel}
        title={request?.title}
        message={request?.message}
      >
        {request?.kind === 'confirm' && request.destructive ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>This action cannot be undone.</Text>
          </View>
        ) : null}
        <SheetActions
          onCancel={request?.kind === 'confirm' ? handleCancel : undefined}
          cancelLabel={request?.kind === 'confirm' ? request.cancelLabel : undefined}
          onConfirm={handleConfirm}
          confirmLabel={
            request?.kind === 'confirm'
              ? request.confirmLabel ?? 'Confirm'
              : request?.buttonLabel ?? 'OK'
          }
          destructive={request?.kind === 'confirm' ? request.destructive : false}
        />
      </BottomSheetModal>
    </ConfirmSheetContext.Provider>
  )
}

export function useConfirmSheet() {
  const context = useContext(ConfirmSheetContext)
  if (!context) {
    throw new Error('useConfirmSheet must be used within ConfirmSheetProvider')
  }
  return context
}

const styles = StyleSheet.create({
  warningBanner: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
})
