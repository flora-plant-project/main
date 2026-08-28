import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

const VARIANTS = {
  primary: {
    container: { backgroundColor: colors.primary },
    label: { color: colors.cream },
  },
  terracotta: {
    container: { backgroundColor: colors.terracotta },
    label: { color: colors.cream },
  },
  ghost: {
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    label: { color: colors.ink },
  },
};

/**
 * Standard button. Variants: 'primary' | 'terracotta' | 'ghost'.
 */
export function Button({ label, onPress, variant = 'primary', disabled = false, style, testID }) {
  const styleSet = VARIANTS[variant] ?? VARIANTS.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styleSet.container,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, styleSet.label]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.body,
  },
});
