import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typeScale } from '../theme.js';

/**
 * Underlined segmented filter (design 3a): single-select labels with a 2px
 * green underline under the active one. No pills, no fills.
 * @param {{ options: {key: string, label: string}[], value: string,
 *          onChange: (key: string) => void }} props
 */
export function SegmentedFilter({ options, value, onChange, testIDPrefix = 'filter' }) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            testID={`${testIDPrefix}-${option.key}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={styles.item}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
            <View style={[styles.underline, active && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 22,
    marginTop: spacing.lg,
  },
  item: {
    alignItems: 'stretch',
    gap: 9,
  },
  label: {
    color: colors.sage,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.filter,
  },
  labelActive: {
    color: colors.ink,
  },
  underline: {
    backgroundColor: 'transparent',
    borderRadius: 2,
    height: 2,
  },
  underlineActive: {
    backgroundColor: colors.primary,
  },
});
