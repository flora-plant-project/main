import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import type { CreateLikeInput } from './likes.schema';

/**
 * ADDRESSING: likes are identified by `postId`, not by their surrogate id.
 *
 * A like's real identity is the pair (post, caller). The caller half is implicit in the
 * access token, and the surrogate `id` is never returned to the client — so the client
 * has no id to send back. Addressing by postId is therefore the only shape that works,
 * and it is a justified divergence from the `/:id` pattern used elsewhere in the spine,
 * not an oversight.
 *
 * PARENT CHECK is existence-only, as with comments: a post is public, so anyone
 * authenticated may like anyone's post. No `userId` in the lookup.
 */

/** Existence only — no userId. Same reasoning as comments.service. */
const assertPostExists = async (postId: string): Promise<void> => {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });

  if (!post) throw new NotFoundError('Post not found.');
};

/**
 * Idempotent like. Liking twice is a no-op, not an error.
 *
 * The upsert's empty `update` is the mechanism: a repeat like matches the existing row
 * on the compound unique key and writes nothing, so it never raises P2002 and never
 * reaches the global P2002 → 409 mapping. That opt-out is deliberate — a like expresses
 * state ("this user likes this post"), and asking for a state that already holds is a
 * success, not a conflict. A double-tap on a flaky connection must not surface an error.
 */
export const likePost = async (userId: string, input: CreateLikeInput): Promise<void> => {
  await assertPostExists(input.postId);

  await prisma.like.upsert({
    where: { postId_userId: { postId: input.postId, userId } },
    // userId comes from the verified token, never from the request body.
    create: { postId: input.postId, userId },
    update: {},
  });
};

/**
 * Idempotent unlike. Removing a like that was never there succeeds silently.
 *
 * `deleteMany` rather than `delete`: it returns a count instead of throwing P2025 on
 * zero rows, so the "nothing to remove" case stays a success rather than becoming a 404.
 *
 * Asymmetric with `likePost` on purpose — there is no `assertPostExists` here. If the
 * post is gone, its likes went with it by cascade, so the unlike is already satisfied.
 * Demanding the post exist would turn a completed intent into an error.
 */
export const unlikePost = async (userId: string, postId: string): Promise<void> => {
  await prisma.like.deleteMany({ where: { postId, userId } });
};
