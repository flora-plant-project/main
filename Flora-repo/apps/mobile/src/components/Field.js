import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

/**
 * Labelled text input with an inline (terracotta) validation message.
 */
export function Field({ label, error, testID, style, ...inputProps }) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.sage}
        style={[styles.input, error && styles.inputError]}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.cream,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputError: {
    borderColor: colors.terracotta,
  },
  error: {
    color: colors.terracotta,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginTop: spacing.xs,
  },
});
