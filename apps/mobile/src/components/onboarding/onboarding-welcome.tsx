import { Download, FastForward, Wallet } from 'lucide-react-native'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ScreenBackdrop } from '@/components/ui/screen-backdrop'
import { colors } from '@/constants/colors'
import { theme } from '@/constants/theme'

interface ActionButton {
  id: number
  title: string
  iconName: string
  variant: 'filled' | 'tinted'
  onPress: () => void
}

interface Props {
  title: string
  subtitle: string
  actionButtons: ActionButton[]
}

export const OnBoardingWelcome: React.FC<Props> = ({ title, subtitle, actionButtons }) => {
  return (
    <View style={styles.container}>
      <ScreenBackdrop />
      <View style={styles.content}>
        <View style={styles.brandBlock}>
          <View style={styles.brandMark} />
          <Text style={styles.brand}>THETABET</Text>
          <Text style={styles.tagline}>Live football · On-chain betting</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.actionButtonsContainer}>
          {actionButtons.map((button) => (
            <TouchableOpacity
              key={button.id}
              style={[
                styles.actionButton,
                button.variant === 'filled' && styles.filledButton,
                button.variant === 'tinted' && styles.tintedButton,
              ]}
              onPress={button.onPress}
            >
              <View style={styles.buttonContent}>
                {button.iconName === 'wallet' && (
                  <Wallet
                    size={18}
                    color={button.variant === 'filled' ? colors.onPrimary : colors.primary}
                  />
                )}
                {button.iconName === 'download' && (
                  <Download
                    size={18}
                    color={button.variant === 'filled' ? colors.onPrimary : colors.primary}
                  />
                )}
                {button.iconName === 'skip' && (
                  <FastForward
                    size={18}
                    color={button.variant === 'filled' ? colors.onPrimary : colors.primary}
                  />
                )}
                <Text
                  style={[
                    styles.actionButtonText,
                    button.variant === 'filled' && styles.filledButtonText,
                  ]}
                >
                  {button.title}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.xxl,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  brandBlock: {
    marginBottom: theme.spacing.xxl,
    gap: 6,
  },
  brandMark: {
    width: 10,
    height: 10,
    backgroundColor: colors.primary,
    transform: [{ rotate: '45deg' }],
    marginBottom: 4,
  },
  brand: {
    ...theme.typography.caption,
    color: colors.gold,
    letterSpacing: 2,
    fontSize: 12,
  },
  tagline: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 36,
  },
  actionButtonsContainer: {
    width: '100%',
    gap: 10,
  },
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: theme.radius.sharp,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderNeon,
  },
  filledButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDim,
  },
  tintedButton: {
    backgroundColor: colors.neonMuted,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  filledButtonText: {
    color: colors.onPrimary,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
