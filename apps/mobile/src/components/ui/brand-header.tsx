import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'
import { useScreenTopPadding } from '@/hooks/use-screen-top-padding'
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native'

type Props = {
  title: string
  subtitle?: string
  right?: React.ReactNode
  compact?: boolean
  /** Adds padding below the OS status bar. Default on for screen headers. */
  withSafeTop?: boolean
  style?: ViewStyle
}

export function BrandHeader({
  title,
  subtitle,
  right,
  compact,
  withSafeTop = true,
  style,
}: Props) {
  const topPadding = useScreenTopPadding(withSafeTop)

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        withSafeTop && topPadding > 0 ? { paddingTop: topPadding } : null,
        style,
      ]}
    >
      <View style={styles.left}>
        <View style={styles.brandRow}>
          <Image source={require('../../../assets/images/brand-icon.png')} style={styles.brandIcon} resizeMode="contain" />
          <Text style={styles.brand}>THETABET</Text>
        </View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  wrapCompact: {
    paddingBottom: theme.spacing.xs,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  brandIcon: {
    width: 22,
    height: 22,
  },
  brand: {
    ...theme.typography.caption,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  title: {
    ...theme.typography.hero,
  },
  titleCompact: {
    fontSize: 20,
  },
  subtitle: {
    ...theme.typography.subtitle,
    marginTop: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: 2,
  },
})
