import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { MAX_INTERVAL_DAYS, dialFractionForDays, parseIntervalDays } from '../utils/watering.js';
import { colors, fonts, typeScale } from '../theme.js';

const SIZE = 168;
const STROKE = 10;
/** 60 days is two digits, so the field never needs room for a third. */
const MAX_DIGITS = String(MAX_INTERVAL_DAYS).length;

/**
 * Watering interval: a ring you read, and a number you type.
 *
 * The ring used to be the input — drag anywhere on the face to sweep from 1 day
 * round to 60. It looked right and handled badly: the thumb covers the arc it
 * is setting, the whole range lives in one revolution so a few degrees of
 * wobble moves the schedule by days, and there was no way to land on an exact
 * number on purpose. The face is now a gauge, and the number at its centre is
 * the control.
 *
 * The edit commits on blur or submit rather than per keystroke: typing "1" on
 * the way to "12" must not write a one-day schedule.
 *
 * @param {{value: number, onChange: (days: number) => void, testID?: string}} props
 */
export function IntervalDial({ value, onChange, testID }) {
  const { t } = useTranslation();
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  /** What has been typed so far, or null when the field is showing `value`. */
  const [draft, setDraft] = useState(null);
  const typed = draft === null ? null : parseIntervalDays(draft);
  // The ring follows the typing so the field is not the only feedback, but an
  // empty field holds the last good arc instead of collapsing to nothing.
  const shown = typed ?? value;

  const commit = () => {
    const days = typed;
    setDraft(null);
    if (days !== null && days !== value) onChange(days);
  };

  return (
    <View style={styles.wrap}>
      <View testID={testID} style={styles.dial}>
        <Svg
          width={SIZE}
          height={SIZE}
          // The ring sits over the whole face, including the number. It must
          // never intercept a tap meant for the field beneath it.
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}
        >
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={radius}
            stroke={colors.track}
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
            strokeDashoffset={circumference * (1 - dialFractionForDays(shown))}
            fill="none"
          />
        </Svg>

        <TextInput
          testID="interval-value"
          value={draft ?? String(value)}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          accessibilityLabel={t('plantDetail.intervalLabel')}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={MAX_DIGITS}
          selectTextOnFocus
          style={styles.days}
        />
        <Text style={styles.unit}>{t('plantDetail.intervalUnit', { count: shown })}</Text>
      </View>

      <Text style={styles.hint}>{t('plantDetail.intervalHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  dial: {
    alignItems: 'center',
    height: SIZE,
    justifyContent: 'center',
    width: SIZE,
  },
  days: {
    // Underlined rather than boxed: inside a ring there is no room for a field
    // that looks like a field, but the number still has to look editable.
    borderBottomColor: colors.greenTintBorder,
    borderBottomWidth: 2,
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 44,
    height: 56,
    lineHeight: 48,
    minWidth: 88,
    padding: 0,
    textAlign: 'center',
  },
  unit: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  hint: {
    color: colors.sage,
    fontFamily: fonts.body,
    fontSize: typeScale.micro,
    marginTop: 6,
  },
});
