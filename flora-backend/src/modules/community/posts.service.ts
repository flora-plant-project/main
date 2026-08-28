import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from '../../lib/errors';
import {
  buildUploadKey,
  createPresignedUploadUrl,
  isOwnedKey,
  mediaUrl,
  type AllowedImageType,
} from '../../lib/s3';
import { CURSOR_ORDER_BY, mapPage, paginate, type Page } from '../../lib/pagination';
import type { CreatePostInput, ListPostsQuery, UpdatePostInput } from './posts.schema';

/**
 * COMMUNITY IS FLAT BY DESIGN (FLOR-4 deferred).
 *
 * A post hangs directly off a user with no grouping — no Community, no Region. Whether
 * the feed is region-scoped from v1 is an open team question, and inventing the model
 * speculatively would be harder to undo than adding a nullable `region` column later.
 * If the team decides region belongs in v1, it is one column on Post, not a new model.
 */

const publicPost = {
  id: true,
  body: true,
  imageKey: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, username: true } },
  _count: { select: { comments: true, likes: true } },
} as const satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof publicPost }>;

export type PublicPost = Omit<PostRow, 'imageKey'> & { imageUrl: string | null };

const toPublic = ({ imageKey, ...rest }: PostRow): PublicPost => ({
  ...rest,
  imageUrl: imageKey ? mediaUrl(imageKey) : null,
});

/**
 * DELIBERATE DIVERGENCE from the userId-in-every-where rule.
 *
 * Community content is readable by every authenticated user — that is the point of a
 * community. So reads are NOT owner-scoped. Writes still are: `ownedPost` gates every
 * update and delete, and a post belonging to someone else returns the same 404 as one
 * that does not exist.
 */
const ownedPost = (userId: string, id: string): Prisma.PostWhereInput => ({ id, userId });

export const createUploadUrl = async (
  userId: string,
  contentType: AllowedImageType,
): Promise<{ uploadUrl: string; imageKey: string; expiresIn: number }> => {
  const imageKey = buildUploadKey(userId, contentType);
  const { uploadUrl, expiresIn } = await createPresignedUploadUrl(imageKey, contentType);

  return { uploadUrl, imageKey, expiresIn };
};

export const createPost = async (
  userId: string,
  input: CreatePostInput,
): Promise<PublicPost> => {
  // Client-supplied key: without this a caller could attach someone else's upload.
  if (input.imageKey && !isOwnedKey(userId, input.imageKey)) {
    throw new ValidationError('Image key does not belong to this user.');
  }

  const row = await prisma.post.create({
    data: { ...input, userId },
    select: publicPost,
  });

  return toPublic(row);
};

/** The feed. Readable by any authenticated user; `authorId` narrows it to one profile. */
export const listPosts = async (query: ListPostsQuery): Promise<Page<PublicPost>> => {
  const page = await paginate(query, (args) =>
    prisma.post.findMany({
      ...args,
      where: query.authorId ? { userId: query.authorId } : {},
      select: publicPost,
      orderBy: [...CURSOR_ORDER_BY],
    }),
  );

  return mapPage(page, toPublic);
};

export const getPost = async (id: string): Promise<PublicPost> => {
  const row = await prisma.post.findUnique({ where: { id }, select: publicPost });

  if (!row) throw new NotFoundError('Post not found.');
  return toPublic(row);
};

export const updatePost = async (
  userId: string,
  id: string,
  input: UpdatePostInput,
): Promise<PublicPost> => {
  if (input.imageKey && !isOwnedKey(userId, input.imageKey)) {
    throw new ValidationError('Image key does not belong to this user.');
  }

  const { count } = await prisma.post.updateMany({
    where: ownedPost(userId, id),
    data: input,
  });

  // Someone else's post is indistinguishable from a missing one.
  if (count === 0) throw new NotFoundError('Post not found.');

  return getPost(id);
};

/**
 * Cascades to the post's comments and likes. Unguarded: the post is what the user asked
 * to remove, and its comments have no existence apart from it. As elsewhere, the S3
 * object is left behind — orphan cleanup is a documented pre-production gap.
 */
export const deletePost = async (userId: string, id: string): Promise<void> => {
  const { count } = await prisma.post.deleteMany({ where: ownedPost(userId, id) });

  if (count === 0) throw new NotFoundError('Post not found.');
};
