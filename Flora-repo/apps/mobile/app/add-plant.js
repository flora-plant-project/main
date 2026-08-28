import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { client } from '../src/api/index.js';
import { unwrap } from '../src/utils/api.js';
import { Screen } from '../src/components/Screen.js';
import { Card } from '../src/components/Card.js';
import { Button } from '../src/components/Button.js';
import { Field } from '../src/components/Field.js';
import { colors, fonts, radii, spacing, typeScale } from '../src/theme.js';

const SEARCH_DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 45; // 45 × 2s = 90s budget for the identification service

/** Add-plant flow: search-by-name or identify-by-photo, then a confirm step. */
export default function AddPlantScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const [tab, setTab] = useState('search');
  const [picked, setPicked] = useState(null); // { speciesId, commonName, scientificName }

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  const [photoUri, setPhotoUri] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | analyzing | suggestions | timeout
  const [suggestions, setSuggestions] = useState([]);
  const pollTimer = useRef(null);

  // The scan this plant came from, from either entry point: a deep link out of
  // the camera flow, or the identify-by-photo tab below. Attached to the plant
  // once it exists, which is what carries the health findings and the care plan
  // onto its timeline. Without it the scan is orphaned and unreachable.
  const [diagnosisId, setDiagnosisId] = useState(null);

  const [nickname, setNickname] = useState('');
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  // Deep link from the diagnose flow: /add-plant?speciesId=…&photoUri=… lands
  // straight on the confirm step with the species preselected.
  const params = useLocalSearchParams();
  useEffect(() => {
    const speciesId =
      typeof params.speciesId === 'string' && params.speciesId ? params.speciesId : null;
    if (!speciesId || picked) return undefined;
    let cancelled = false;
    (async () => {
      const res = await client.species.get(speciesId);
      if (cancelled || !res.ok) return;
      if (typeof params.photoUri === 'string' && params.photoUri) setPhotoUri(params.photoUri);
      if (typeof params.diagnosisId === 'string' && params.diagnosisId) {
        setDiagnosisId(params.diagnosisId);
      }
      pick({
        speciesId,
        commonName: localName(res.data.commonNames, res.data.scientificName),
        scientificName: res.data.scientificName,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [params.speciesId]);

  // 300ms debounced species search
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

  const localName = (commonNames, scientificName) => {
    const [en, ar] = commonNames ?? [];
    return i18n.language === 'ar' && ar ? ar : (en ?? scientificName);
  };

  const pick = (species) => {
    setPicked(species);
    setNickname(species.commonName);
    setError(null);
  };

  const poll = (diagnosisId, attempts) => {
    pollTimer.current = setTimeout(async () => {
      const res = await client.diagnoses.get(diagnosisId);
      if (res.ok && res.data.status === 'COMPLETE') {
        setSuggestions(res.data.result.species);
        setPhase('suggestions');
        return;
      }
      if (attempts + 1 >= MAX_POLLS) {
        setPhase('timeout');
        return;
      }
      poll(diagnosisId, attempts + 1);
    }, POLL_INTERVAL_MS);
  };

  const startDiagnosis = async (uri) => {
    setPhotoUri(uri);
    setPhase('analyzing');
    setSuggestions([]);
    const created = await client.diagnoses.create({ imageUri: uri, mode: 'identify' });
    if (!created.ok) {
      setPhase('timeout');
      return;
    }
    // Remembered so the finished scan follows the plant onto its timeline —
    // previously this id lived only in the poll closure and was lost on save.
    setDiagnosisId(created.data.id);
    poll(created.data.id, 0);
  };

  const pickImage = async (fromCamera) => {
    if (fromCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) startDiagnosis(result.assets[0].uri);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      nickname: nickname.trim(),
      ...(picked.speciesId && { speciesId: picked.speciesId }),
      ...(photoUri && { photoKey: photoUri }),
    };
    const created = await client.plants.create(payload);
    if (!created.ok) {
      setSaving(false);
      setError(created.error.message);
      return;
    }
    if (autoSchedule) {
      await client.schedules.create(created.data.id, { type: 'WATER' });
    }
    if (diagnosisId) {
      // Best effort: the plant exists and is on the dashboard either way. A
      // failed attach costs the scan's history, not the plant, so it must not
      // turn a successful save into an error the user has to act on.
      const attached = await client.diagnoses.attach(diagnosisId, created.data.id);
      if (attached.ok) {
        queryClient.invalidateQueries({ queryKey: ['timeline', created.data.id] });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['plants'] });
    // Deep links land here with no history — fall back to the garden.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const careQuery = useQuery({
    queryKey: ['species', picked?.speciesId],
    enabled: Boolean(picked?.speciesId),
    queryFn: () => client.species.get(picked.speciesId).then(unwrap),
  });
  const care = careQuery.data?.care;

  if (picked) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Text style={[styles.title, { fontFamily: displayFont }]}>
          {t('addPlant.confirmTitle')}
        </Text>
        <Card style={styles.block}>
          <Text style={styles.rowName}>{picked.commonName}</Text>
          <Text style={styles.rowSci}>{picked.scientificName}</Text>
        </Card>
        <Field
          testID="confirm-nickname"
          label={t('addPlant.nickname')}
          value={nickname}
          onChangeText={setNickname}
        />
        {care ? (
          <Card style={styles.block}>
            <Text style={styles.careTitle}>{t('addPlant.carePreview')}</Text>
            <View style={styles.careLine}>
              <Ionicons name="water-outline" size={15} color={colors.primary} />
              <Text style={styles.careText}>
                {t('addPlant.waterEvery', { count: care.waterEveryDays })}
              </Text>
            </View>
            <View style={styles.careLine}>
              <Ionicons name="sunny-outline" size={15} color={colors.terracotta} />
              <Text style={styles.careText}>{care.sun}</Text>
            </View>
            <View style={styles.careLine}>
              <Ionicons name="thermometer-outline" size={15} color={colors.mutedText} />
              <Text style={styles.careText}>
                {t('addPlant.tempRange', { min: care.tempC.min, max: care.tempC.max })}
              </Text>
            </View>
          </Card>
        ) : null}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('addPlant.autoSchedule')}</Text>
          <Switch
            testID="confirm-auto-schedule"
            value={autoSchedule}
            onValueChange={setAutoSchedule}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.cream}
          />
        </View>
        {error ? (
          <Text testID="confirm-error" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Button
          testID="confirm-save"
          label={t('addPlant.save')}
          onPress={save}
          disabled={saving || !nickname.trim()}
        />
        <Button
          variant="ghost"
          label={t('addPlant.back')}
          onPress={() => setPicked(null)}
          style={styles.ghostButton}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Text style={[styles.title, { fontFamily: displayFont }]}>{t('addPlant.title')}</Text>
      <View style={styles.segment}>
        <Pressable
          testID="tab-search"
          accessibilityRole="button"
          onPress={() => setTab('search')}
          style={[styles.segmentBtn, tab === 'search' && styles.segmentActive]}
        >
          <Text style={[styles.segmentLabel, tab === 'search' && styles.segmentLabelActive]}>
            {t('addPlant.tabSearch')}
          </Text>
        </Pressable>
        <Pressable
          testID="tab-photo"
          accessibilityRole="button"
          onPress={() => setTab('photo')}
          style={[styles.segmentBtn, tab === 'photo' && styles.segmentActive]}
        >
          <Text style={[styles.segmentLabel, tab === 'photo' && styles.segmentLabelActive]}>
            {t('addPlant.tabPhoto')}
          </Text>
        </Pressable>
      </View>

      {tab === 'search' ? (
        <View style={styles.body}>
          <TextInput
            testID="species-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder={t('addPlant.searchPlaceholder')}
            placeholderTextColor={colors.sage}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {results?.map((species) => (
            <Pressable
              key={species.id}
              testID={`species-row-${species.id}`}
              accessibilityRole="button"
              onPress={() =>
                pick({
                  speciesId: species.id,
                  commonName: localName(species.commonNames, species.scientificName),
                  scientificName: species.scientificName,
                })
              }
            >
              <Card style={styles.row}>
                <Text style={styles.rowName}>
                  {localName(species.commonNames, species.scientificName)}
                </Text>
                <Text style={styles.rowSci}>{species.scientificName}</Text>
              </Card>
            </Pressable>
          ))}
          {results && results.length === 0 ? (
            <Text style={styles.noResults}>{t('addPlant.noResults', { query: query.trim() })}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.body}>
          {phase === 'idle' ? (
            <>
              <Button
                testID="photo-camera"
                label={t('addPlant.takePhoto')}
                onPress={() => pickImage(true)}
              />
              <Button
                testID="photo-library"
                variant="ghost"
                label={t('addPlant.chooseFromLibrary')}
                onPress={() => pickImage(false)}
                style={styles.ghostButton}
              />
            </>
          ) : null}
          {phase === 'analyzing' ? (
            <View testID="diagnosis-progress" style={styles.progress}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.progressTitle}>{t('addPlant.analyzing')}</Text>
              <Text style={styles.progressHint}>{t('addPlant.analyzingHint')}</Text>
            </View>
          ) : null}
          {phase === 'suggestions' ? (
            <>
              <Text style={styles.suggestionsTitle}>{t('addPlant.suggestionsTitle')}</Text>
              {suggestions.map((candidate, index) => (
                <Pressable
                  key={candidate.speciesId ?? `unknown-${index}`}
                  testID={`suggestion-${candidate.speciesId ?? index}`}
                  accessibilityRole="button"
                  disabled={!candidate.speciesId}
                  onPress={() =>
                    pick({
                      speciesId: candidate.speciesId,
                      commonName: localName(candidate.commonNames, candidate.scientificName),
                      scientificName: candidate.scientificName,
                    })
                  }
                >
                  <Card style={[styles.row, !candidate.speciesId && styles.rowDisabled]}>
                    <Text style={styles.rowName}>
                      {localName(candidate.commonNames, candidate.scientificName)}
                    </Text>
                    <Text style={styles.rowSci}>{candidate.scientificName}</Text>
                    <Text style={styles.match}>
                      {t('addPlant.match', { percent: Math.round(candidate.probability * 100) })}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : null}
          {phase === 'timeout' ? (
            <Card style={styles.block}>
              <Text style={styles.rowName}>{t('addPlant.timeoutTitle')}</Text>
              <Text style={styles.rowSci}>{t('addPlant.timeoutBody')}</Text>
              <Button
                testID="diagnosis-retry"
                label={t('addPlant.retry')}
                onPress={() => startDiagnosis(photoUri)}
                style={styles.retryButton}
              />
            </Card>
          ) : null}
        </View>
      )}

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
  segment: {
    backgroundColor: colors.greenTint,
    borderRadius: radii.pill,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: spacing.xs,
  },
  segmentBtn: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentLabel: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
  },
  segmentLabelActive: {
    color: colors.cream,
  },
  body: {
    flex: 1,
  },
  searchInput: {
    backgroundColor: colors.cream,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowDisabled: {
    opacity: 0.5,
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
    marginTop: 2,
  },
  match: {
    color: colors.primary,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    marginTop: spacing.xs,
  },
  noResults: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  progress: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  progressTitle: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.body,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  progressHint: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginTop: spacing.xs,
  },
  suggestionsTitle: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.heading,
    marginBottom: spacing.md,
  },
  block: {
    marginBottom: spacing.lg,
  },
  careTitle: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  careLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  careText: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  switchLabel: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.body,
    marginRight: spacing.md,
  },
  error: {
    color: colors.terracotta,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginBottom: spacing.md,
  },
  retryButton: {
    marginTop: spacing.md,
  },
  ghostButton: {
    marginTop: spacing.sm,
  },
  closeButton: {
    marginBottom: spacing.md,
  },
});
