import { colors } from '@/constants/colors'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

/**
 * Ambient background — pure RN views (no native gradient module).
 * A smooth top→bottom gradient in the app palette: a deep pitch-green tinted
 * charcoal at the very top fading into pure black at the bottom.
 */

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex([r, g, b]: RGB): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// Top → bottom stops, all from the ThetaBet palette (pitch green → black).
const STOPS: RGB[] = [hexToRgb('#0C1A12'), hexToRgb('#06100A'), hexToRgb(colors.black)]

const BANDS = 48

/** Smoothstep easing removes hard band edges for a smoother fade. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function buildGradient(stops: RGB[], bands: number): string[] {
  const out: string[] = []
  for (let i = 0; i < bands; i++) {
    const t = smoothstep(i / (bands - 1))
    const seg = t * (stops.length - 1)
    const idx = Math.min(Math.floor(seg), stops.length - 2)
    out.push(rgbToHex(mix(stops[idx], stops[idx + 1], seg - idx)))
  }
  return out
}

export function ScreenBackdrop() {
  const gradient = useMemo(() => buildGradient(STOPS, BANDS), [])

  return (
    <View style={styles.root} pointerEvents="none">
      {gradient.map((color, i) => (
        <View key={i} style={[styles.band, { backgroundColor: color }]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: colors.black,
    flexDirection: 'column',
  },
  band: {
    flex: 1,
  },
})
