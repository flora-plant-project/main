import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme.js';

/**
 * Page wrapper: light-neutral canvas, safe-area aware, 20px page gutter.
 * `topColor` paints the safe area itself — screens whose app bar is white
 * (the garden home) pass `colors.surface` so there is no seam under the notch.
 */
export function Screen({ children, style, edges = ['top'], topColor = colors.bg }) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: topColor }]} edges={edges}>
      <View style={[styles.inner, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  inner: {
    backgroundColor: colors.bg,
    flex: 1,
    paddingHorizontal: spacing.page,
    paddingTop: spacing.md,
  },
});
