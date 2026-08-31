import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../theme.js';

/**
 * White surface with a 1px #E9ECE7 border and a 16px radius — the base
 * container of the v2 design system. Cards use borders, never shadows.
 */
export function Card({ children, style, testID }) {
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.card,
  },
});
