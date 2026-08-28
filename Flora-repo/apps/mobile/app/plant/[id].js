import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { unwrap } from '../../src/utils/api.js';
import { zoneAdjustedInterval } from '../../src/utils/watering.js';
import { imageForKey } from '../../src/utils/images.js';
import { Screen } from '../../src/components/Screen.js';
import { Card } from '../../src/components/Card.js';
import { Button } from '../../src/components/Button.js';
import { Field } from '../../src/components/Field.js';
import { WaterChip } from '../../src/components/WaterChip.js';
import { IntervalDial } from '../../src/components/IntervalDial.js';
import { useAuthStore } from '../../src/store/authStore.js';
import { colors, fonts, radii, spacing, typeScale } from '../../src/theme.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const BLURHASH = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4';

function CareCardlet({ icon, iconColor, label, value, testID }) {
  return (
    <Card style={styles.careCard} testID={testID}>
      <Ionicons name={icon} size={18} color={iconColor} />
      <Text style={styles.careLabel}>{label}</Text>
      <Text style={styles.careValue}>{value}</Text>
    </Card>
  );
}

/** Plant detail: hero, care row, watering schedule, mixed timeline + "+ Log" sheet. */
export default function PlantDetailScreen() {
  const { id } = useLocalSearchParams();
  const plantId = String(id);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [note, setNote] = useState('');
  const [logPhoto, setLogPhoto] = useState(null);
  // Watering restarts the cycle and rewrites nextDueAt, and there is no undo.
  // A mis-tap on a scrolling screen should not silently move the schedule.
  const [confirmWater, setConfirmWater] = useState(false);

  const plantQuery = useQuery({
    queryKey: ['plant', plantId],
    queryFn: () => client.plants.get(plantId).then(unwrap),
  });
  const plant = plantQuery.data;

  const speciesQuery = useQuery({
    queryKey: ['species', plant?.speciesId],
    enabled: Boolean(plant?.speciesId),
    queryFn: () => client.species.get(plant.speciesId).then(unwrap),
  });
  const species = speciesQuery.data;
  const interval = species ? zoneAdjustedInterval(species, user?.climateZone) : null;

  const timelineQuery = useInfiniteQuery({
    queryKey: ['timeline', plantId],
    queryFn: ({ pageParam }) =>
      client.plants.timeline(plantId, pageParam ? { cursor: pageParam } : {}).then(unwrap),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const items = timelineQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const watered = useMutation({
    mutationFn: () => client.plants.markWatered(plantId).then(unwrap),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['plant', plantId] });
      const previous = queryClient.getQueryData(['plant', plantId]);
      const days = interval ?? 7;
      queryClient.setQueryData(['plant', plantId], (old) =>
        old
          ? {
              ...old,
              lastWateredAt: new Date().toISOString(),
              nextDueAt: new Date(Date.now() + days * DAY_MS).toISOString(),
            }
          : old,
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(['plant', plantId], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plant', plantId] });
      queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
  });

  const schedule = plant?.schedules?.find((entry) => entry.type === 'WATER');
  const currentDays = schedule?.intervalDays ?? interval ?? 7;
  const intervalMutation = useMutation({
    mutationFn: (days) =>
      client.schedules.create(plantId, { type: 'WATER', intervalDays: days }).then(unwrap),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['plant', plantId] }),
  });
  const displayDays = intervalMutation.isPending ? intervalMutation.variables : currentDays;
  const setInterval = (days) => {
    if (days !== currentDays) intervalMutation.mutate(days);
  };

  const logMutation = useMutation({
    mutationFn: (input) => client.plants.logs.create(plantId, input).then(unwrap),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', plantId] });
      setSheetOpen(false);
      setNote('');
      setLogPhoto(null);
    },
  });

  const pickLogPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) setLogPhoto(result.assets[0].uri);
  };

  const saveLog = () => {
    const payload = {
      ...(logPhoto && { photoKey: logPhoto }),
      ...(note.trim() && { note: note.trim() }),
    };
    logMutation.mutate(payload);
  };

  if (!plant) {
    return <Screen edges={['top', 'bottom']} />;
  }

  const speciesName = species
    ? i18n.language === 'ar' && species.commonNames[1]
      ? species.commonNames[1]
      : (species.commonNames[0] ?? species.scientificName)
    : null;

  const header = (
    <View>
      <Image
        source={imageForKey(plant.photoKey) ?? (plant.photoKey ? { uri: plant.photoKey } : null)}
        placeholder={{ blurhash: BLURHASH }}
        style={styles.hero}
        contentFit="cover"
      />
      <Text style={[styles.nickname, { fontFamily: displayFont }]}>{plant.nickname}</Text>
      {speciesName ? <Text style={styles.speciesName}>{speciesName}</Text> : null}

      <View style={styles.careRow}>
        <CareCardlet
          testID="care-water"
          icon="water-outline"
          iconColor={colors.primary}
          label={t('plantDetail.water')}
          value={interval ? t('plantDetail.everyNDays', { count: interval }) : '—'}
        />
        <CareCardlet
          testID="care-sun"
          icon="sunny-outline"
          iconColor={colors.terracotta}
          label={t('plantDetail.sun')}
          value={species?.care.sun ?? '—'}
        />
        <CareCardlet
          testID="care-temp"
          icon="thermometer-outline"
          iconColor={colors.mutedText}
          label={t('plantDetail.temp')}
          value={species ? `${species.care.tempC.min}–${species.care.tempC.max}°C` : '—'}
        />
      </View>

      <Card style={styles.scheduleCard}>
        <View style={styles.scheduleTop}>
          <WaterChip nextDueAt={plant.nextDueAt} testID="plant-water-chip" />
        </View>
        <IntervalDial testID="interval-dial" value={displayDays} onChange={setInterval} />
        <Button
          testID="mark-watered"
          label={t('plantDetail.wateredToday')}
          onPress={() => setConfirmWater(true)}
          disabled={watered.isPending}
        />
      </Card>

      <View style={styles.timelineHeader}>
        <Text style={[styles.timelineTitle, { fontFamily: displayFont }]}>
          {t('plantDetail.timeline')}
        </Text>
        <Button
          testID="timeline-add-log"
          label={t('plantDetail.addLog')}
          variant="terracotta"
          onPress={() => setSheetOpen(true)}
          style={styles.addLogButton}
        />
      </View>
      {items.length === 0 && !timelineQuery.isLoading ? (
        <Text style={styles.timelineEmpty}>{t('plantDetail.empty')}</Text>
      ) : null}
    </View>
  );

  const renderItem = ({ item }) => {
    if (item.type === 'log') {
      return (
        <Card style={styles.timelineCard} testID={`timeline-log-${item.id}`}>
          {item.photoKey ? (
            <Image
              source={imageForKey(item.photoKey) ?? { uri: item.photoKey }}
              style={styles.logPhoto}
              contentFit="cover"
            />
          ) : null}
          {item.note ? <Text style={styles.logNote}>{item.note}</Text> : null}
          <Text style={styles.itemDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </Card>
      );
    }
    return (
      <Pressable
        testID={`timeline-diagnosis-${item.id}`}
        accessibilityRole="button"
        onPress={() => router.push(`/diagnosis/${item.id}`)}
      >
        <Card
          style={[styles.timelineCard, item.isHealthy ? styles.bannerHealthy : styles.bannerIssue]}
        >
          <View style={styles.bannerRow}>
            <Ionicons
              name={item.isHealthy ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={item.isHealthy ? colors.primary : colors.terracotta}
            />
            <Text style={styles.bannerText}>
              {item.isHealthy
                ? t('plantDetail.healthy')
                : (item.topIssue ?? t('plantDetail.issueFound'))}
            </Text>
          </View>
          <Text style={styles.itemDate}>
            {t('plantDetail.confidence', { percent: Math.round(item.confidence * 100) })} ·{' '}
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </Card>
      </Pressable>
    );
  };

  return (
    <Screen edges={['top', 'bottom']} style={styles.screen}>
      <FlatList
        testID="plant-timeline"
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        ListFooterComponent={
          timelineQuery.hasNextPage ? (
            <Button
              testID="timeline-load-more"
              variant="ghost"
              label={t('plantDetail.loadMore')}
              onPress={() => timelineQuery.fetchNextPage()}
              disabled={timelineQuery.isFetchingNextPage}
            />
          ) : null
        }
      />

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.backdropTouch} onPress={() => setSheetOpen(false)} />
          <View style={styles.sheet}>
            <Text style={[styles.sheetTitle, { fontFamily: displayFont }]}>
              {t('plantDetail.addLog')}
            </Text>
            <Button
              testID="log-photo"
              variant="ghost"
              label={logPhoto ? t('plantDetail.photoAdded') : t('plantDetail.addPhoto')}
              onPress={pickLogPhoto}
              style={styles.sheetItem}
            />
            <Field
              testID="log-note"
              label={t('plantDetail.note')}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <Button
              testID="log-save"
              label={t('plantDetail.saveLog')}
              onPress={saveLog}
              disabled={logMutation.isPending || (!note.trim() && !logPhoto)}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={confirmWater}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmWater(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.backdropTouch} onPress={() => setConfirmWater(false)} />
          <View style={styles.sheet}>
            <Text style={[styles.sheetTitle, { fontFamily: displayFont }]}>
              {t('plantDetail.confirmWaterTitle')}
            </Text>
            <Text testID="confirm-water-body" style={styles.sheetHint}>
              {t('plantDetail.confirmWaterBody', { count: displayDays })}
            </Text>
            <Button
              testID="confirm-water"
              label={t('plantDetail.confirmWater')}
              onPress={() => {
                setConfirmWater(false);
                watered.mutate();
              }}
            />
            <Button
              testID="cancel-water"
              variant="ghost"
              label={t('plantDetail.cancelWater')}
              onPress={() => setConfirmWater(false)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  hero: {
    borderRadius: radii.lg,
    height: 200,
    marginTop: spacing.md,
    width: '100%',
  },
  nickname: {
    color: colors.ink,
    fontSize: typeScale.display,
    marginTop: spacing.md,
  },
  speciesName: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
  },
  careRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  careCard: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  careLabel: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.micro,
    textTransform: 'uppercase',
  },
  careValue: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    textAlign: 'center',
  },
  scheduleCard: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  scheduleTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timelineHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  timelineTitle: {
    color: colors.ink,
    fontSize: typeScale.heading,
  },
  addLogButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  timelineEmpty: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    marginBottom: spacing.md,
  },
  timelineCard: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  logPhoto: {
    borderRadius: radii.md,
    height: 120,
    width: '100%',
  },
  logNote: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
  },
  itemDate: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.micro,
  },
  bannerHealthy: {
    backgroundColor: colors.greenTint,
  },
  bannerIssue: {
    backgroundColor: colors.terracottaTint,
  },
  bannerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bannerText: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.body,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: typeScale.title,
  },
  sheetHint: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    marginBottom: spacing.sm,
  },
  sheetItem: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
