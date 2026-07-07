import { colors } from '@/constants/colors'
import { useAppMode } from '@/context/app-mode'
import { usePearChat } from '@/context/pear-chat'
import { useDebouncedNavigation } from '@/hooks/use-debounced-navigation'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function TipsterScreen() {
  const insets = useSafeAreaInsets()
  const router = useDebouncedNavigation()
  const { devWalletAddress, hasSkippedWallet } = useAppMode()
  const { ready, error, tipsterProfile, createChannel, setTipsterProfile, ensureStarted } = usePearChat()
  const [displayName, setDisplayName] = useState(tipsterProfile?.displayName ?? '')
  const [bio, setBio] = useState(tipsterProfile?.bio ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ensureStarted().catch((bootError) => {
      console.error('Pear chat failed to start:', bootError)
    })
  }, [ensureStarted])

  const walletAddress = hasSkippedWallet
    ? devWalletAddress
    : (tipsterProfile?.walletAddress ?? devWalletAddress)

  const handleOnboard = async () => {
    if (!displayName.trim()) {
      Alert.alert('Name required', 'Pick a tipster display name.')
      return
    }

    setBusy(true)
    try {
      const publicChannel = await createChannel(`${displayName.trim()} · Public`, false)
      const privateChannel = await createChannel(`${displayName.trim()} · Private`, true)

      await setTipsterProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        walletAddress,
        publicChannelId: publicChannel.id,
        privateChannelId: privateChannel.id,
        createdAt: Date.now(),
      })

      Alert.alert(
        'Tipster ready',
        'Public + private channels created. Share the private topic key with fans (Phase 3 will token-gate this).',
        [
          {
            text: 'Open public channel',
            onPress: () => router.push(`/channel/${publicChannel.id}`),
          },
          { text: 'OK' },
        ]
      )
    } catch (error) {
      Alert.alert('Onboard failed', String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Starting Pear P2P worklet…</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
    >
      <Text style={styles.title}>Tipster onboard</Text>
      <Text style={styles.subtitle}>
        Permissionless vault creation comes in Phase 3. For now, spin up your public discovery channel
        and private fan chat on Pear P2P.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Wallet (Polygon)</Text>
        <Text style={styles.mono}>{walletAddress}</Text>
        {hasSkippedWallet ? (
          <Text style={styles.hint}>Dev skip wallet — Polygon address</Text>
        ) : null}
      </View>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. PitchKing"
        placeholderTextColor={colors.textTertiary}
        value={displayName}
        onChangeText={setDisplayName}
      />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="What do you tip on?"
        placeholderTextColor={colors.textTertiary}
        value={bio}
        onChangeText={setBio}
        multiline
      />

      {tipsterProfile ? (
        <View style={styles.card}>
          <Text style={styles.label}>Existing tipster profile</Text>
          <Text style={styles.value}>{tipsterProfile.displayName}</Text>
          <Text style={styles.hint}>
            Public: {tipsterProfile.publicChannelId} · Private: {tipsterProfile.privateChannelId}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.primaryButton} onPress={handleOnboard} disabled={busy}>
        <Text style={styles.primaryButtonText}>
          {tipsterProfile ? 'Recreate channels' : 'Create tipster channels'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  mono: {
    color: colors.primary,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  hint: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: colors.black,
    fontWeight: '700',
    fontSize: 16,
  },
})
