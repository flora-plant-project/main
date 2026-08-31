import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

/**
 * Soft 8px-radius chip: gray at rest, green-tinted when selected.
 * v2 replaced the old full pills — chips never carry an accent fill.
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
    backgroundColor: colors.chipFill,
    borderColor: 'transparent',
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selected: {
    backgroundColor: colors.greenTint,
    borderColor: colors.greenTintBorder,
  },
  label: {
    color: colors.chipText,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
  },
  selectedLabel: {
    color: colors.primaryDeep,
  },
});
