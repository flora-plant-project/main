import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as postsController from './posts.controller';
import {
  createPostSchema,
  listPostsQuerySchema,
  postIdParamSchema,
  postUploadUrlSchema,
  updatePostSchema,
} from './posts.schema';
import * as likesController from './likes.controller';
import { createLikeSchema, deleteLikeQuerySchema } from './likes.schema';
import * as commentsController from './comments.controller';
import {
  commentIdParamSchema,
  createCommentSchema,
  listCommentsQuerySchema,
  updateCommentSchema,
} from './comments.schema';

const router = Router();

/**
 * Authentication is required to read the community, not just to write to it — the feed
 * is not public. Ownership is a separate matter: reads are open to every authenticated
 * user, writes are restricted to the author (enforced in the service).
 */
router.use(requireAuth);

router.post('/posts/upload-url', validate({ body: postUploadUrlSchema }), postsController.uploadUrl);

router.post('/posts', validate({ body: createPostSchema }), postsController.create);

/** Cursor-paginated: `{ items, nextCursor }`. */
router.get('/posts', validate({ query: listPostsQuerySchema }), postsController.list);

router.get('/posts/:id', validate({ params: postIdParamSchema }), postsController.get);

router.patch(
  '/posts/:id',
  validate({ params: postIdParamSchema, body: updatePostSchema }),
  postsController.update,
);

/** Cascades to comments and likes. */
router.delete('/posts/:id', validate({ params: postIdParamSchema }), postsController.remove);

/**
 * Comments are a flat resource with `postId` as a parameter, not a nested route under
 * /posts/:id/comments — same shape as growth-logs and diagnosis relative to plants.
 */
router.post('/comments', validate({ body: createCommentSchema }), commentsController.create);

/** `postId` is required; cursor-paginated. */
router.get('/comments', validate({ query: listCommentsQuerySchema }), commentsController.list);

router.get(
  '/comments/:id',
  validate({ params: commentIdParamSchema }),
  commentsController.get,
);

/** Body only — postId and userId are immutable. */
router.patch(
  '/comments/:id',
  validate({ params: commentIdParamSchema, body: updateCommentSchema }),
  commentsController.update,
);

router.delete(
  '/comments/:id',
  validate({ params: commentIdParamSchema }),
  commentsController.remove,
);

/**
 * Likes are write-only for now. How the client reads like count and whether the viewer
 * has liked a post is the next decision and will most likely enrich the post read
 * (`_count.likes` is already in the post select), so no GET /likes is built here.
 *
 * Both verbs are idempotent and addressed by postId — see likes.service.ts.
 */
router.post('/likes', validate({ body: createLikeSchema }), likesController.create);

router.delete('/likes', validate({ query: deleteLikeQuerySchema }), likesController.remove);

// Follows mount here when that sub-feature lands.

export default router;
