import { colors } from '@/constants/colors'
import { resolveLocalChatAvatarUri } from '@/services/chat-avatar-storage'
import { Image } from 'expo-image'
import { User } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'

export function ChatAvatar({
  avatarUri,
  avatarData,
  size = 42,
  accent,
}: {
  avatarUri?: string | null
  avatarData?: string | null
  seed?: string
  size?: number
  accent?: string
}) {
  const imageSource = avatarData || resolveLocalChatAvatarUri(avatarUri)

  if (imageSource) {
    return (
      <Image
        source={{ uri: imageSource }}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        contentFit="cover"
      />
    )
  }

  return (
    <View
      style={[
        styles.avatar,
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <User size={size * 0.48} color={accent || colors.textSecondary} strokeWidth={2.2} />
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
})
