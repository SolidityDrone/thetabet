import { colors } from '@/constants/colors'

export const theme = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radius: {
    sharp: 4,
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  typography: {
    brand: {
      fontSize: 22,
      fontWeight: '900' as const,
      letterSpacing: 1.2,
      color: colors.text,
    },
    hero: {
      fontSize: 24,
      fontWeight: '800' as const,
      letterSpacing: -0.3,
      color: colors.text,
    },
    title: {
      fontSize: 17,
      fontWeight: '800' as const,
      color: colors.text,
    },
    subtitle: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      letterSpacing: 0.2,
    },
    body: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.text,
    },
    caption: {
      fontSize: 11,
      fontWeight: '700' as const,
      color: colors.textTertiary,
      letterSpacing: 0.4,
      textTransform: 'uppercase' as const,
    },
    odds: {
      fontSize: 14,
      fontWeight: '800' as const,
      color: colors.primary,
    },
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  cardAccent: {
    borderWidth: 1,
    borderColor: colors.borderNeon,
  },
  tabBar: {
    height: 58,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    activeColor: colors.primary,
    inactiveColor: colors.textTertiary,
  },
} as const
