import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

/**
 * Pill chip: green-tinted at rest, solid primary when selected.
 */
export function Chip({ label, selected = false, onPress, style, testID }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected, style]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.greenTint,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDeep,
  },
  label: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
  },
  selectedLabel: {
    color: colors.cream,
  },
});
