import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { unwrap } from '../../src/utils/api.js';
import { needsWaterToday } from '../../src/utils/watering.js';
import { Screen } from '../../src/components/Screen.js';
import { PlantCard } from '../../src/components/PlantCard.js';
import { Button } from '../../src/components/Button.js';
import { useAuthStore } from '../../src/store/authStore.js';
import { colors, fonts, radii, spacing, typeScale } from '../../src/theme.js';

function greetingKey(hour) {
  if (hour < 12) return 'garden.greetingMorning';
  if (hour < 18) return 'garden.greetingAfternoon';
  return 'garden.greetingEvening';
}

/** Screen 1a: the garden home — greeting, due summary, 2-column plant grid. */
export default function GardenScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const plantsQuery = useQuery({
    queryKey: ['plants'],
    queryFn: () => client.plants.list().then(unwrap),
  });
  const speciesQuery = useQuery({
    queryKey: ['species'],
    queryFn: () => client.species.list().then(unwrap),
  });

  const plants = plantsQuery.data ?? [];
  const speciesById = useMemo(() => {
    const map = new Map();
    for (const species of speciesQuery.data ?? []) map.set(species.id, species);
    return map;
  }, [speciesQuery.data]);

  const speciesName = (plant) => {
    const species = speciesById.get(plant.speciesId);
    if (!species) return null;
    const [en, ar] = species.commonNames;
    return i18n.language === 'ar' && ar ? ar : (en ?? species.scientificName);
  };

  const dueCount = plants.filter((plant) => needsWaterToday(plant.nextDueAt)).length;
  const name = user?.displayName ?? user?.username ?? '';

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={[styles.greeting, { fontFamily: displayFont }]}>
          {t(greetingKey(new Date().getHours()), { name })}
        </Text>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{(name || '?').charAt(0).toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.dueLine}>
        {dueCount > 0 ? t('garden.needWater', { count: dueCount }) : t('garden.allHappy')}
      </Text>
    </View>
  );

  const empty = plantsQuery.isLoading ? null : (
    <View style={styles.empty}>
      <View style={styles.emptyBadge}>
        <Ionicons name="flower-outline" size={64} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { fontFamily: displayFont }]}>{t('garden.emptyTitle')}</Text>
      <Text style={styles.emptyBody}>{t('garden.emptyBody')}</Text>
      <Button
        testID="garden-empty-cta"
        label={t('garden.emptyCta')}
        onPress={() => router.push('/add-plant')}
        style={styles.emptyCta}
      />
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <FlatList
        testID="garden-list"
        data={plants}
        keyExtractor={(plant) => plant.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <PlantCard
            plant={item}
            speciesName={speciesName(item)}
            onPress={() => router.push(`/plant/${item.id}`)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={plantsQuery.isRefetching}
            onRefresh={() => plantsQuery.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
      <Pressable
        testID="garden-fab"
        accessibilityRole="button"
        accessibilityLabel={t('garden.emptyCta')}
        onPress={() => router.push('/add-plant')}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color={colors.cream} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  content: {
    paddingBottom: spacing.xxl * 2,
    paddingHorizontal: spacing.lg,
  },
  column: {
    gap: spacing.md,
  },
  header: {
    marginBottom: spacing.lg,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  greeting: {
    color: colors.ink,
    flex: 1,
    fontSize: typeScale.display,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.greenTint,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarInitial: {
    color: colors.primary,
    fontFamily: fonts.displaySemi,
    fontSize: typeScale.body,
  },
  dueLine: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    marginTop: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyBadge: {
    alignItems: 'center',
    backgroundColor: colors.hairline,
    borderRadius: radii.pill,
    height: 160,
    justifyContent: 'center',
    width: 160,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: typeScale.title,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    lineHeight: 22,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyCta: {
    borderRadius: radii.pill,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    bottom: spacing.lg,
    elevation: 5,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    shadowColor: colors.primaryDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    width: 56,
  },
});
