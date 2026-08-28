import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { unwrap } from '../../src/utils/api.js';
import { timeAgoParts } from '../../src/utils/time.js';
import { Screen } from '../../src/components/Screen.js';
import { Card } from '../../src/components/Card.js';
import { Button } from '../../src/components/Button.js';
import { Field } from '../../src/components/Field.js';
import { PostCard } from '../../src/components/PostCard.js';
import { colors, fonts, spacing, typeScale } from '../../src/theme.js';

/** Post thread: the post, paginated comments, and a comment input. */
export default function PostScreen() {
  const { id } = useLocalSearchParams();
  const postId = String(id);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const postQuery = useQuery({
    queryKey: ['post', postId],
    queryFn: () => client.posts.get(postId).then(unwrap),
  });
  const post = postQuery.data;

  const commentsQuery = useInfiniteQuery({
    queryKey: ['comments', postId],
    queryFn: ({ pageParam }) =>
      client.posts.comments(postId, pageParam ? { cursor: pageParam } : {}).then(unwrap),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const comments = commentsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const likeMutation = useMutation({
    mutationFn: () =>
      (post?.likedByMe ? client.posts.unlike(postId) : client.posts.like(postId)).then(unwrap),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['post', postId] }),
  });

  const commentMutation = useMutation({
    mutationFn: (body) => client.posts.comment(postId, body).then(unwrap),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const timeLabel = (iso) => {
    const time = timeAgoParts(iso);
    return time.key === 'now'
      ? t('community.timeNow')
      : t(`community.time${time.key}`, { count: time.count });
  };

  return (
    <Screen edges={['top', 'bottom']} style={styles.screen}>
      <FlatList
        testID="comments-list"
        data={comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={[styles.title, { fontFamily: displayFont }]}>{t('post.title')}</Text>
            {post ? (
              <PostCard
                post={post}
                onPressAuthor={() => router.push(`/user/${post.author.id}`)}
                onToggleLike={() => likeMutation.mutate()}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.comment} testID={`comment-${item.id}`}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentAuthor}>
                {item.author?.displayName ?? item.author?.username}
              </Text>
              <Text style={styles.commentTime}>{timeLabel(item.createdAt)}</Text>
            </View>
            <Text style={styles.commentBody}>{item.body}</Text>
          </Card>
        )}
        ListFooterComponent={
          <View>
            {commentsQuery.hasNextPage ? (
              <Button
                testID="comments-load-more"
                variant="ghost"
                label={t('community.loadMore')}
                onPress={() => commentsQuery.fetchNextPage()}
                disabled={commentsQuery.isFetchingNextPage}
              />
            ) : null}
            <Field
              testID="comment-input"
              label={t('post.commentLabel')}
              placeholder={t('post.commentPlaceholder')}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Button
              testID="comment-send"
              label={t('post.send')}
              onPress={() => commentMutation.mutate(draft.trim())}
              disabled={commentMutation.isPending || !draft.trim()}
            />
            <Button
              variant="ghost"
              label={t('camera.close')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))}
              style={styles.closeButton}
            />
          </View>
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
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  comment: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  commentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  commentAuthor: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
  },
  commentTime: {
    color: colors.sage,
    fontFamily: fonts.body,
    fontSize: typeScale.micro,
  },
  commentBody: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
  },
  closeButton: {
    marginTop: spacing.sm,
  },
});
