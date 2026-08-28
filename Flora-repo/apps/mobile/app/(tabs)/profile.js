import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { Screen } from '../../src/components/Screen.js';
import { Card } from '../../src/components/Card.js';
import { Chip } from '../../src/components/Chip.js';
import { Button } from '../../src/components/Button.js';
import { setLocale } from '../../src/i18n/index.js';
import { useAuthStore } from '../../src/store/authStore.js';
import { colors, fonts, spacing, typeScale } from '../../src/theme.js';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const active = i18n.language;
  const canResetDemo =
    (process.env.EXPO_PUBLIC_API_MODE ?? 'mock') === 'mock' && typeof client.reset === 'function';

  const resetDemo = async () => {
    await client.reset();
    queryClient.clear();
    useAuthStore.getState().hydrate();
  };
  return (
    <Screen>
      <Text
        style={[
          styles.title,
          { fontFamily: active === 'ar' ? fonts.displayArabic : fonts.display },
        ]}
      >
        {t('profile.title')}
      </Text>
      <Card>
        <Text style={styles.sectionLabel}>{t('profile.language')}</Text>
        <View style={styles.row}>
          <Chip
            testID="locale-en"
            label={t('profile.english')}
            selected={active === 'en'}
            onPress={() => setLocale('en')}
          />
          <Chip
            testID="locale-ar"
            label={t('profile.arabic')}
            selected={active === 'ar'}
            onPress={() => setLocale('ar')}
          />
        </View>
      </Card>
      <Button
        testID="profile-reminders"
        variant="ghost"
        label={t('profile.reminders')}
        onPress={() => router.push('/reminders')}
        style={styles.remindersButton}
      />
      {canResetDemo ? (
        <Button
          testID="dev-demo-reset"
          variant="terracotta"
          label={t('profile.devReset')}
          onPress={resetDemo}
          style={styles.remindersButton}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: typeScale.display,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.heading,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  remindersButton: {
    marginTop: spacing.lg,
  },
});
