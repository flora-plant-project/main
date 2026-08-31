import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { timeAgoParts } from '../utils/time.js';
import { imageForKey } from '../utils/images.js';
import { Card } from './Card.js';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

/**
 * Feed post: author + time-ago header, optional HELP diagnosis context card,
 * body, image carousel, like heart and comment count.
 */
export function PostCard({ post, onPress, onPressAuthor, onToggleLike }) {
  const { t } = useTranslation();
  const time = timeAgoParts(post.createdAt);
  const timeLabel =
    time.key === 'now'
      ? t('community.timeNow')
      : t(`community.time${time.key}`, { count: time.count });
  const attachment = post.attachment;
  const confidencePercent = Math.round((attachment?.confidence ?? 0) * 100);

  return (
    <Pressable testID={`post-${post.id}`} accessibilityRole="button" onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Pressable
            testID={`post-author-${post.id}`}
            accessibilityRole="button"
            onPress={onPressAuthor}
            hitSlop={8}
          >
            <Text style={styles.author}>
              {post.author?.displayName ?? post.author?.username ?? '—'}
            </Text>
          </Pressable>
          <Text style={styles.time}>{timeLabel}</Text>
        </View>

        {post.status === 'PENDING_REVIEW' ? (
          <View testID={`pending-${post.id}`} style={styles.pending}>
            <Ionicons name="eye-off-outline" size={13} color={colors.ink} />
            <Text style={styles.pendingText}>{t('community.pendingBadge')}</Text>
          </View>
        ) : null}

        {post.type === 'HELP' && attachment ? (
          <View testID={`help-context-${post.id}`} style={styles.helpCard}>
            <Image
              source={imageForKey(attachment.imageUri) ?? { uri: attachment.imageUri }}
              style={styles.helpPhoto}
              contentFit="cover"
            />
            <View style={styles.helpText}>
              <Text style={styles.helpIssue}>
                {attachment.topIssue ?? t('community.helpBadge')}
              </Text>
              <View style={styles.confTrack}>
                <View style={[styles.confFill, { width: `${confidencePercent}%` }]} />
              </View>
              <Text style={styles.confLabel}>
                {t('community.confidence', { percent: confidencePercent })}
              </Text>
            </View>
          </View>
        ) : null}

        {post.body ? <Text style={styles.body}>{post.body}</Text> : null}

        {post.images?.length ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.carousel}
          >
            {post.images.map((image) => (
              <Image
                key={image}
                source={imageForKey(image) ?? { uri: image }}
                style={styles.carouselImage}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            testID={`like-${post.id}`}
            accessibilityRole="button"
            onPress={onToggleLike}
            hitSlop={8}
            style={styles.footerItem}
          >
            <Ionicons
              name={post.likedByMe ? 'heart' : 'heart-outline'}
              size={18}
              color={post.likedByMe ? colors.primary : colors.sage}
            />
            <Text testID={`like-count-${post.id}`} style={styles.footerText}>
              {post.likeCount}
            </Text>
          </Pressable>
          <View style={styles.footerItem}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.mutedText} />
            <Text style={styles.footerText}>{post.commentCount}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  author: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: typeScale.body,
  },
  time: {
    color: colors.sage,
    fontFamily: fonts.body,
    fontSize: typeScale.meta,
  },
  pending: {
    alignItems: 'center',
    backgroundColor: colors.chipFill,
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pendingText: {
    color: colors.ink,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.micro,
  },
  helpCard: {
    backgroundColor: colors.chipFill,
    borderRadius: radii.card,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
  },
  helpPhoto: {
    borderRadius: radii.sm,
    height: 56,
    width: 56,
  },
  helpText: {
    flex: 1,
    justifyContent: 'center',
  },
  helpIssue: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.caption,
  },
  confTrack: {
    backgroundColor: colors.track,
    borderRadius: radii.pill,
    height: 4,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  confFill: {
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.pill,
    height: 4,
  },
  confLabel: {
    color: colors.primaryDeep,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.micro,
    marginTop: 2,
  },
  body: {
    color: colors.inkBody,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    lineHeight: 21,
  },
  carousel: {
    marginTop: spacing.xs,
  },
  carouselImage: {
    borderRadius: radii.card,
    height: 160,
    marginRight: spacing.sm,
    width: 240,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  footerItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  footerText: {
    color: colors.sage,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.caption,
  },
});
