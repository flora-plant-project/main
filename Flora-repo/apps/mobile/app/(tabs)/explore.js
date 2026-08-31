import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
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

/**
 * Shortest query worth sending to the species database.
 *
 * One character matches most of the kingdom and is measurably the slowest
 * request of the lot — a single-letter query took 3.1s against Plant.id versus
 * a ~150ms median — so it is never worth making.
 */
const MIN_REMOTE_QUERY = 2;

/** Explore: browse the species catalog, search it, and add any species to the garden. */
export default function ExploreScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const [query, setQuery] = useState('');
  /** The query after the debounce — what the two searches actually run on. */
  const [term, setTerm] = useState('');
  /** scientificName currently being adopted, so only that row shows a spinner. */
  const [adopting, setAdopting] = useState(null);
  const [adoptError, setAdoptError] = useState(false);

  const catalogQuery = useQuery({
    queryKey: ['species'],
    queryFn: () => client.species.list().then(unwrap),
  });

  // One debounce feeding both searches, rather than a hand-rolled effect per
  // search: react-query then caches each term, so backspacing to something
  // already typed re-renders from cache instead of hitting the network again.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ['species', 'search', term],
    enabled: term.length > 0,
    queryFn: () => client.species.search(term).then(unwrap),
    // Hold the previous results while the next query is in flight. Without it
    // the list empties on every keystroke and refills a moment later, which
    // reads as flicker rather than as searching.
    placeholderData: (previous) => previous,
  });

  /**
   * The wider species database, queried on EVERY search rather than only when
   * the catalog draws a blank.
   *
   * The catalog is ten curated species plus whatever has been adopted, so
   * limiting search to it meant you could only find plants someone had already
   * found. Both run in parallel and render independently: the catalog answers
   * from Postgres immediately, and these arrive a beat later without holding up
   * the rows that are already on screen.
   */
  const suggestQuery = useQuery({
    queryKey: ['species', 'suggest', term],
    enabled: term.length >= MIN_REMOTE_QUERY,
    queryFn: () => client.species.suggest(term).then(unwrap),
    placeholderData: (previous) => previous,
  });

  const searching = term.length > 0;
  const species = searching ? (searchQuery.data ?? []) : (catalogQuery.data ?? []);
  const suggestions = searching ? (suggestQuery.data ?? []) : [];

  /**
   * Turn a suggestion into a real species, then continue into the add flow.
   *
   * Adoption is the only thing the user waits on here, so the spinner is scoped
   * to the row they tapped rather than blanking the list.
   */
  const adopt = async (suggestion) => {
    if (adopting) return;
    setAdopting(suggestion.scientificName);
    setAdoptError(false);

    const res = await client.species.adopt({
      scientificName: suggestion.scientificName,
      commonNames: suggestion.commonNames ?? [],
    });
    setAdopting(null);

    if (!res.ok) {
      setAdoptError(true);
      return;
    }
    // The catalog gained a row; the next browse must show it.
    catalogQuery.refetch();
    router.push(`/add-plant?speciesId=${res.data.id}`);
  };

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

  /**
   * Species from the wider database, rendered under the catalog results.
   *
   * Visually distinct from a catalog row on purpose: it has no photo and says
   * so in words, because tapping it does more than open a form — it adds a
   * species to the catalog and asks a model to describe it.
   */
  const suggestionFooter =
    suggestions.length > 0 ? (
      <View testID="explore-suggestions" style={styles.suggestions}>
        <Text style={styles.suggestionsHeader}>{t('explore.moreResults')}</Text>
        {adoptError ? (
          <Text testID="explore-adopt-error" style={styles.noResults}>
            {t('explore.adoptFailed')}
          </Text>
        ) : null}
        {suggestions.map((suggestion) => {
          const busy = adopting === suggestion.scientificName;
          return (
            <Card
              key={suggestion.scientificName}
              style={styles.row}
              testID={`explore-suggestion-${suggestion.scientificName}`}
            >
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <Ionicons name="leaf-outline" size={22} color={colors.sage} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>
                  {suggestion.commonNames?.[0] ?? suggestion.scientificName}
                </Text>
                <Text style={styles.rowSci}>{suggestion.scientificName}</Text>
                <Text style={styles.notInCatalog}>{t('explore.notInCatalog')}</Text>
              </View>
              {busy ? (
                <ActivityIndicator testID="explore-adopting" color={colors.primary} />
              ) : (
                <Button
                  testID={`explore-adopt-${suggestion.scientificName}`}
                  label={t('explore.add')}
                  size="sm"
                  disabled={Boolean(adopting)}
                  onPress={() => adopt(suggestion)}
                />
              )}
            </Card>
          );
        })}
      </View>
    ) : null;

  return (
    <Screen style={styles.screen}>
      <FlatList
        testID="explore-list"
        data={species}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          // Nothing to say while either search is still out — a "no results"
          // that appears and then vanishes reads as a bug. isFetching, not
          // isPending: a disabled query (a query too short to send) is pending
          // forever, which would suppress this message rather than delay it.
          searching &&
          !searchQuery.isFetching &&
          !suggestQuery.isFetching &&
          !suggestions.length ? (
            <Text style={styles.noResults}>
              {suggestQuery.isError
                ? t('explore.suggestFailed')
                : t('addPlant.noResults', { query: term })}
            </Text>
          ) : null
        }
        ListFooterComponent={suggestionFooter}
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
                <Ionicons name="sunny-outline" size={12} color={colors.sage} />
                <Text style={styles.careText}>{item.care.sun}</Text>
              </View>
            </View>
            <Button
              testID={`explore-add-${item.id}`}
              label={t('explore.add')}
              size="sm"
              onPress={() => router.push(`/add-plant?speciesId=${item.id}`)}
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
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
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
  suggestions: {
    marginTop: spacing.lg,
  },
  suggestionsHeader: {
    color: colors.sage,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.micro,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  photoPlaceholder: {
    alignItems: 'center',
    // A suggestion has no photo of its own — the catalog has never seen it.
    backgroundColor: colors.chipFill,
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: 'center',
  },
  notInCatalog: {
    color: colors.sage,
    fontFamily: fonts.body,
    fontSize: typeScale.micro,
    marginTop: spacing.xs,
  },
  row: {
    alignItems: 'center',
    borderRadius: radii.card,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  photo: {
    borderRadius: radii.badge,
    height: 56,
    width: 56,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: typeScale.body,
  },
  rowSci: {
    color: colors.sage,
    fontFamily: fonts.body,
    fontSize: typeScale.micro,
  },
  careLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  careText: {
    color: colors.chipText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.chip,
    marginRight: spacing.sm,
  },
});
