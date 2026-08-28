import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { waterStatus } from '../utils/watering.js';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

/**
 * Watering pill per design 1a: overdue → solid terracotta "Water now",
 * due today → tinted terracotta "Today", otherwise outlined "in Nd".
 */
export function WaterChip({ nextDueAt, testID }) {
  const { t } = useTranslation();
  const status = waterStatus(nextDueAt);
  const variant = VARIANTS[status.key];
  const label =
    status.key === 'inDays'
      ? t('garden.chip.inDays', { count: status.days })
      : t(`garden.chip.${status.key}`);
  return (
    <View testID={testID} style={[styles.chip, variant.chip]}>
      <Ionicons name="water-outline" size={11} color={variant.icon} />
      <Text style={[styles.label, variant.label]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.micro,
  },
});

const VARIANTS = {
  waterNow: {
    chip: { backgroundColor: colors.terracotta },
    label: { color: colors.cream },
    icon: colors.cream,
  },
  today: {
    chip: { backgroundColor: colors.terracottaTint },
    label: { color: colors.terracotta },
    icon: colors.terracotta,
  },
  inDays: {
    chip: { borderColor: colors.primary, borderWidth: 1 },
    label: { color: colors.primary },
    icon: colors.primary,
  },
};
