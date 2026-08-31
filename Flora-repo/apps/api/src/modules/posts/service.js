import { z } from 'zod';
import { CreatePostSchema, ErrorCode, fail, ok } from '@flora/shared';
import { IdSchema, PageOptionsSchema, paginate, parseWith } from '../../lib/validate.js';
import { identityImage, noopAttach } from '../../lib/media.js';
import { commentView, postView } from '../../lib/views.js';

const CommentBodySchema = z.string().trim().min(1);

const PostFilterSchema = z.object({ type: z.enum(['GENERAL', 'HELP']).optional() });

/**
 * Demo moderation: an image whose key contains "flagged" is held for review.
 *
 * A stand-in for real image moderation, and the hook the demo script uses to
 * show the pending-review state. Whatever replaces it — Rekognition, a queue,
 * a human — swaps this function and nothing else.
 *
 * @param {string[]} images
 * @returns {'PUBLISHED'|'PENDING_REVIEW'}
 */
export function moderate(images) {
  return images.some((image) => String(image).includes('flagged')) ? 'PENDING_REVIEW' : 'PUBLISHED';
}

/**
 * What a viewer is allowed to see: everything published, plus their own posts
 * still under review.
 *
 * NOTE: the mobile mock's `posts.list` skips this filter and returns every post
 * to everybody. That is a leak, not a contract — the feed, which is what the app
 * actually renders, does filter. The API applies the rule everywhere. No
 * contract assertion depends on the leak (the seed data has no PENDING_REVIEW
 * rows), so the two clients still agree on every observable case.
 *
 * @param {{id: string}|null} viewer
 */
const visibleTo = (viewer) => ({
  OR: [{ status: 'PUBLISHED' }, ...(viewer ? [{ authorId: viewer.id }] : [])],
});

/**
 * Create the community posts service.
 *
 * `mapImage` turns the storage keys a post's images are stored as into URLs a
 * phone can fetch. Defaulted, so the module's own tests need no storage.
 *
 * @param {{
 *   prisma: import('@prisma/client').PrismaClient,
 *   mapImage?: (value: string|null) => (string|null),
 *   attachImages?: (...values: any[]) => Promise<void>,
 * }} deps
 */
export function createPostsService({ prisma, mapImage = identityImage, attachImages = noopAttach }) {
  /**
   * Everything postView needs, in one query.
   *
   * `likes` is pre-filtered to the viewer rather than counted twice: the array
   * is empty or one row, which answers likedByMe without a second round trip.
   *
   * @param {{id: string}|null} viewer
   */
  const postInclude = (viewer) => ({
    author: true,
    _count: { select: { likes: true, comments: true } },
    ...(viewer ? { likes: { where: { userId: viewer.id }, select: { userId: true } } } : {}),
  });

  return {
    /**
     * The community feed, newest first, cursor-paginated.
     *
     * Paginated in memory over the visible set. Consistent with the plant
     * timeline, and the honest version of the numeric cursor the client already
     * uses; a keyset cursor on (createdAt, id) is the upgrade when the feed
     * outgrows a single page fetch.
     */
    async feed(viewer, options) {
      const { data, error } = parseWith(PageOptionsSchema, options ?? {});
      if (error) return error;

      const posts = await prisma.post.findMany({
        where: visibleTo(viewer),
        orderBy: { createdAt: 'desc' },
        include: postInclude(viewer),
      });

      const page = paginate(posts, data);
      return ok({
        items: page.items.map((post) => postView(post, viewer, mapImage)),
        nextCursor: page.nextCursor,
      });
    },

    /** Every visible post, optionally filtered by type. */
    async list(viewer, filter) {
      const { data, error } = parseWith(PostFilterSchema, filter ?? {});
      if (error) return error;

      const posts = await prisma.post.findMany({
        where: { AND: [visibleTo(viewer), ...(data.type ? [{ type: data.type }] : [])] },
        orderBy: { createdAt: 'desc' },
        include: postInclude(viewer),
      });
      return ok(posts.map((post) => postView(post, viewer, mapImage)));
    },

    /** One post with all of its comments. */
    async get(viewer, id) {
      const check = parseWith(IdSchema, id);
      if (check.error) return check.error;

      const post = await prisma.post.findFirst({
        where: { AND: [{ id: check.data }, visibleTo(viewer)] },
        include: {
          ...postInclude(viewer),
          comments: { orderBy: { createdAt: 'asc' }, include: { author: true } },
        },
      });
      if (!post) return fail(ErrorCode.NOT_FOUND, `post ${check.data} not found`);

      return ok({
        ...postView(post, viewer, mapImage),
        comments: post.comments.map(commentView),
      });
    },

    /** Publish a post. Needs a body, an image, or both. */
    async create(user, input) {
      const { data, error } = parseWith(CreatePostSchema, input);
      if (error) return error;

      const images = data.images ?? [];
      const post = await prisma.post.create({
        data: {
          authorId: user.id,
          type: 'GENERAL',
          body: data.body ?? '',
          images,
          status: moderate(images),
        },
        include: postInclude(user),
      });
      await attachImages(images);
      return ok(postView(post, user, mapImage));
    },

    /**
     * Create a HELP post from a completed diagnosis.
     *
     * Lives here rather than in the diagnoses module because the row it writes
     * is a Post: the diagnoses service calls in with the attachment it has
     * already validated.
     *
     * `body` is the text the person reviewed in the composer — the drafted post
     * they read and edited. It wins over the canned sentence whenever it is
     * present, so what gets published is what they saw. The fallback exists for
     * the case where drafting was unavailable, not as the normal path.
     *
     * @param {{id: string}} user
     * @param {{imageUri: string|null, topIssue: string|null, confidence: number|null}} attachment
     * @param {string} [body] the reviewed post text
     */
    async createHelpPost(user, attachment, body) {
      const reviewed = typeof body === 'string' ? body.trim() : '';
      const post = await prisma.post.create({
        data: {
          authorId: user.id,
          type: 'HELP',
          body:
            reviewed ||
            (attachment.topIssue
              ? `Need help with my plant — the diagnosis suggests "${attachment.topIssue}". Any advice?`
              : 'Need help figuring out what is wrong with my plant. Any advice?'),
          images: attachment.imageUri ? [attachment.imageUri] : [],
          attachment,
        },
        include: postInclude(user),
      });
      return ok(postView(post, user, mapImage));
    },

    /** Cursor-paginated comments, oldest first — a thread reads top to bottom. */
    async comments(viewer, postId, options) {
      const idCheck = parseWith(IdSchema, postId);
      if (idCheck.error) return idCheck.error;

      const { data, error } = parseWith(PageOptionsSchema, options ?? {});
      if (error) return error;

      const post = await prisma.post.findFirst({
        where: { AND: [{ id: idCheck.data }, visibleTo(viewer)] },
      });
      if (!post) return fail(ErrorCode.NOT_FOUND, `post ${idCheck.data} not found`);

      const all = await prisma.comment.findMany({
        where: { postId: post.id },
        orderBy: { createdAt: 'asc' },
        include: { author: true },
      });

      const page = paginate(all, data);
      return ok({ items: page.items.map(commentView), nextCursor: page.nextCursor });
    },

    /** Comment on a post. */
    async comment(user, postId, body) {
      const idCheck = parseWith(IdSchema, postId);
      if (idCheck.error) return idCheck.error;

      const { data, error } = parseWith(CommentBodySchema, body);
      if (error) return error;

      const post = await prisma.post.findFirst({
        where: { AND: [{ id: idCheck.data }, visibleTo(user)] },
      });
      if (!post) return fail(ErrorCode.NOT_FOUND, `post ${idCheck.data} not found`);

      const comment = await prisma.comment.create({
        data: { postId: post.id, authorId: user.id, body: data },
      });
      return ok(commentView(comment));
    },

    /**
     * Like a post. Idempotent — liking twice leaves one like, and both calls
     * report the same count, so a double tap cannot desync the client's counter.
     */
    async like(user, postId) {
      const check = parseWith(IdSchema, postId);
      if (check.error) return check.error;

      const post = await prisma.post.findFirst({
        where: { AND: [{ id: check.data }, visibleTo(user)] },
      });
      if (!post) return fail(ErrorCode.NOT_FOUND, `post ${check.data} not found`);

      // The composite primary key makes this a no-op on the second call rather
      // than a duplicate-key error.
      await prisma.like.upsert({
        where: { postId_userId: { postId: post.id, userId: user.id } },
        create: { postId: post.id, userId: user.id },
        update: {},
      });

      return ok({
        likeCount: await prisma.like.count({ where: { postId: post.id } }),
        likedByMe: true,
      });
    },

    /** Remove a like. Also idempotent. */
    async unlike(user, postId) {
      const check = parseWith(IdSchema, postId);
      if (check.error) return check.error;

      const post = await prisma.post.findFirst({
        where: { AND: [{ id: check.data }, visibleTo(user)] },
      });
      if (!post) return fail(ErrorCode.NOT_FOUND, `post ${check.data} not found`);

      await prisma.like.deleteMany({ where: { postId: post.id, userId: user.id } });

      return ok({
        likeCount: await prisma.like.count({ where: { postId: post.id } }),
        likedByMe: false,
      });
    },
  };
}
