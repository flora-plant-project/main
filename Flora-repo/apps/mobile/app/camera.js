import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { client } from '../src/api/index.js';
import { unwrap } from '../src/utils/api.js';
import { zoneAdjustedInterval } from '../src/utils/watering.js';
import { Screen } from '../src/components/Screen.js';
import { Card } from '../src/components/Card.js';
import { Button } from '../src/components/Button.js';
import { Field } from '../src/components/Field.js';
import { Reveal } from '../src/components/Reveal.js';
import { useAuthStore } from '../src/store/authStore.js';
import { colors, fonts, radii, spacing, typeScale } from '../src/theme.js';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 45; // 90s budget
const PROGRESS_ROTATE_MS = 2500;
const FIXTURES = ['healthy-basil', 'diseased-tomato', 'blurry'];

/** Camera modal: capture or pick → diagnose/identify → result card (design 1d). */
export default function CameraModal() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const plantId = typeof params.plantId === 'string' && params.plantId ? params.plantId : null;
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState(plantId ? 'health' : 'identify');
  const [phase, setPhase] = useState('camera'); // camera | analyzing | result | failed
  const [imageUri, setImageUri] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [failureMessage, setFailureMessage] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedTo, setSavedTo] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askBody, setAskBody] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [fixtureIndex, setFixtureIndex] = useState(0);
  const cameraRef = useRef(null);
  const pollTimer = useRef(null);

  const isMock =
    (process.env.EXPO_PUBLIC_API_MODE ?? 'mock') === 'mock' &&
    typeof client.setNextDiagnosisFixture === 'function';

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission, requestPermission]);

  // rotating progress copy while analyzing
  useEffect(() => {
    if (phase !== 'analyzing') return undefined;
    const timer = setInterval(
      () => setProgressIndex((index) => (index + 1) % 2),
      PROGRESS_ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [phase]);

  const poll = (id, attempts) => {
    pollTimer.current = setTimeout(async () => {
      const res = await client.diagnoses.get(id);
      if (!res.ok || res.data.status === 'FAILED') {
        // The server reports why on the row itself; surface it so a bad API key
        // or an unreachable host is diagnosable from the phone.
        setFailureMessage(res.ok ? (res.data.error?.message ?? null) : res.error.message);
        setPhase('failed');
        return;
      }
      if (res.data.status === 'COMPLETE') {
        setDiagnosis(res.data);
        setPhase('result');
        return;
      }
      if (attempts + 1 >= MAX_POLLS) {
        setPhase('failed');
        return;
      }
      poll(id, attempts + 1);
    }, POLL_INTERVAL_MS);
  };

  // The mock reads photos by URI; the live scanner needs the bytes. Only ask the
  // camera for base64 when it will actually be sent — decoding a full-size photo
  // to a string is not free, and the offline demo never needs it.
  const needsBytes = client.sendsImageBytes === true;

  const analyze = async (uri, base64) => {
    setImageUri(uri);
    setImageBase64(base64 ?? null);
    setPhase('analyzing');
    setDiagnosis(null);
    setSavedTo(null);
    const created = await client.diagnoses.create({
      imageUri: uri,
      ...(base64 && { imageBase64: base64 }),
      mode,
      ...(plantId && { plantId }),
    });
    if (!created.ok) {
      setFailureMessage(created.error.message);
      setPhase('failed');
      return;
    }
    setFailureMessage(null);
    poll(created.data.id, 0);
  };

  const capture = async () => {
    const photo = await cameraRef.current?.takePictureAsync?.({
      quality: 0.8,
      base64: needsBytes,
    });
    if (photo?.uri) analyze(photo.uri, photo.base64);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: needsBytes,
    });
    if (!result.canceled && result.assets?.[0]) {
      analyze(result.assets[0].uri, result.assets[0].base64);
    }
  };

  const cycleFixture = () => {
    const next = (fixtureIndex + 1) % FIXTURES.length;
    setFixtureIndex(next);
    client.setNextDiagnosisFixture(FIXTURES[next]);
  };

  const plantsQuery = useQuery({
    queryKey: ['plants'],
    queryFn: () => client.plants.list().then(unwrap),
    enabled: saveOpen,
  });

  const result = diagnosis?.result;
  const candidates = result?.species ?? [];
  const topCandidate = candidates[0] ?? null;
  const issues = result?.health?.issues ?? [];
  const topIssue = issues[0] ?? null;
  const isHealthy = result?.health?.isHealthy ?? false;

  const waterSpeciesQuery = useQuery({
    queryKey: ['species', topCandidate?.speciesId],
    enabled: phase === 'result' && Boolean(topCandidate?.speciesId),
    queryFn: () => client.species.get(topCandidate.speciesId).then(unwrap),
  });
  const waterDays = waterSpeciesQuery.data
    ? zoneAdjustedInterval(waterSpeciesQuery.data, user?.climateZone)
    : null;

  const attach = async (targetPlantId) => {
    const res = await client.diagnoses.attach(diagnosis.id, targetPlantId);
    if (res.ok) {
      setSavedTo(targetPlantId);
      setSaveOpen(false);
      queryClient.invalidateQueries({ queryKey: ['timeline', targetPlantId] });
    }
  };

  /**
   * Draft the help post, then show it for review.
   *
   * Nothing is posted here. The draft is written from the diagnosis the user is
   * already looking at, and it goes out only once they have read it and pressed
   * post — their name is on it. A drafting failure is not a dead end: the sheet
   * still opens, with the plain fallback wording to edit.
   */
  const askCommunity = async () => {
    setAskOpen(true);
    setDrafting(true);
    const res = await client.posts.draft({ diagnosis: diagnosis?.result ?? null });
    setDrafting(false);
    if (res.ok) setAskBody(res.data.body);
  };

  const postToCommunity = async () => {
    setAsking(true);
    const res = await client.diagnoses.escalate(diagnosis.id, { body: askBody.trim() });
    setAsking(false);
    setAskOpen(false);
    if (res.ok) router.push(`/post/${res.data.id}`);
  };

  /**
   * Finish a scan.
   *
   * A scan is about a plant, so ending one lands on that plant's page rather
   * than dropping the user back where they started. `savedTo` covers the scan
   * they just attached; `plantId` covers a scan launched from a plant in the
   * first place. With neither there is no plant to show — the scan was a
   * one-off lookup — so fall back to going back.
   */
  const finish = () => {
    const target = savedTo ?? plantId;
    if (target) {
      // A scan launched from a plant is attached at creation and never passes
      // through `attach`, so nothing has invalidated its timeline yet. Without
      // this the plant page can open on a cached list missing the scan that
      // was just run.
      queryClient.invalidateQueries({ queryKey: ['timeline', target] });
      router.replace(`/plant/${target}`);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const goToNewPlant = () => {
    setSaveOpen(false);
    const query = [
      topCandidate?.speciesId ? `speciesId=${topCandidate.speciesId}` : null,
      imageUri ? `photoUri=${encodeURIComponent(imageUri)}` : null,
      // Carries the scan itself — health findings and care plan included — so
      // the new plant keeps them instead of starting with an empty timeline.
      diagnosis?.id ? `diagnosisId=${diagnosis.id}` : null,
    ]
      .filter(Boolean)
      .join('&');
    router.push(`/add-plant${query ? `?${query}` : ''}`);
  };

  const localName = (commonNames, scientificName) => {
    const [en, ar] = commonNames ?? [];
    return i18n.language === 'ar' && ar ? ar : (en ?? scientificName);
  };

  const devChip = isMock ? (
    <Pressable testID="dev-fixture" onPress={cycleFixture} style={styles.devChip}>
      <Text style={styles.devChipText}>
        {t('diagnose.devFixture', { name: FIXTURES[fixtureIndex] })}
      </Text>
    </Pressable>
  ) : null;

  if (phase === 'camera') {
    return (
      <View style={styles.cameraScreen}>
        {permission?.granted ? (
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        ) : (
          <View style={styles.camera} />
        )}
        {devChip}
        <View style={styles.modeRow}>
          <Pressable
            testID="mode-identify"
            accessibilityRole="button"
            onPress={() => setMode('identify')}
            style={[styles.modeBtn, mode === 'identify' && styles.modeActive]}
          >
            <Text style={[styles.modeLabel, mode === 'identify' && styles.modeLabelActive]}>
              {t('diagnose.identify')}
            </Text>
          </Pressable>
          <Pressable
            testID="mode-health"
            accessibilityRole="button"
            onPress={() => setMode('health')}
            style={[styles.modeBtn, mode === 'health' && styles.modeActive]}
          >
            <Text style={[styles.modeLabel, mode === 'health' && styles.modeLabelActive]}>
              {t('diagnose.diagnose')}
            </Text>
          </Pressable>
        </View>
        <View style={styles.controls}>
          <Pressable
            testID="diagnose-gallery"
            accessibilityRole="button"
            accessibilityLabel={t('diagnose.gallery')}
            onPress={pickFromGallery}
            style={styles.controlBtn}
          >
            <Ionicons name="images-outline" size={24} color={colors.cream} />
          </Pressable>
          <Pressable
            testID="diagnose-capture"
            accessibilityRole="button"
            accessibilityLabel={t('diagnose.diagnose')}
            onPress={capture}
            style={styles.captureBtn}
          >
            <View style={styles.captureInner} />
          </Pressable>
          <Pressable
            testID="diagnose-close"
            accessibilityRole="button"
            accessibilityLabel={t('camera.close')}
            onPress={() => router.back()}
            style={styles.controlBtn}
          >
            <Ionicons name="chevron-down" size={26} color={colors.cream} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'analyzing') {
    return (
      <Screen edges={['top', 'bottom']}>
        {devChip}
        <View testID="diagnose-progress" style={styles.progressWrap}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.progressPhoto} contentFit="cover" />
          ) : null}
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.progressText}>
            {t(progressIndex === 0 ? 'diagnose.progress1' : 'diagnose.progress2')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (phase === 'failed') {
    return (
      <Screen edges={['top', 'bottom']}>
        <View testID="diagnose-failed" style={styles.failedWrap}>
          <Ionicons name="rainy-outline" size={48} color={colors.mutedText} />
          <Text style={[styles.failedTitle, { fontFamily: displayFont }]}>
            {t('diagnose.failedTitle')}
          </Text>
          <Text style={styles.failedBody}>{t('diagnose.failedBody')}</Text>
          {failureMessage ? (
            <Text testID="diagnose-failed-detail" style={styles.failedDetail}>
              {failureMessage}
            </Text>
          ) : null}
          <Button
            testID="diagnose-retry"
            label={t('diagnose.retry')}
            onPress={() => analyze(imageUri, imageBase64)}
            style={styles.failedRetry}
          />
          <Button variant="ghost" label={t('diagnose.done')} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  // result
  return (
    <Screen edges={['top', 'bottom']} style={styles.resultScreen}>
      <ScrollView contentContainerStyle={styles.resultContent}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: imageUri }} style={styles.heroPhoto} contentFit="cover" />
          {topCandidate ? (
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>
                {localName(topCandidate.commonNames, topCandidate.scientificName)}
              </Text>
            </View>
          ) : null}
        </View>

        <Card
          testID="verdict-banner"
          style={[styles.banner, isHealthy ? styles.bannerHealthy : styles.bannerIssue]}
        >
          <View style={[styles.bannerBadge, isHealthy ? styles.badgeHealthy : styles.badgeIssue]}>
            <Ionicons name={isHealthy ? 'checkmark' : 'alert'} size={18} color={colors.cream} />
          </View>
          <View style={styles.bannerTextWrap}>
            <Text style={[styles.bannerTitle, { fontFamily: displayFont }]}>
              {isHealthy ? t('diagnose.healthyTitle') : t('diagnose.needsCare')}
            </Text>
            <Text style={styles.bannerSub}>
              {isHealthy ? t('diagnose.healthySub') : (topIssue?.name ?? t('diagnose.needsCare'))}
            </Text>
          </View>
        </Card>

        {diagnosis?.lowConfidence ? (
          <Text testID="low-confidence-note" style={styles.lowConfidence}>
            {t('diagnose.lowConfidenceNote')}
          </Text>
        ) : null}

        {mode === 'identify' && candidates.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>{t('diagnose.suggestions')}</Text>
            {candidates.map((candidate, index) => (
              <Pressable
                key={candidate.speciesId ?? `unknown-${index}`}
                testID={`diagnose-suggestion-${candidate.speciesId ?? index}`}
                accessibilityRole="button"
                disabled={!candidate.speciesId}
                onPress={() => {
                  router.push(
                    `/add-plant?speciesId=${candidate.speciesId}` +
                      `&photoUri=${encodeURIComponent(imageUri ?? '')}` +
                      (diagnosis?.id ? `&diagnosisId=${diagnosis.id}` : ''),
                  );
                }}
              >
                <Card style={[styles.rowCard, !candidate.speciesId && styles.rowDisabled]}>
                  <Text style={styles.rowName}>
                    {localName(candidate.commonNames, candidate.scientificName)}
                  </Text>
                  <Text style={styles.rowSci}>
                    {candidate.scientificName} ·{' '}
                    {t('addPlant.match', { percent: Math.round(candidate.probability * 100) })}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </>
        ) : topCandidate ? (
          <Text style={styles.speciesLine}>
            {localName(topCandidate.commonNames, topCandidate.scientificName)} ·{' '}
            {topCandidate.scientificName}
          </Text>
        ) : null}

        {issues.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>{t('diagnose.issues')}</Text>
            <Card style={styles.sectionCard}>
              {issues.map((issue, index) => (
                <View key={issue.name} style={styles.issueRow}>
                  <View style={styles.issueTop}>
                    <Text style={styles.issueName}>{issue.name}</Text>
                    <Text style={styles.issuePercent}>{Math.round(issue.probability * 100)}%</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      testID={`issue-bar-${index}`}
                      style={[styles.barFill, { width: `${Math.round(issue.probability * 100)}%` }]}
                    />
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {topIssue?.treatmentHints?.length ? (
          <>
            <Text style={styles.sectionLabel}>{t('diagnose.treatment')}</Text>
            <Card style={styles.sectionCard}>
              {topIssue.treatmentHints.map((hint, index) => (
                <View key={hint} style={styles.stepRow}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepNumber}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{hint}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {waterDays ? (
          <Text testID="water-line" style={styles.waterLine}>
            💧 {t('diagnose.waterLine', { count: waterDays })}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            testID="diagnose-save"
            label={savedTo ? t('diagnose.saved') : t('diagnose.saveToPlant')}
            onPress={() => setSaveOpen(true)}
            disabled={Boolean(savedTo)}
          />
          <Button
            testID="diagnose-ask"
            variant={diagnosis?.lowConfidence ? 'terracotta' : 'ghost'}
            label={t('diagnose.askCommunity')}
            onPress={askCommunity}
          />
          <Text style={styles.communityHint}>{t('diagnose.communityHint')}</Text>
          <Button
            testID="diagnose-done"
            variant="ghost"
            label={t('diagnose.done')}
            onPress={finish}
          />
        </View>
      </ScrollView>

      <Modal
        visible={saveOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSaveOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.backdropTouch} onPress={() => setSaveOpen(false)} />
          <View style={styles.sheet}>
            <Text style={[styles.sheetTitle, { fontFamily: displayFont }]}>
              {t('diagnose.saveToPlant')}
            </Text>
            {(plantsQuery.data ?? []).map((plant) => (
              <Pressable
                key={plant.id}
                testID={`save-plant-${plant.id}`}
                accessibilityRole="button"
                onPress={() => attach(plant.id)}
              >
                <Card style={styles.rowCard}>
                  <Text style={styles.rowName}>{plant.nickname}</Text>
                </Card>
              </Pressable>
            ))}
            <Button
              testID="save-new-plant"
              variant="ghost"
              label={t('diagnose.newPlant')}
              onPress={goToNewPlant}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={askOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAskOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.backdropTouch} onPress={() => setAskOpen(false)} />
          <View style={styles.sheet}>
            <Text style={[styles.sheetTitle, { fontFamily: displayFont }]}>
              {t('diagnose.askCommunity')}
            </Text>
            {drafting ? (
              <ActivityIndicator testID="ask-drafting" color={colors.primary} />
            ) : (
              // Fades in as it replaces the spinner, so the drafted text settles
              // before the user reaches for it rather than snapping into place.
              <Reveal>
                <Field
                  testID="ask-body"
                  label={t('diagnose.askReview')}
                  placeholder={t('compose.placeholder')}
                  value={askBody}
                  onChangeText={setAskBody}
                  multiline
                />
              </Reveal>
            )}
            <Button
              testID="ask-post"
              label={t('compose.submit')}
              onPress={postToCommunity}
              disabled={drafting || asking || !askBody.trim()}
            />
            <Button
              testID="ask-cancel"
              variant="ghost"
              label={t('camera.close')}
              onPress={() => setAskOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraScreen: {
    backgroundColor: colors.ink,
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  devChip: {
    alignSelf: 'center',
    backgroundColor: colors.terracotta,
    borderRadius: radii.pill,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.xl,
    zIndex: 5,
  },
  devChipText: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.micro,
  },
  modeRow: {
    alignSelf: 'center',
    backgroundColor: colors.cream,
    borderRadius: radii.pill,
    bottom: 120,
    flexDirection: 'row',
    padding: spacing.xs,
    position: 'absolute',
  },
  modeBtn: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  modeActive: {
    backgroundColor: colors.primary,
  },
  modeLabel: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
  },
  modeLabelActive: {
    color: colors.cream,
  },
  controls: {
    alignItems: 'center',
    bottom: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-around',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  controlBtn: {
    alignItems: 'center',
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  captureBtn: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: radii.pill,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  captureInner: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    height: 58,
    width: 58,
  },
  progressWrap: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  progressPhoto: {
    borderRadius: radii.lg,
    height: 160,
    width: 160,
  },
  progressText: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.body,
    textAlign: 'center',
  },
  failedWrap: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  failedTitle: {
    color: colors.ink,
    fontSize: typeScale.title,
  },
  failedBody: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    textAlign: 'center',
  },
  failedDetail: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.micro,
    textAlign: 'center',
  },
  failedRetry: {
    marginTop: spacing.md,
  },
  resultScreen: {
    paddingHorizontal: 0,
  },
  resultContent: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  heroWrap: {
    position: 'relative',
  },
  heroPhoto: {
    borderRadius: radii.lg,
    height: 200,
    marginTop: spacing.md,
    width: '100%',
  },
  heroPill: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    bottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'absolute',
    right: spacing.sm,
  },
  heroPillText: {
    color: colors.cream,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.micro,
  },
  banner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  bannerHealthy: {
    backgroundColor: colors.greenTint,
  },
  bannerIssue: {
    backgroundColor: colors.terracottaTint,
  },
  bannerBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  badgeHealthy: {
    backgroundColor: colors.primary,
  },
  badgeIssue: {
    backgroundColor: colors.terracotta,
  },
  bannerTextWrap: {
    flex: 1,
  },
  bannerTitle: {
    color: colors.ink,
    fontSize: typeScale.heading,
  },
  bannerSub: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
  },
  lowConfidence: {
    color: colors.terracotta,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    color: colors.mutedText,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.micro,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
  },
  sectionCard: {
    gap: spacing.md,
  },
  speciesLine: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.body,
    marginTop: spacing.md,
  },
  rowCard: {
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
  issueRow: {
    gap: spacing.xs,
  },
  issueTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  issueName: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
  },
  issuePercent: {
    color: colors.terracotta,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
  },
  barTrack: {
    backgroundColor: colors.hairline,
    borderRadius: radii.pill,
    height: 5,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: colors.terracotta,
    borderRadius: radii.pill,
    height: 5,
  },
  stepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  stepBadge: {
    alignItems: 'center',
    backgroundColor: colors.greenTint,
    borderRadius: radii.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  stepNumber: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.micro,
  },
  stepText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    lineHeight: 19,
  },
  waterLine: {
    color: colors.primary,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.body,
    marginTop: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  communityHint: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.micro,
    textAlign: 'center',
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
});
