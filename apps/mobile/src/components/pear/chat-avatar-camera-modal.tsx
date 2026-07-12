import { colors } from '@/constants/colors'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system/legacy'
import { X } from 'lucide-react-native'
import React from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Props = {
  visible: boolean
  onClose: () => void
  onCapture: (payload: { imageBase64: string; mimeType: string }) => Promise<void>
}

export function ChatAvatarCameraModal({ visible, onClose, onCapture }: Props) {
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = React.useRef<CameraView>(null)
  const [capturing, setCapturing] = React.useState(false)

  React.useEffect(() => {
    if (!visible || permission?.granted) return
    void requestPermission()
  }, [visible, permission?.granted, requestPermission])

  const handleCapture = React.useCallback(async () => {
    if (!cameraRef.current || capturing) return

    try {
      setCapturing(true)
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.55,
        base64: true,
        skipProcessing: true,
      })

      if (!photo) return

      let imageBase64 = photo.base64 || null
      if (!imageBase64 && photo.uri) {
        imageBase64 = await FileSystem.readAsStringAsync(photo.uri, {
          encoding: FileSystem.EncodingType.Base64,
        })
      }

      if (!imageBase64) {
        throw new Error('Could not read captured photo')
      }

      await onCapture({
        imageBase64,
        mimeType: 'image/jpeg',
      })
      onClose()
    } finally {
      setCapturing(false)
    }
  }, [capturing, onCapture, onClose])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Chat photo</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {permission?.granted ? (
          <View style={styles.cameraWrap}>
            <CameraView ref={cameraRef} style={styles.camera} facing="front" />
            <View style={styles.guideRing} />
          </View>
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              Allow camera access to take a chat profile photo.
            </Text>
            <TouchableOpacity style={styles.permissionButton} onPress={() => void requestPermission()}>
              <Text style={styles.permissionButtonText}>Allow camera</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.captureButton, (!permission?.granted || capturing) && styles.captureButtonDisabled]}
          onPress={() => void handleCapture()}
          disabled={!permission?.granted || capturing}
        >
          <Text style={styles.captureButtonText}>
            {capturing ? 'Saving…' : 'Use this photo'}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 8,
  },
  cameraWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    width: '100%',
    height: '100%',
  },
  guideRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  permissionText: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  permissionButtonText: {
    color: colors.background,
    fontWeight: '700',
  },
  captureButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  captureButtonDisabled: {
    opacity: 0.55,
  },
  captureButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
})
