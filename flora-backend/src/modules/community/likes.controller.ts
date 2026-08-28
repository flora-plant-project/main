import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import { currentUserId } from '../../lib/currentUser';
import * as likesService from './likes.service';
import type { CreateLikeInput, DeleteLikeQuery } from './likes.schema';

/** Idempotent: liking an already-liked post succeeds without changing anything. */
export const create = asyncHandler(async (req, res) => {
  await likesService.likePost(currentUserId(req), req.body as CreateLikeInput);
  res.json(ok(null));
});

/** Idempotent: unliking a post that was never liked also succeeds. */
export const remove = asyncHandler(async (req, res) => {
  const { postId } = req.query as unknown as DeleteLikeQuery;
  await likesService.unlikePost(currentUserId(req), postId);
  res.json(ok(null));
});
