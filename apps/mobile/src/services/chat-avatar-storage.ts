import { documentDirectory } from 'expo-file-system/legacy'

export function resolveLocalChatAvatarUri(avatarUri?: string | null): string | null {
  if (!avatarUri || !documentDirectory) return null
  if (avatarUri.startsWith('file://') || avatarUri.startsWith('data:')) return avatarUri
  const base = documentDirectory.endsWith('/') ? documentDirectory : `${documentDirectory}/`
  return `${base}${avatarUri}`
}
