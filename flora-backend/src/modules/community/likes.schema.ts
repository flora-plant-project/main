import { z } from 'zod';

const uuid = (label: string) => z.string().uuid(`Invalid ${label}.`);

/** `userId` is never accepted from the client — it comes from the verified token. */
export const createLikeSchema = z.object({
  postId: uuid('post id'),
});

/**
 * Unlike is addressed by `postId` in the query string, not by a like id in the path —
 * see the addressing note at the top of likes.service.ts.
 */
export const deleteLikeQuerySchema = z.object({
  postId: uuid('post id'),
});

export type CreateLikeInput = z.infer<typeof createLikeSchema>;
export type DeleteLikeQuery = z.infer<typeof deleteLikeQuerySchema>;
