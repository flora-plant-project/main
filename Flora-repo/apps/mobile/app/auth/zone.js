import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ClimateZones } from '@flora/shared';
import { Screen } from '../../src/components/Screen.js';
import { Card } from '../../src/components/Card.js';
import { useAuthStore } from '../../src/store/authStore.js';
import { colors, fonts, spacing, typeScale } from '../../src/theme.js';

/** Climate-zone onboarding: four tappable region cards. */
export default function ZoneScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const setClimateZone = useAuthStore((state) => state.setClimateZone);
  const [error, setError] = useState(null);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const pick = async (zone) => {
    setError(null);
    const res = await setClimateZone(zone);
    if (res.ok) router.replace('/');
    else setError(res.error.message);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Text style={[styles.title, { fontFamily: displayFont }]}>{t('auth.zoneTitle')}</Text>
      <Text style={styles.hint}>{t('auth.zoneHint')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {ClimateZones.map((zone) => (
        <Pressable
          key={zone}
          testID={`zone-${zone}`}
          accessibilityRole="button"
          onPress={() => pick(zone)}
        >
          <Card style={styles.zoneCard}>
            <Text style={styles.zoneName}>{t(`auth.zones.${zone}.name`)}</Text>
            <Text style={styles.zoneHint}>{t(`auth.zones.${zone}.hint`)}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: typeScale.display,
    marginTop: spacing.xxl,
  },
  hint: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    marginBottom: spacing.xl,
  },
  error: {
    color: colors.terracotta,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginBottom: spacing.md,
  },
  zoneCard: {
    backgroundColor: colors.greenTint,
    marginBottom: spacing.md,
  },
  zoneName: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.heading,
  },
  zoneHint: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginTop: spacing.xs,
  },
});
