import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { unwrap } from '../../src/utils/api.js';
import { needsWaterToday, waterStatus } from '../../src/utils/watering.js';
import { PLACEMENTS, placementFor } from '../../src/utils/placement.js';
import { Screen } from '../../src/components/Screen.js';
import { PlantCard } from '../../src/components/PlantCard.js';
import { SegmentedFilter } from '../../src/components/SegmentedFilter.js';
import { TodayCard } from '../../src/components/TodayCard.js';
import { EmptyGardenArt } from '../../src/components/EmptyGardenArt.js';
import { Button } from '../../src/components/Button.js';
import { useAuthStore } from '../../src/store/authStore.js';
import { colors, fonts, radii, spacing, typeScale } from '../../src/theme.js';

/** Screen 3a: app bar, segmented filters, today's tasks, 2-column plant grid. */
export default function GardenScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const [filter, setFilter] = useState('all');
  // Tasks stay on the card once checked off, even though watering pushes the
  // plant's nextDueAt into the future and out of the "due today" set.
  const [doneIds, setDoneIds] = useState(() => []);

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
  const placementOf = (plant) => placementFor(speciesById.get(plant.speciesId));

  const watered = useMutation({
    mutationFn: (plantId) => client.plants.markWatered(plantId).then(unwrap),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['plants'] }),
  });

  const toggleTask = (plantId) => {
    if (doneIds.includes(plantId)) return; // watering is not undoable from here
    setDoneIds((current) => [...current, plantId]);
    watered.mutate(plantId);
  };

  const tasks = plants
    .filter((plant) => needsWaterToday(plant.nextDueAt) || doneIds.includes(plant.id))
    .map((plant) => {
      const subtitleParts = [speciesName(plant), t(`garden.filters.${placementOf(plant)}`)];
      return {
        id: plant.id,
        title: t('garden.taskWater', { name: plant.nickname }),
        subtitle: subtitleParts.filter(Boolean).join(' · '),
        meta:
          waterStatus(plant.nextDueAt).key === 'waterNow' ? t('garden.now') : t('garden.dueToday'),
        done: doneIds.includes(plant.id),
      };
    });

  const visiblePlants =
    filter === 'all' ? plants : plants.filter((plant) => placementOf(plant) === filter);

  const initial = (user?.displayName ?? user?.username ?? '?').charAt(0).toUpperCase();
  const isEmpty = plants.length === 0 && !plantsQuery.isLoading;

  const appBar = (
    <View style={[styles.appBar, isEmpty && styles.appBarEmpty]}>
      <View style={styles.appBarRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { fontFamily: displayFont }]}>{t('garden.title')}</Text>
          <Text style={styles.subtitle}>
            {isEmpty
              ? t('garden.nothingPlanted')
              : `${t('garden.plantCount', { count: plants.length })} · ${t('garden.city')}`}
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      </View>
      {isEmpty ? null : (
        <SegmentedFilter
          options={PLACEMENTS.map((key) => ({ key, label: t(`garden.filters.${key}`) }))}
          value={filter}
          onChange={setFilter}
          testIDPrefix="garden-filter"
        />
      )}
    </View>
  );

  if (isEmpty) {
    return (
      <Screen style={styles.screen} topColor={colors.surface}>
        {appBar}
        <ScrollView contentContainerStyle={styles.emptyScroll}>
          <View style={styles.empty}>
            <EmptyGardenArt />
            <Text style={[styles.emptyTitle, { fontFamily: displayFont }]}>
              {t('garden.emptyTitle')}
            </Text>
            <Text style={styles.emptyBody}>{t('garden.emptyBody')}</Text>
            <Button
              testID="garden-empty-cta"
              icon="camera-outline"
              label={t('garden.emptyPhoto')}
              onPress={() => router.push('/add-plant?tab=photo')}
              style={styles.emptyPrimary}
            />
            <Button
              testID="garden-empty-search"
              variant="secondary"
              label={t('garden.emptySearch')}
              onPress={() => router.push('/add-plant')}
              style={styles.emptySecondary}
            />
            <Text
              testID="garden-empty-popular"
              accessibilityRole="link"
              onPress={() => router.push('/explore')}
              style={styles.emptyLink}
            >
              {t('garden.emptyPopular')}
            </Text>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const listHeader = (
    <View>
      {tasks.length > 0 ? (
        <View style={styles.todayWrap}>
          <TodayCard tasks={tasks} onToggle={toggleTask} />
        </View>
      ) : null}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('garden.allPlants')}</Text>
        <Text
          testID="garden-add-plant"
          accessibilityRole="link"
          onPress={() => router.push('/add-plant')}
          style={styles.sectionAction}
        >
          {t('garden.addPlant')}
        </Text>
      </View>
    </View>
  );

  return (
    <Screen style={styles.screen} topColor={colors.surface}>
      {appBar}
      <FlatList
        testID="garden-list"
        data={visiblePlants}
        keyExtractor={(plant) => plant.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        ListHeaderComponent={listHeader}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  appBar: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.page,
    paddingTop: spacing.sm,
  },
  appBarEmpty: {
    paddingBottom: 18,
  },
  appBarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.display,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginTop: 2,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.greenTint,
    borderColor: colors.greenTintBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarInitial: {
    color: colors.primaryDeep,
    fontFamily: fonts.display,
    fontSize: 15,
  },
  content: {
    paddingBottom: spacing.xxl * 2,
    paddingHorizontal: spacing.page,
  },
  column: {
    gap: spacing.md,
  },
  todayWrap: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 11,
    paddingTop: spacing.page,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: typeScale.caption,
  },
  sectionAction: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
  },
  emptyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    marginTop: -20,
    paddingHorizontal: 36,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: typeScale.title,
    letterSpacing: -0.2,
    marginTop: 22,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption + 0.5,
    lineHeight: 21,
    marginTop: spacing.sm,
    maxWidth: 268,
    textAlign: 'center',
  },
  emptyPrimary: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    maxWidth: 300,
    width: '100%',
  },
  emptySecondary: {
    alignSelf: 'stretch',
    marginTop: 10,
    maxWidth: 300,
    width: '100%',
  },
  emptyLink: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
    marginTop: spacing.lg,
  },
});
