import { ErrorCode, fail, ok } from '@flora/shared';
import { IdSchema, parseWith } from '../../lib/validate.js';
import { identityImage } from '../../lib/media.js';
import { authorView, postView } from '../../lib/views.js';

/**
 * Create the users + follow-graph service.
 * @param {{
 *   prisma: import('@prisma/client').PrismaClient,
 *   mapImage?: (value: string|null) => (string|null),
 * }} deps
 */
export function createUsersService({ prisma, mapImage = identityImage }) {
  /**
   * @param {unknown} userId
   * @returns {Promise<{user: object, error: null} | {user: null, error: object}>}
   */
  async function findTarget(userId) {
    const check = parseWith(IdSchema, userId);
    if (check.error) return { user: null, error: check.error };

    const user = await prisma.user.findUnique({ where: { id: check.data } });
    if (!user)
      return { user: null, error: fail(ErrorCode.NOT_FOUND, `user ${check.data} not found`) };

    return { user, error: null };
  }

  return {
    /** A public profile plus whether the viewer follows them. */
    async get(viewer, userId) {
      const { user, error } = await findTarget(userId);
      if (error) return error;

      const follow = await prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewer.id, followeeId: user.id } },
      });

      return ok({ user: authorView(user), following: Boolean(follow) });
    },

    /** That user's posts, as the viewer can see them, newest first. */
    async posts(viewer, userId) {
      const { user, error } = await findTarget(userId);
      if (error) return error;

      const posts = await prisma.post.findMany({
        where: {
          authorId: user.id,
          OR: [{ status: 'PUBLISHED' }, { authorId: viewer.id }],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          author: true,
          _count: { select: { likes: true, comments: true } },
          likes: { where: { userId: viewer.id }, select: { userId: true } },
        },
      });

      return ok(posts.map((post) => postView(post, viewer, mapImage)));
    },

    /** Follow another user. Idempotent, and you cannot follow yourself. */
    async follow(viewer, userId) {
      const { user, error } = await findTarget(userId);
      if (error) return error;

      if (user.id === viewer.id) return fail(ErrorCode.VALIDATION, 'cannot follow yourself');

      await prisma.follow.upsert({
        where: { followerId_followeeId: { followerId: viewer.id, followeeId: user.id } },
        create: { followerId: viewer.id, followeeId: user.id },
        update: {},
      });

      return ok({ following: true });
    },

    /** Unfollow. Also idempotent — unfollowing someone you do not follow is fine. */
    async unfollow(viewer, userId) {
      const { user, error } = await findTarget(userId);
      if (error) return error;

      await prisma.follow.deleteMany({ where: { followerId: viewer.id, followeeId: user.id } });
      return ok({ following: false });
    },
  };
}
