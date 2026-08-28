import { z } from 'zod';
import { paginationQuerySchema } from '../../lib/pagination';

const uuid = (label: string) => z.string().uuid(`Invalid ${label}.`);

/** Arabic expected; only length is constrained. Shorter cap than a post body. */
const body = z
  .string()
  .trim()
  .min(1, 'Comment body is required.')
  .max(1000, 'Comment must be at most 1000 characters.');

/**
 * Text-only for v1 — no media on comments.
 *
 * If image comments are ever wanted, add an optional `imageKey` under the same S3-key
 * rule as posts (store the key, resolve through mediaUrl() on read, validate the
 * client-supplied key with isOwnedKey). Deliberately out of scope now, not forgotten.
 */
export const createCommentSchema = z.object({
  postId: uuid('post id'),
  body,
});

/**
 * Body only. `postId` is not editable — moving a comment to a different post would
 * detach it from the conversation it was written in; delete and repost instead.
 * `userId` is set from the authenticated caller and is create-only.
 */
export const updateCommentSchema = z.object({
  body,
});

export const commentIdParamSchema = z.object({
  id: uuid('comment id'),
});

/**
 * `postId` is REQUIRED, unlike the optional `plantId` on diagnosis: comments only exist
 * in the context of a post, and "every comment in the system" is not a view anyone
 * should be able to request.
 */
export const listCommentsQuerySchema = paginationQuerySchema.extend({
  postId: uuid('post id'),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type CommentIdParam = z.infer<typeof commentIdParamSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
