import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import {
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  daysForDialTouch,
  dialFractionForDays,
} from '../utils/watering.js';
import { colors, fonts, typeScale } from '../theme.js';

const SIZE = 168;
const STROKE = 10;

/**
 * Circular picker for a watering interval.
 *
 * Drag anywhere on the dial to sweep from 1 day at the top round to 60. The
 * angle maths lives in watering.js as a pure function so it can be tested
 * without synthesising gestures, which is the part that actually goes wrong.
 *
 * The whole face is the touch target rather than a small knob: this is a
 * one-handed adjustment made while holding a watering can.
 *
 * @param {{value: number, onChange: (days: number) => void, testID?: string}} props
 */
export function IntervalDial({ value, onChange, testID }) {
  const { t } = useTranslation();
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = dialFractionForDays(value);

  // Kept in a ref so the responder closure never captures a stale value, and
  // so repeated moves onto the same day do not re-fire the mutation.
  const lastEmitted = useRef(value);
  lastEmitted.current = value;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => emit(event),
        onPanResponderMove: (event) => emit(event),
      }),
    // Built once. `emit` reads the current value and handler through refs, so
    // the responder never needs rebuilding and never captures a stale closure.
    [],
  );

  const handler = useRef(onChange);
  handler.current = onChange;

  function emit(event) {
    const { locationX, locationY } = event.nativeEvent;
    const days = daysForDialTouch(locationX - SIZE / 2, locationY - SIZE / 2);
    if (days === lastEmitted.current) return;
    lastEmitted.current = days;
    handler.current(days);
  }

  return (
    <View
      testID={testID}
      accessibilityRole="adjustable"
      accessibilityLabel={t('plantDetail.intervalLabel')}
      accessibilityValue={{ min: MIN_INTERVAL_DAYS, max: MAX_INTERVAL_DAYS, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        const delta = nativeEvent.actionName === 'increment' ? 1 : -1;
        const next = Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, value + delta));
        if (next !== value) onChange(next);
      }}
      style={styles.dial}
      {...responder.panHandlers}
    >
      <Svg
        width={SIZE}
        height={SIZE}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}
      >
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          stroke={colors.greenTint}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          stroke={colors.primary}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          fill="none"
        />
      </Svg>

      <Text testID="interval-value" style={styles.days} pointerEvents="none">
        {value}
      </Text>
      <Text style={styles.unit} pointerEvents="none">
        {t('plantDetail.intervalUnit', { count: value })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: {
    alignItems: 'center',
    alignSelf: 'center',
    height: SIZE,
    justifyContent: 'center',
    width: SIZE,
  },
  days: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 44,
    lineHeight: 48,
  },
  unit: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    textTransform: 'uppercase',
  },
});
