import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { unwrap } from '../../src/utils/api.js';
import { imageForSpecies } from '../../src/utils/images.js';
import { zoneAdjustedInterval } from '../../src/utils/watering.js';
import { Screen } from '../../src/components/Screen.js';
import { Card } from '../../src/components/Card.js';
import { Button } from '../../src/components/Button.js';
import { useAuthStore } from '../../src/store/authStore.js';
import { colors, fonts, radii, spacing, typeScale } from '../../src/theme.js';

const SEARCH_DEBOUNCE_MS = 300;

/** Explore: browse the species catalog, search it, and add any species to the garden. */
export default function ExploreScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  const catalogQuery = useQuery({
    queryKey: ['species'],
    queryFn: () => client.species.list().then(unwrap),
  });

  // 300ms debounced search; empty query falls back to the full catalog
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const res = await client.species.search(trimmed);
      if (res.ok) setResults(res.data);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const species = results ?? catalogQuery.data ?? [];

  const localName = (commonNames, scientificName) => {
    const [en, ar] = commonNames ?? [];
    return i18n.language === 'ar' && ar ? ar : (en ?? scientificName);
  };

  const header = (
    <View style={styles.header}>
      <Text style={[styles.title, { fontFamily: displayFont }]}>{t('explore.title')}</Text>
      <TextInput
        testID="explore-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('explore.searchPlaceholder')}
        placeholderTextColor={colors.sage}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.searchInput}
      />
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <FlatList
        testID="explore-list"
        data={species}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          !catalogQuery.isLoading && query.trim() ? (
            <Text style={styles.noResults}>{t('addPlant.noResults', { query: query.trim() })}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Card style={styles.row} testID={`explore-row-${item.id}`}>
            <Image
              source={imageForSpecies(item.id)}
              style={styles.photo}
              contentFit="cover"
              transition={150}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowName}>{localName(item.commonNames, item.scientificName)}</Text>
              <Text style={styles.rowSci}>{item.scientificName}</Text>
              <View style={styles.careLine}>
                <Ionicons name="water-outline" size={12} color={colors.primary} />
                <Text style={styles.careText}>
                  {t('plantDetail.everyNDays', {
                    count: zoneAdjustedInterval(item, user?.climateZone),
                  })}
                </Text>
                <Ionicons name="sunny-outline" size={12} color={colors.terracotta} />
                <Text style={styles.careText}>{item.care.sun}</Text>
              </View>
            </View>
            <Button
              testID={`explore-add-${item.id}`}
              label={t('explore.add')}
              onPress={() => router.push(`/add-plant?speciesId=${item.id}`)}
              style={styles.addButton}
            />
          </Card>
        )}
      />
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
  header: {
    marginBottom: spacing.md,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.display,
    marginBottom: spacing.md,
  },
  searchInput: {
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
  noResults: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  photo: {
    borderRadius: radii.md,
    height: 56,
    width: 56,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.body,
  },
  rowSci: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
  },
  careLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  careText: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.micro,
    marginRight: spacing.sm,
  },
  addButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
