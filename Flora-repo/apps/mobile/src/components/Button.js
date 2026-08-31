import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, primaryShadow, radii, spacing, typeScale } from '../theme.js';

const VARIANTS = {
  primary: {
    container: [{ backgroundColor: colors.primary }, primaryShadow],
    pressed: { backgroundColor: colors.primaryPressed },
    label: { color: colors.onPrimary, fontFamily: fonts.display, fontSize: typeScale.button },
    icon: colors.onPrimary,
    height: 50,
  },
  // White row button with a hairline border — the v2 "secondary" action.
  secondary: {
    container: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
    pressed: { backgroundColor: colors.chipFill },
    label: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: typeScale.label },
    icon: colors.ink,
    height: 48,
  },
  ghost: {
    container: { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
    pressed: { backgroundColor: colors.chipFill },
    label: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: typeScale.label },
    icon: colors.ink,
    height: 48,
  },
  // Attention in v2 is charcoal, never an accent hue.
  dark: {
    container: { backgroundColor: colors.ink },
    pressed: { backgroundColor: colors.inkBody },
    label: { color: colors.onPrimary, fontFamily: fonts.bodyBold, fontSize: typeScale.label },
    icon: colors.onPrimary,
    height: 48,
  },
};

/** Inline buttons sit inside rows; full-width ones take the variant's height. */
const SMALL = { minHeight: 36, paddingHorizontal: spacing.md };

/**
 * Standard button. Variants: 'primary' | 'secondary' | 'ghost' | 'dark'.
 * Sizes: 'md' (48–50px, full width) | 'sm' (36px, inline).
 * @param {{ icon?: string }} props `icon` is an Ionicons name rendered before the label.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon = null,
  disabled = false,
  style,
  testID,
}) {
  const styleSet = VARIANTS[variant] ?? VARIANTS.primary;
  const sizing =
    size === 'sm' ? SMALL : { minHeight: styleSet.height, paddingHorizontal: spacing.page };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        sizing,
        styleSet.container,
        pressed && styleSet.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon ? <Ionicons name={icon} size={17} color={styleSet.icon} /> : null}
        <Text style={[styles.label, styleSet.label]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.card,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    textAlign: 'center',
  },
});
