import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { client } from '../src/api/index.js';
import { imageForKey } from '../src/utils/images.js';
import { Screen } from '../src/components/Screen.js';
import { Card } from '../src/components/Card.js';
import { Button } from '../src/components/Button.js';
import { Field } from '../src/components/Field.js';
import { Reveal } from '../src/components/Reveal.js';
import { colors, fonts, radii, spacing, typeScale } from '../src/theme.js';

const MAX_IMAGES = 3;

/** Composer: text + up to three images → posts.create; shows the review banner. */
export default function ComposeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;
  const isMock = (process.env.EXPO_PUBLIC_API_MODE ?? 'mock') === 'mock';

  const [body, setBody] = useState('');
  const [images, setImages] = useState([]);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // Bumped only when a draft lands, and used as the editor's key so it fades in
  // with the new text. Keying on the body itself would remount the input on
  // every keystroke and steal focus mid-sentence.
  const [draftVersion, setDraftVersion] = useState(0);

  // Only fetched once the picker opens — most posts are written by hand.
  const plantsQuery = useQuery({
    queryKey: ['plants'],
    enabled: draftOpen,
    queryFn: () => client.plants.list().then((res) => (res.ok ? res.data : [])),
  });
  const plants = plantsQuery.data ?? [];

  const DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * Draft a post about one plant and drop it in the editor.
   *
   * The draft is never posted for the user — it fills the field, they edit it,
   * and the existing submit path runs unchanged. Machine-written words go out
   * under someone's name only after they have read them.
   * @param {object} plant
   */
  const draftFor = async (plant) => {
    setDrafting(true);
    setError(null);
    const res = await client.posts.draft({
      plant: {
        nickname: plant.nickname,
        ...(plant.speciesName && { speciesName: plant.speciesName }),
        ...(plant.createdAt && {
          ageDays: Math.max(0, Math.round((Date.now() - Date.parse(plant.createdAt)) / DAY_MS)),
        }),
        ...(plant.lastWateredAt && { lastWateredAt: plant.lastWateredAt }),
      },
    });
    setDrafting(false);
    setDraftOpen(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setBody(res.data.body);
    setDraftVersion((version) => version + 1);
  };

  const addImage = async () => {
    if (images.length >= MAX_IMAGES) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImages((current) => [...current, result.assets[0].uri].slice(0, MAX_IMAGES));
    }
  };

  const addFlaggedDemoImage = () => {
    setImages((current) => [...current, 'assets/demo/flagged.jpg'].slice(0, MAX_IMAGES));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      ...(body.trim() && { body: body.trim() }),
      ...(images.length > 0 && { images }),
    };
    const res = await client.posts.create(payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    if (res.data.status === 'PENDING_REVIEW') {
      setPending(true);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/community');
  };

  if (pending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View testID="pending-banner" style={styles.pendingBanner}>
          <Ionicons name="eye-off-outline" size={28} color={colors.terracotta} />
          <Text style={[styles.pendingTitle, { fontFamily: displayFont }]}>
            {t('compose.pendingBanner')}
          </Text>
          <Text style={styles.pendingBody}>{t('compose.pendingBody')}</Text>
        </View>
        <Button
          label={t('diagnose.done')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { fontFamily: displayFont }]}>{t('compose.title')}</Text>
        <Reveal key={draftVersion}>
          <Field
            testID="compose-body"
            label={t('compose.title')}
            placeholder={t('compose.placeholder')}
            value={body}
            onChangeText={setBody}
            multiline
          />
        </Reveal>
        <Button
          testID="compose-draft"
          variant="ghost"
          label={drafting ? t('compose.drafting') : t('compose.draftForMe')}
          onPress={() => setDraftOpen(true)}
          disabled={drafting}
          style={styles.rowButton}
        />
        {images.length > 0 ? (
          <View style={styles.thumbRow}>
            {images.map((image) => (
              <Image
                key={image}
                source={imageForKey(image) ?? { uri: image }}
                style={styles.thumb}
                contentFit="cover"
              />
            ))}
          </View>
        ) : null}
        <Button
          testID="compose-add-image"
          variant="ghost"
          label={t('compose.addImage', { count: images.length, max: MAX_IMAGES })}
          onPress={addImage}
          disabled={images.length >= MAX_IMAGES}
          style={styles.rowButton}
        />
        {isMock ? (
          <Button
            testID="dev-flagged-image"
            variant="terracotta"
            label={t('compose.devFlagged')}
            onPress={addFlaggedDemoImage}
            disabled={images.length >= MAX_IMAGES}
            style={styles.rowButton}
          />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Card style={styles.actions}>
          <Button
            testID="compose-submit"
            label={t('compose.submit')}
            onPress={submit}
            disabled={busy || (!body.trim() && images.length === 0)}
          />
          <Button
            variant="ghost"
            label={t('camera.close')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))}
            style={styles.rowButton}
          />
        </Card>
      </ScrollView>

      <Modal
        visible={draftOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDraftOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.backdropTouch} onPress={() => setDraftOpen(false)} />
          <View style={styles.sheet}>
            <Text style={[styles.sheetTitle, { fontFamily: displayFont }]}>
              {t('compose.draftPickPlant')}
            </Text>
            {plants.map((plant) => (
              <Pressable
                key={plant.id}
                testID={`draft-plant-${plant.id}`}
                accessibilityRole="button"
                onPress={() => draftFor(plant)}
              >
                <Card style={styles.rowCard}>
                  <Text style={styles.rowName}>{plant.nickname}</Text>
                </Card>
              </Pressable>
            ))}
            {plants.length === 0 ? (
              <Text testID="draft-no-plants" style={styles.sheetHint}>
                {t('compose.draftNoPlants')}
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
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
  thumbRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: typeScale.heading,
    marginBottom: spacing.sm,
  },
  sheetHint: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
  },
  rowCard: {
    marginBottom: spacing.sm,
  },
  rowName: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.body,
  },
  thumb: {
    borderRadius: radii.md,
    height: 72,
    width: 72,
  },
  rowButton: {
    marginTop: spacing.sm,
  },
  error: {
    color: colors.terracotta,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  pendingBanner: {
    alignItems: 'center',
    backgroundColor: colors.terracottaTint,
    borderRadius: radii.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.xxl,
    padding: spacing.xl,
  },
  pendingTitle: {
    color: colors.ink,
    fontSize: typeScale.heading,
    textAlign: 'center',
  },
  pendingBody: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    textAlign: 'center',
  },
});
