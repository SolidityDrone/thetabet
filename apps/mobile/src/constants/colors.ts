/** ThetaBet — Pro Black / Neon Pitch theme. Pure-black canvas with a subtle
 *  vertical gradient and faint brand glows. Neon green + gold stay as accents. */
export const colors = {
  // Surfaces — pure black base, near-black elevations
  background: '#000000',
  backgroundElevated: '#08090D',
  card: '#0E1118',
  cardDark: '#0A0D13',
  cardPitch: '#08120C',

  // Brand
  primary: '#7CFF4F',
  primaryDim: '#5CE63A',
  gold: '#E8C547',
  goldDim: '#C9A83A',

  // Pitch accents
  pitch: '#0D2818',
  pitchLine: 'rgba(124, 255, 79, 0.12)',
  pitchStripe: 'rgba(124, 255, 79, 0.06)',

  // Text
  text: '#F4F7FC',
  textSecondary: '#8B9BB8',
  textTertiary: '#5C6B85',
  textDisabled: '#3D4A63',

  // Borders
  border: '#1A1F2E',
  borderDark: '#12161F',
  borderLight: '#243352',
  borderNeon: 'rgba(124, 255, 79, 0.35)',

  // Status
  success: '#7CFF4F',
  danger: '#FF3B5C',
  warning: '#FFB020',
  error: '#FF6B7A',
  live: '#FF3B5C',

  // Semantic fills
  overlay: 'rgba(0, 0, 0, 0.86)',
  neonMuted: 'rgba(124, 255, 79, 0.1)',
  neonStrong: 'rgba(124, 255, 79, 0.2)',
  goldMuted: 'rgba(232, 197, 71, 0.12)',
  warningBackground: 'rgba(255, 176, 32, 0.1)',
  warningBorder: 'rgba(255, 176, 32, 0.28)',
  dangerBackground: 'rgba(255, 59, 92, 0.1)',
  dangerBorder: 'rgba(255, 59, 92, 0.28)',
  tintedBackground: 'rgba(124, 255, 79, 0.08)',

  // Buttons
  onPrimary: '#050B14',
  onGold: '#050B14',

  black: '#000000',
  white: '#FFFFFF',
} as const
