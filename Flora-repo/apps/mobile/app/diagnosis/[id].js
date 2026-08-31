import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { unwrap } from '../../src/utils/api.js';
import { Screen } from '../../src/components/Screen.js';
import { Card } from '../../src/components/Card.js';
import { Button } from '../../src/components/Button.js';
import { Reveal } from '../../src/components/Reveal.js';
import { colors, confidenceScale, fonts, radii, spacing, typeScale } from '../../src/theme.js';

/** Keep polling while the job is still running, the way the scan screen does. */
const POLL_MS = 1500;

/**
 * Stagger for the care plan, in ms.
 *
 * The plan is the part of this screen someone actually reads, so it arrives in
 * reading order — summary, then each step, then what to watch for — instead of
 * landing all at once with the diagnosis header.
 */
const REVEAL_START = 120;
const REVEAL_STEP = 70;

/** Pick the localized common name, falling back to the scientific one. */
function localName(commonNames, scientificName) {
  return commonNames?.[0] ?? scientificName;
}

/**
 * Diagnosis report — design 3d, rendered from a stored scan.
 *
 * Reached from a plant's timeline, where past diagnoses are listed. The scan
 * flow renders its own result inline in camera.js; this screen is how you get
 * back to one afterwards.
 */
export default function DiagnosisScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const diagnosisId = String(id);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const query = useQuery({
    queryKey: ['diagnosis', diagnosisId],
    queryFn: () => client.diagnoses.get(diagnosisId).then(unwrap),
    // A diagnosis opened while still running should finish on screen rather
    // than stay frozen on "pending" until the user backs out and returns.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? POLL_MS : false),
  });

  const diagnosis = query.data;
  const result = diagnosis?.result;
  const advice = result?.advice ?? null;
  const issues = result?.health?.issues ?? [];
  const topIssue = issues[0] ?? null;
  const topCandidate = result?.species?.[0] ?? null;
  const isHealthy = result?.health?.isHealthy ?? true;
  /** Confidence maps to the green→gray scale, never to red or orange. */
  const confidenceFor = (index) => confidenceScale[Math.min(index, confidenceScale.length - 1)];

  const back = (
    <Button
      testID="diagnosis-back"
      label={t('diagnose.done')}
      variant="secondary"
      onPress={() => router.back()}
      style={styles.back}
    />
  );

  if (query.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ActivityIndicator testID="diagnosis-loading" color={colors.primary} />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Text style={[styles.title, { fontFamily: displayFont }]}>{t('diagnosis.title')}</Text>
        <Card style={styles.noticeCard}>
          <Text testID="diagnosis-error" style={styles.hint}>
            {t('diagnosis.notFound')}
          </Text>
        </Card>
        {back}
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text testID="diagnosis-title" style={[styles.title, { fontFamily: displayFont }]}>
          {t('diagnosis.title')}
        </Text>

        {diagnosis.status === 'PENDING' ? (
          <Card style={styles.noticeCard}>
            <ActivityIndicator color={colors.primary} />
            <Text testID="diagnosis-pending" style={styles.hint}>
              {t('diagnosis.pending')}
            </Text>
          </Card>
        ) : null}

        {diagnosis.status === 'FAILED' ? (
          <Card style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>{t('diagnose.failedTitle')}</Text>
            <Text testID="diagnosis-failed" style={styles.hint}>
              {diagnosis.error?.message ?? t('diagnose.failedBody')}
            </Text>
          </Card>
        ) : null}

        {diagnosis.status === 'COMPLETE' && result ? (
          <>
            <View
              testID="diagnosis-verdict"
              style={[styles.banner, isHealthy ? styles.bannerHealthy : styles.bannerAttention]}
            >
              <View
                style={[
                  styles.bannerBadge,
                  isHealthy ? styles.badgeHealthy : styles.badgeAttention,
                ]}
              >
                <Ionicons
                  name={isHealthy ? 'checkmark' : 'alert'}
                  size={17}
                  color={colors.onPrimary}
                />
              </View>
              <View style={styles.bannerTextWrap}>
                <Text style={styles.bannerTitle}>
                  {isHealthy ? t('diagnose.healthyTitle') : t('diagnose.needsCare')}
                </Text>
                <Text
                  style={[
                    styles.bannerSub,
                    isHealthy ? styles.bannerSubHealthy : styles.bannerSubAttention,
                  ]}
                >
                  {isHealthy
                    ? t('diagnose.healthySub')
                    : (topIssue?.name ?? t('diagnose.needsCare'))}
                </Text>
              </View>
            </View>

            {diagnosis.lowConfidence ? (
              <Text testID="diagnosis-low-confidence" style={styles.lowConfidence}>
                {t('diagnose.lowConfidenceNote')}
              </Text>
            ) : null}

            {topCandidate ? (
              <Text testID="diagnosis-species" style={styles.speciesLine}>
                {localName(topCandidate.commonNames, topCandidate.scientificName)} ·{' '}
                {topCandidate.scientificName}
              </Text>
            ) : null}

            {issues.length > 0 ? (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardHeaderText}>{t('diagnose.issues')}</Text>
                </View>
                {issues.map((issue, index) => {
                  const percent = Math.round(issue.probability * 100);
                  const tone = confidenceFor(index);
                  return (
                    <View key={issue.name} style={styles.finding}>
                      <View style={styles.findingTop}>
                        <Text style={styles.findingLabel}>{issue.name}</Text>
                        <Text style={[styles.findingPercent, { color: tone.text }]}>
                          {percent}%
                        </Text>
                      </View>
                      <View style={styles.track}>
                        <View
                          style={[
                            styles.trackFill,
                            { backgroundColor: tone.fill, width: `${percent}%` },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {advice ? (
              <>
                <Reveal delay={REVEAL_START}>
                  <Text testID="advice-summary" style={styles.summary}>
                    {advice.summary}
                  </Text>
                </Reveal>

                <Reveal delay={REVEAL_START + REVEAL_STEP}>
                  <View style={styles.cardHeaderStandalone}>
                    <Text style={styles.cardHeaderText}>{t('diagnosis.carePlan')}</Text>
                  </View>
                </Reveal>
                <View style={styles.card}>
                  {advice.steps.map((step, index) => (
                    <Reveal key={step.action} delay={REVEAL_START + REVEAL_STEP * (index + 2)}>
                      <View
                        testID={`advice-step-${index}`}
                        style={[styles.step, index < advice.steps.length - 1 && styles.divided]}
                      >
                        <View style={styles.stepTile}>
                          <Text style={styles.stepNumber}>{index + 1}</Text>
                        </View>
                        <View style={styles.stepBody}>
                          <Text style={styles.stepText}>{step.action}</Text>
                          <Text style={styles.stepWhen}>{step.when}</Text>
                          <Text style={styles.stepWhy}>{step.why}</Text>
                        </View>
                      </View>
                    </Reveal>
                  ))}
                </View>

                {advice.watchFor.length > 0 ? (
                  <Reveal delay={REVEAL_START + REVEAL_STEP * (advice.steps.length + 2)}>
                    <View style={styles.card}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardHeaderText}>{t('diagnosis.watchFor')}</Text>
                      </View>
                      {advice.watchFor.map((signal, index) => (
                        <View
                          key={signal}
                          style={[
                            styles.step,
                            index < advice.watchFor.length - 1 && styles.divided,
                          ]}
                        >
                          <Ionicons name="eye-outline" size={14} color={colors.sage} />
                          <Text style={styles.stepText}>{signal}</Text>
                        </View>
                      ))}
                    </View>
                  </Reveal>
                ) : null}
              </>
            ) : topIssue?.treatmentHints?.length ? (
              // No care plan: the model was skipped (low confidence) or failed.
              // The provider's own hints are the fallback, exactly as the API
              // contract promises.
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardHeaderText}>{t('diagnose.treatment')}</Text>
                </View>
                {topIssue.treatmentHints.map((hint, index) => (
                  <View
                    key={hint}
                    style={[
                      styles.step,
                      index < topIssue.treatmentHints.length - 1 && styles.divided,
                    ]}
                  >
                    <View style={styles.stepTile}>
                      <Text style={styles.stepNumber}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{hint}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {back}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.display,
    letterSpacing: -0.5,
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  noticeCard: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  noticeTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: typeScale.heading,
    textAlign: 'center',
  },
  hint: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    textAlign: 'center',
  },
  banner: {
    alignItems: 'center',
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.card,
    paddingVertical: 14,
  },
  bannerAttention: {
    backgroundColor: colors.ink,
  },
  bannerHealthy: {
    backgroundColor: colors.primary,
  },
  bannerBadge: {
    alignItems: 'center',
    borderRadius: radii.badge,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  badgeAttention: {
    backgroundColor: colors.badgeOnInk,
  },
  badgeHealthy: {
    backgroundColor: colors.badgeOnGreen,
  },
  bannerTextWrap: {
    flex: 1,
  },
  bannerTitle: {
    color: colors.onPrimary,
    fontFamily: fonts.display,
    fontSize: 15.5,
  },
  bannerSub: {
    fontFamily: fonts.body,
    fontSize: typeScale.meta,
    marginTop: 1,
  },
  bannerSubAttention: {
    color: colors.subOnInk,
  },
  bannerSubHealthy: {
    color: colors.subOnGreen,
  },
  lowConfidence: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    marginBottom: spacing.md,
  },
  speciesLine: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    marginBottom: spacing.md,
  },
  summary: {
    color: colors.inkBody,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.card,
    paddingTop: spacing.xs,
  },
  cardHeader: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  cardHeaderStandalone: {
    justifyContent: 'center',
    minHeight: 34,
  },
  cardHeaderText: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 12,
  },
  divided: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  finding: {
    gap: 6,
    paddingVertical: 10,
  },
  findingTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  findingLabel: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
  },
  findingPercent: {
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
  },
  track: {
    backgroundColor: colors.track,
    borderRadius: radii.pill,
    height: 4,
    overflow: 'hidden',
  },
  trackFill: {
    borderRadius: radii.pill,
    height: 4,
  },
  step: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: 10,
  },
  stepTile: {
    alignItems: 'center',
    backgroundColor: colors.chipFill,
    borderRadius: radii.xs,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  stepNumber: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: typeScale.micro,
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  stepText: {
    color: colors.inkBody,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    lineHeight: 19,
  },
  stepWhen: {
    color: colors.primaryDeep,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.chip,
    textTransform: 'uppercase',
  },
  stepWhy: {
    color: colors.sage,
    fontFamily: fonts.body,
    fontSize: typeScale.meta,
    lineHeight: 17,
  },
  back: {
    marginTop: spacing.sm,
  },
});
