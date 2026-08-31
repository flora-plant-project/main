import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../theme.js';

/**
 * A watering ring wrapped around whatever it contains.
 *
 * The arc fills as the plant works through its watering cycle, so a glance at
 * the garden grid reads as "this one is nearly due" without parsing a date. It
 * deepens to the due green once the plant is due, matching WaterChip — the two
 * must never disagree, so both read from the same `waterStatus`/`waterProgress`
 * pair.
 *
 * Decorative: the ring carries no touch target of its own. Watering is
 * confirmed deliberately, on the plant's own screen.
 *
 * @param {{
 *   progress: number,
 *   size: number,
 *   due?: boolean,
 *   strokeWidth?: number,
 *   children?: React.ReactNode,
 *   testID?: string,
 * }} props
 */
export function WaterRing({ progress, size, due = false, strokeWidth = 3, children, testID }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const color = due ? colors.primaryDeep : colors.primary;

  return (
    <View style={[styles.wrap, { height: size, width: size }]}>
      <Svg
        testID={testID}
        width={size}
        height={size}
        // Rotated so the arc starts at twelve o'clock rather than SVG's default
        // three, which is where people expect a dial to begin.
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          fill="none"
        />
      </Svg>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
