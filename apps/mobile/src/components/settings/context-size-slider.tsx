import { colors } from '@/constants/colors'
import { useMemo, useRef, useState } from 'react'
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native'

type Props = {
  value: number
  min: number
  max: number
  step: number
  onValueChange: (value: number) => void
  onSlidingComplete: (value: number) => void
}

const THUMB_SIZE = 22
const TRACK_HEIGHT = 6

function formatCtx(n: number) {
  return n >= 1024 ? `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)}K` : String(n)
}

function snapToStep(value: number, min: number, max: number, step: number) {
  const snapped = Math.round(value / step) * step
  return Math.min(max, Math.max(min, snapped))
}

function ratioFromValue(value: number, min: number, max: number) {
  if (max <= min) return 0
  return (value - min) / (max - min)
}

export function ContextSizeSlider({
  value,
  min,
  max,
  step,
  onValueChange,
  onSlidingComplete,
}: Props) {
  const trackRef = useRef<View>(null)
  const trackLeftRef = useRef(0)
  const trackWidthRef = useRef(0)
  const [trackWidth, setTrackWidth] = useState(0)
  const draggingRef = useRef(false)
  const onValueChangeRef = useRef(onValueChange)
  const onSlidingCompleteRef = useRef(onSlidingComplete)
  const valueRef = useRef(value)
  const limitsRef = useRef({ min, max, step })

  onValueChangeRef.current = onValueChange
  onSlidingCompleteRef.current = onSlidingComplete
  valueRef.current = value
  limitsRef.current = { min, max, step }
  trackWidthRef.current = trackWidth

  const measureTrack = () => {
    trackRef.current?.measureInWindow((x) => {
      trackLeftRef.current = x
    })
  }

  const valueFromPageX = (pageX: number) => {
    const width = trackWidthRef.current
    const { min: lo, max: hi, step: st } = limitsRef.current
    if (width <= 0) return valueRef.current
    const x = pageX - trackLeftRef.current
    const ratio = Math.max(0, Math.min(1, x / width))
    return snapToStep(lo + ratio * (hi - lo), lo, hi, st)
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          draggingRef.current = true
          measureTrack()
          onValueChangeRef.current(valueFromPageX(evt.nativeEvent.pageX))
        },
        onPanResponderMove: (evt) => {
          onValueChangeRef.current(valueFromPageX(evt.nativeEvent.pageX))
        },
        onPanResponderRelease: (evt) => {
          const next = valueFromPageX(evt.nativeEvent.pageX)
          onValueChangeRef.current(next)
          onSlidingCompleteRef.current(next)
          draggingRef.current = false
        },
        onPanResponderTerminate: () => {
          if (draggingRef.current) onSlidingCompleteRef.current(valueRef.current)
          draggingRef.current = false
        },
      }),
    []
  )

  const ratio = ratioFromValue(value, min, max)
  const fillWidth = ratio * trackWidth
  const thumbLeft = ratio * Math.max(0, trackWidth - THUMB_SIZE)

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width)
    measureTrack()
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.valueRow}>
        <Text style={styles.valueLabel}>Context window</Text>
        <Text style={styles.valueText}>
          {value.toLocaleString()} <Text style={styles.valueUnit}>tokens</Text>
        </Text>
      </View>

      <View
        ref={trackRef}
        style={styles.sliderHit}
        onLayout={handleLayout}
        {...pan.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: fillWidth }]} />
        </View>
        <View style={[styles.thumb, { left: thumbLeft }]} />
      </View>

      <View style={styles.limitsRow}>
        <View style={styles.limitCol}>
          <Text style={styles.limitTag}>Min</Text>
          <Text style={styles.limitValue}>{formatCtx(min)}</Text>
          <Text style={styles.limitRaw}>{min}</Text>
        </View>
        <Text style={styles.limitHint}>Higher = longer previews · more RAM</Text>
        <View style={[styles.limitCol, styles.limitColRight]}>
          <Text style={styles.limitTag}>Max</Text>
          <Text style={styles.limitValue}>{formatCtx(max)}</Text>
          <Text style={styles.limitRaw}>{max}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 4,
    paddingTop: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  valueLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  valueText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  valueUnit: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
  },
  sliderHit: {
    height: 36,
    justifyContent: 'center',
    marginVertical: 2,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  trackFill: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    top: (36 - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  limitsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  limitCol: {
    minWidth: 52,
    gap: 1,
  },
  limitColRight: {
    alignItems: 'flex-end',
  },
  limitTag: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  limitValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  limitRaw: {
    color: colors.textTertiary,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  limitHint: {
    flex: 1,
    color: colors.textTertiary,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    paddingTop: 2,
  },
})
