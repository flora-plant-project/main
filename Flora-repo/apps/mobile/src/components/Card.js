import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme.js';

/**
 * Cream surface with a hairline border — the base container of the design system.
 */
export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
  },
});
