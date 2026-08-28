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
import { colors, fonts, radii, spacing, typeScale } from '../../src/theme.js';

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
 * Diagnosis report.
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

  const back = (
    <Button
      testID="diagnosis-back"
      label={t('diagnose.done')}
      variant="ghost"
      onPress={() => router.back()}
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
        <Card style={styles.card}>
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
          <Card style={styles.card}>
            <ActivityIndicator color={colors.primary} />
            <Text testID="diagnosis-pending" style={styles.hint}>
              {t('diagnosis.pending')}
            </Text>
          </Card>
        ) : null}

        {diagnosis.status === 'FAILED' ? (
          <Card style={styles.card}>
            <Text style={[styles.bannerTitle, { fontFamily: displayFont }]}>
              {t('diagnose.failedTitle')}
            </Text>
            <Text testID="diagnosis-failed" style={styles.hint}>
              {diagnosis.error?.message ?? t('diagnose.failedBody')}
            </Text>
          </Card>
        ) : null}

        {diagnosis.status === 'COMPLETE' && result ? (
          <>
            <Card
              testID="diagnosis-verdict"
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
              <>
                <Text style={styles.sectionLabel}>{t('diagnose.issues')}</Text>
                <Card style={styles.sectionCard}>
                  {issues.map((issue) => (
                    <View key={issue.name} style={styles.issueRow}>
                      <Text style={styles.issueName}>{issue.name}</Text>
                      <Text style={styles.issuePercent}>
                        {Math.round(issue.probability * 100)}%
                      </Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            {advice ? (
              <>
                <Reveal delay={REVEAL_START}>
                  <Text testID="advice-summary" style={styles.summary}>
                    {advice.summary}
                  </Text>
                </Reveal>

                <Reveal delay={REVEAL_START + REVEAL_STEP}>
                  <Text style={styles.sectionLabel}>{t('diagnosis.carePlan')}</Text>
                </Reveal>
                <Card style={styles.sectionCard}>
                  {advice.steps.map((step, index) => (
                    <Reveal
                      key={step.action}
                      delay={REVEAL_START + REVEAL_STEP * (index + 2)}
                    >
                      <View testID={`advice-step-${index}`} style={styles.stepRow}>
                        <View style={styles.stepBadge}>
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
                </Card>

                {advice.watchFor.length > 0 ? (
                  <Reveal
                    delay={REVEAL_START + REVEAL_STEP * (advice.steps.length + 2)}
                  >
                    <Text style={styles.sectionLabel}>{t('diagnosis.watchFor')}</Text>
                    <Card style={styles.sectionCard}>
                      {advice.watchFor.map((signal) => (
                        <View key={signal} style={styles.watchRow}>
                          <Ionicons name="eye-outline" size={16} color={colors.mutedText} />
                          <Text style={styles.watchText}>{signal}</Text>
                        </View>
                      ))}
                    </Card>
                  </Reveal>
                ) : null}
              </>
            ) : topIssue?.treatmentHints?.length ? (
              // No care plan: the model was skipped (low confidence) or failed.
              // The provider's own hints are the fallback, exactly as the API
              // contract promises.
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
    fontSize: typeScale.title,
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  hint: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    textAlign: 'center',
  },
  banner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
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
    height: 32,
    justifyContent: 'center',
    width: 32,
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
    marginBottom: spacing.md,
  },
  speciesLine: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.body,
    marginBottom: spacing.lg,
  },
  summary: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  sectionCard: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  issueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  issueName: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
  },
  issuePercent: {
    color: colors.mutedText,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
  },
  stepRow: {
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
    color: colors.primaryDeep,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.micro,
  },
  stepBody: {
    flex: 1,
    gap: spacing.xs,
  },
  stepText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
  },
  stepWhen: {
    color: colors.primary,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.micro,
    textTransform: 'uppercase',
  },
  stepWhy: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
  },
  watchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  watchText: {
    color: colors.mutedText,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
  },
});
