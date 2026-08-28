import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { unwrap } from '../../src/utils/api.js';
import { Screen } from '../../src/components/Screen.js';
import { Button } from '../../src/components/Button.js';
import { PostCard } from '../../src/components/PostCard.js';
import { colors, fonts, radii, spacing, typeScale } from '../../src/theme.js';

/** Public profile: the user's posts plus follow/unfollow. */
export default function UserScreen() {
  const { id } = useLocalSearchParams();
  const userId = String(id);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const profileQuery = useQuery({
    queryKey: ['user', userId],
    queryFn: () => client.users.get(userId).then(unwrap),
  });
  const profile = profileQuery.data;

  const postsQuery = useQuery({
    queryKey: ['user-posts', userId],
    queryFn: () => client.users.posts(userId).then(unwrap),
  });
  const posts = postsQuery.data ?? [];

  const followMutation = useMutation({
    mutationFn: (currentlyFollowing) =>
      (currentlyFollowing ? client.social.unfollow(userId) : client.social.follow(userId)).then(
        unwrap,
      ),
    onMutate: async (currentlyFollowing) => {
      await queryClient.cancelQueries({ queryKey: ['user', userId] });
      const previous = queryClient.getQueryData(['user', userId]);
      queryClient.setQueryData(
        ['user', userId],
        (old) => old && { ...old, following: !currentlyFollowing },
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(['user', userId], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['user', userId] }),
  });

  const toggleFollow = () => {
    // idempotent under double-taps: ignore presses while a request is in flight
    if (followMutation.isPending || !profile) return;
    followMutation.mutate(profile.following);
  };

  return (
    <Screen edges={['top', 'bottom']} style={styles.screen}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {(profile?.user?.displayName ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.name, { fontFamily: displayFont }]}>
              {profile?.user?.displayName ?? ''}
            </Text>
            <Text style={styles.username}>@{profile?.user?.username ?? ''}</Text>
            <Button
              testID="follow-button"
              variant={profile?.following ? 'ghost' : 'primary'}
              label={profile?.following ? t('userScreen.following') : t('userScreen.follow')}
              onPress={toggleFollow}
              disabled={followMutation.isPending || !profile}
              style={styles.followButton}
            />
            <Text style={styles.postsTitle}>{t('userScreen.posts')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard post={item} onPress={() => router.push(`/post/${item.id}`)} />
        )}
        ListFooterComponent={
          <Button
            variant="ghost"
            label={t('camera.close')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))}
            style={styles.closeButton}
          />
        }
      />
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
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.greenTint,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  avatarInitial: {
    color: colors.primary,
    fontFamily: fonts.displaySemi,
    fontSize: typeScale.title,
  },
  name: {
    color: colors.ink,
    fontSize: typeScale.title,
    marginTop: spacing.md,
  },
  username: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
  },
  followButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  postsTitle: {
    alignSelf: 'flex-start',
    color: colors.mutedText,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.micro,
    letterSpacing: 1.5,
    marginTop: spacing.xl,
    textTransform: 'uppercase',
  },
  closeButton: {
    marginTop: spacing.sm,
  },
});
