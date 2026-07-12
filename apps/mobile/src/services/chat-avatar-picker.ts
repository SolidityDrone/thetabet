type AvatarImagePayload = {
  imageBase64: string
  mimeType: string
}

function isImagePickerNativeMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /ExponentImagePicker|native module/i.test(message)
}

function loadImagePickerModule() {
  try {
    // Runtime require only — never import expo-image-picker at module scope.
    return require('expo-image-picker') as typeof import('expo-image-picker')
  } catch {
    return null
  }
}

export async function pickChatAvatarFromGallery(): Promise<AvatarImagePayload | null> {
  const ImagePicker = loadImagePickerModule()
  if (!ImagePicker) {
    throw new Error('Gallery picker is unavailable. Use Take photo or rebuild the app.')
  }

  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      throw new Error('Allow photo library access to choose a chat avatar')
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.55,
      base64: true,
    })

    if (result.canceled || !result.assets[0]?.base64) return null

    const asset = result.assets[0]
    return {
      imageBase64: asset.base64,
      mimeType: asset.mimeType || 'image/jpeg',
    }
  } catch (error) {
    if (isImagePickerNativeMissing(error)) {
      throw new Error('Gallery picker needs a native rebuild. Use Take photo for now.')
    }
    throw error
  }
}
