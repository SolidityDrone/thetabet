import { colors } from '@/constants/colors'
import { usePearChat } from '@/context/pear-chat'
import { Brain } from 'lucide-react-native'
import React from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export function PeerInferenceProviderBanner() {
  const insets = useSafeAreaInsets()
  const { activeProviderRequest, providerActivity, providerStage, providerError } = usePearChat()

  if (!activeProviderRequest) return null

  const stageLabel = providerError
    ? 'Failed'
    : providerStage === 'synthesis'
      ? 'Writing analysis'
      : providerStage === 'web'
        ? 'Web scouts'
        : providerStage === 'loading-model'
          ? 'Loading model'
          : 'Running'

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={[styles.card, providerError ? styles.cardError : null]}>
        <View style={styles.iconWrap}>
          <Brain size={18} color={providerError ? colors.danger : colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, providerError ? styles.titleError : null]}>
            {providerError ? 'Peer inference failed' : 'Peer inference request'}
          </Text>
          <Text style={styles.match} numberOfLines={1}>
            {activeProviderRequest.input.matchTitle}
          </Text>
          <Text style={styles.activity} numberOfLines={3}>
            {providerError ?? `${stageLabel}${providerActivity ? ` · ${providerActivity}` : ''}`}
          </Text>
        </View>
        {!providerError ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderNeon,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  cardError: {
    borderColor: colors.dangerBorder,
    shadowColor: colors.danger,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.pitchStripe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  titleError: {
    color: colors.danger,
  },
  match: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  activity: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
})
