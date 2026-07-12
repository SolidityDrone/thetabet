import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native'

type SkeletonBlockProps = {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: ViewStyle
}

function SkeletonBlock({ width, height = 14, borderRadius = 6, style }: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.borderDark, opacity }, style]}
    />
  )
}

export function MatchCardSkeleton({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.cardHeader}>
        <SkeletonBlock width={80} height={10} borderRadius={4} />
        <SkeletonBlock width={50} height={10} borderRadius={4} />
      </View>
      <View style={styles.teamsRow}>
        <View style={styles.teamCol}>
          <SkeletonBlock width={compact ? 36 : 44} height={compact ? 36 : 44} borderRadius={22} />
          <SkeletonBlock width={70} height={compact ? 12 : 14} borderRadius={4} />
        </View>
        <SkeletonBlock width={20} height={16} borderRadius={4} />
        <View style={styles.teamCol}>
          <SkeletonBlock width={compact ? 36 : 44} height={compact ? 36 : 44} borderRadius={22} />
          <SkeletonBlock width={70} height={compact ? 12 : 14} borderRadius={4} />
        </View>
      </View>
    </View>
  )
}

export function EventPageSkeleton() {
  return (
    <View style={styles.eventPage}>
      <View style={styles.eventHeader}>
        <SkeletonBlock width={40} height={40} borderRadius={12} />
        <SkeletonBlock width={80} height={18} borderRadius={6} />
        <SkeletonBlock width={90} height={32} borderRadius={16} />
      </View>

      <View style={styles.eventCardArea}>
        <View style={[styles.card, { padding: 12 }]}>
          <View style={styles.cardHeader}>
            <SkeletonBlock width={100} height={12} borderRadius={4} />
            <SkeletonBlock width={60} height={12} borderRadius={4} />
          </View>
          <View style={[styles.teamsRow, { marginTop: 8 }]}>
            <View style={styles.teamCol}>
              <SkeletonBlock width={56} height={56} borderRadius={28} />
              <SkeletonBlock width={90} height={14} borderRadius={4} />
            </View>
            <SkeletonBlock width={30} height={20} borderRadius={4} />
            <View style={styles.teamCol}>
              <SkeletonBlock width={56} height={56} borderRadius={28} />
              <SkeletonBlock width={90} height={14} borderRadius={4} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <SkeletonBlock width={80} height={16} borderRadius={4} />
        <SkeletonBlock width={140} height={11} borderRadius={4} />
      </View>

      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.marketCard}>
          <SkeletonBlock width={100} height={14} borderRadius={4} />
          <View style={styles.outcomesRow}>
            <SkeletonBlock style={styles.outcomeBtn} height={48} borderRadius={8} />
            <SkeletonBlock style={styles.outcomeBtn} height={48} borderRadius={8} />
            <SkeletonBlock style={styles.outcomeBtn} height={48} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.borderNeon,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: 10,
    gap: 10,
  },
  cardCompact: {
    padding: 10,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  eventPage: {
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  eventCardArea: {
    marginBottom: 4,
  },
  sectionHeader: {
    gap: 4,
    marginTop: 8,
  },
  marketCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 10,
    gap: 8,
  },
  outcomesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outcomeBtn: {
    flex: 1,
    minWidth: '30%',
  },
})
