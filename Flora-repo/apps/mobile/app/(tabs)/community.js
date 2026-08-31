import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { client } from '../../src/api/index.js';
import { unwrap } from '../../src/utils/api.js';
import { Screen } from '../../src/components/Screen.js';
import { Button } from '../../src/components/Button.js';
import { PostCard } from '../../src/components/PostCard.js';
import { colors, fonts, spacing, typeScale } from '../../src/theme.js';

/** Community feed: infinite list of posts with optimistic likes. */
export default function CommunityScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const feedQuery = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) =>
      client.feed.list(pageParam ? { cursor: pageParam } : {}).then(unwrap),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const items = feedQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const likeMutation = useMutation({
    mutationFn: ({ post }) =>
      (post.likedByMe ? client.posts.unlike(post.id) : client.posts.like(post.id)).then(unwrap),
    onMutate: async ({ post }) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueryData(['feed']);
      queryClient.setQueryData(
        ['feed'],
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === post.id
                  ? {
                      ...item,
                      likedByMe: !item.likedByMe,
                      likeCount: item.likeCount + (item.likedByMe ? -1 : 1),
                    }
                  : item,
              ),
            })),
          },
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(['feed'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  });

  const header = (
    <View style={styles.header}>
      <Text style={[styles.title, { fontFamily: displayFont }]}>{t('community.title')}</Text>
      <Button
        testID="feed-compose"
        label={t('community.compose')}
        size="sm"
        onPress={() => router.push('/compose')}
      />
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <FlatList
        testID="feed-list"
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() => router.push(`/post/${item.id}`)}
            onPressAuthor={() => router.push(`/user/${item.author.id}`)}
            onToggleLike={() => likeMutation.mutate({ post: item })}
          />
        )}
        ListFooterComponent={
          feedQuery.hasNextPage ? (
            <Button
              testID="feed-load-more"
              variant="ghost"
              label={t('community.loadMore')}
              onPress={() => feedQuery.fetchNextPage()}
              disabled={feedQuery.isFetchingNextPage}
            />
          ) : null
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
    paddingBottom: spacing.xxl * 2,
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.display,
    letterSpacing: -0.5,
  },
});
