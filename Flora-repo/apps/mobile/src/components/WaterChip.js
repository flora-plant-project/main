import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { waterStatus } from '../utils/watering.js';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

/**
 * Plant status chip (design 3a): due today → green-tinted "Water today",
 * otherwise a neutral gray chip counting down or reading "All good".
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
      <Ionicons name={variant.icon} size={10} color={variant.iconColor} />
      <Text style={[styles.label, variant.label]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.chip,
  },
});

const NEUTRAL = {
  chip: { backgroundColor: colors.chipFill },
  label: { color: colors.chipText },
  icon: 'water-outline',
  iconColor: colors.primary,
};

const DUE = {
  chip: { backgroundColor: colors.greenTint },
  label: { color: colors.primaryDeep },
  icon: 'water-outline',
  iconColor: colors.primaryDeep,
};

const VARIANTS = {
  waterNow: DUE,
  today: DUE,
  inDays: NEUTRAL,
  allGood: { ...NEUTRAL, icon: 'checkmark' },
};
