import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { CURSOR_ORDER_BY, paginate, type Page } from '../../lib/pagination';
import type {
  CreateCommentInput,
  ListCommentsQuery,
  UpdateCommentInput,
} from './comments.schema';

/**
 * THE PARENT CHECK HERE IS EXISTENCE, NOT OWNERSHIP — and that difference is deliberate.
 *
 * Convention #4 says a cross-resource write verifies the referenced resource with
 * `userId` in the `where`. Its reference implementation is plants → space, where the
 * parent is *private*: dropping a plant into someone else's garden must be impossible.
 *
 * A post is *public*. Any authenticated user may comment on any post — that is what a
 * community is. So `assertPostExists` looks the post up by id alone. Adding `userId`
 * here would silently restrict commenting to your own posts and break the feature.
 *
 * The convention still holds where it applies: comment *writes* are owner-scoped, and
 * someone else's comment returns the same 404 as one that does not exist.
 */

const publicComment = {
  id: true,
  postId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, username: true } },
} as const satisfies Prisma.CommentSelect;

export type PublicComment = Prisma.CommentGetPayload<{ select: typeof publicComment }>;

/** Writes only. Reads are public, exactly as they are for posts. */
const ownedComment = (userId: string, id: string): Prisma.CommentWhereInput => ({
  id,
  userId,
});

/** Existence only — no userId. See the note above before changing this. */
const assertPostExists = async (postId: string): Promise<void> => {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });

  if (!post) throw new NotFoundError('Post not found.');
};

export const createComment = async (
  userId: string,
  input: CreateCommentInput,
): Promise<PublicComment> => {
  await assertPostExists(input.postId);

  return prisma.comment.create({
    // `userId` comes from the verified token, never from the request body.
    data: { ...input, userId },
    select: publicComment,
  });
};

/**
 * Public read: any authenticated user sees a post's comments. Newest first, matching the
 * feed — a second ordering would break cursor stability, so CURSOR_ORDER_BY is reused
 * rather than redefined.
 */
export const listComments = async (
  query: ListCommentsQuery,
): Promise<Page<PublicComment>> =>
  paginate(query, (args) =>
    prisma.comment.findMany({
      ...args,
      where: { postId: query.postId },
      select: publicComment,
      orderBy: [...CURSOR_ORDER_BY],
    }),
  );

export const getComment = async (id: string): Promise<PublicComment> => {
  const comment = await prisma.comment.findUnique({
    where: { id },
    select: publicComment,
  });

  if (!comment) throw new NotFoundError('Comment not found.');
  return comment;
};

export const updateComment = async (
  userId: string,
  id: string,
  input: UpdateCommentInput,
): Promise<PublicComment> => {
  const { count } = await prisma.comment.updateMany({
    where: ownedComment(userId, id),
    data: input,
  });

  if (count === 0) throw new NotFoundError('Comment not found.');

  return getComment(id);
};

/**
 * Unguarded: a comment is exactly what the user asked to remove and nothing hangs off it.
 * Note that deleting the parent post also removes this comment, by cascade — a comment
 * cannot outlive the conversation it belongs to.
 */
export const deleteComment = async (userId: string, id: string): Promise<void> => {
  const { count } = await prisma.comment.deleteMany({ where: ownedComment(userId, id) });

  if (count === 0) throw new NotFoundError('Comment not found.');
};
