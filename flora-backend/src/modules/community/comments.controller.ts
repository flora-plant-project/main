import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import { currentUserId } from '../../lib/currentUser';
import * as commentsService from './comments.service';
import type {
  CommentIdParam,
  CreateCommentInput,
  ListCommentsQuery,
  UpdateCommentInput,
} from './comments.schema';

export const create = asyncHandler(async (req, res) => {
  const comment = await commentsService.createComment(
    currentUserId(req),
    req.body as CreateCommentInput,
  );
  res.status(201).json(ok(comment));
});

/** Public read — any authenticated user may read a post's comments. */
export const list = asyncHandler(async (req, res) => {
  // Double cast: paginated query shapes carry a defaulted `limit`, which ParsedQs
  // cannot overlap. validate() has already replaced req.query with the parsed output.
  const page = await commentsService.listComments(req.query as unknown as ListCommentsQuery);
  res.json(ok(page));
});

export const get = asyncHandler(async (req, res) => {
  const { id } = req.params as CommentIdParam;
  const comment = await commentsService.getComment(id);
  res.json(ok(comment));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.params as CommentIdParam;
  const comment = await commentsService.updateComment(
    currentUserId(req),
    id,
    req.body as UpdateCommentInput,
  );
  res.json(ok(comment));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = req.params as CommentIdParam;
  await commentsService.deleteComment(currentUserId(req), id);
  res.json(ok(null));
});
