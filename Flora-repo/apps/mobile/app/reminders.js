import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { client } from '../src/api/index.js';
import { unwrap } from '../src/utils/api.js';
import { scheduleWatering } from '../src/notifications/local.js';
import { Screen } from '../src/components/Screen.js';
import { Card } from '../src/components/Card.js';
import { Button } from '../src/components/Button.js';
import { colors, fonts, radii, spacing, typeScale } from '../src/theme.js';

/** Upcoming watering reminders, soonest first. Rows deep-link into the plant. */
export default function RemindersScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;
  const isMock = (process.env.EXPO_PUBLIC_API_MODE ?? 'mock') === 'mock';

  const plantsQuery = useQuery({
    queryKey: ['plants'],
    queryFn: () => client.plants.list().then(unwrap),
  });
  const remindersQuery = useQuery({
    queryKey: ['reminders'],
    queryFn: () => Notifications.getAllScheduledNotificationsAsync(),
  });

  const plantById = new Map((plantsQuery.data ?? []).map((plant) => [plant.id, plant]));
  const rows = (remindersQuery.data ?? [])
    .map((entry) => ({
      id: entry.identifier,
      plantId: entry.content?.data?.plantId,
      at: entry.content?.data?.at,
      title: entry.content?.title,
    }))
    .filter((row) => row.plantId && row.at)
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  const remindInTwoMinutes = async () => {
    const plant = (plantsQuery.data ?? [])[0];
    if (!plant) return;
    await scheduleWatering({
      plantId: plant.id,
      nickname: plant.nickname,
      at: new Date(Date.now() + 2 * 60 * 1000),
    });
    remindersQuery.refetch();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Text style={[styles.title, { fontFamily: displayFont }]}>{t('reminders.title')}</Text>
      {rows.length === 0 && !remindersQuery.isLoading ? (
        <Text style={styles.empty}>{t('reminders.empty')}</Text>
      ) : null}
      {rows.map((row) => (
        <Pressable
          key={row.id}
          testID={`reminder-${row.plantId}`}
          accessibilityRole="button"
          onPress={() => router.push(`/plant/${row.plantId}`)}
        >
          <Card style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="water-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowName}>
                {plantById.get(row.plantId)?.nickname ?? row.title}
              </Text>
              <Text style={styles.rowTime}>{new Date(row.at).toLocaleString()}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.sage} />
          </Card>
        </Pressable>
      ))}
      {isMock ? (
        <Button
          testID="dev-remind-2m"
          variant="dark"
          label={t('reminders.devRemind')}
          onPress={remindInTwoMinutes}
          style={styles.devButton}
        />
      ) : null}
      <Button
        variant="ghost"
        label={t('camera.close')}
        onPress={() => router.back()}
        style={styles.closeButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  empty: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    marginBottom: spacing.lg,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: colors.greenTint,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.body,
  },
  rowTime: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginTop: 2,
  },
  devButton: {
    marginTop: spacing.md,
  },
  closeButton: {
    marginTop: spacing.sm,
  },
});
