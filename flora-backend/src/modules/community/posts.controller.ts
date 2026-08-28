import { asyncHandler } from '../../lib/asyncHandler';
import { ok } from '../../lib/apiResponse';
import { currentUserId } from '../../lib/currentUser';
import * as postsService from './posts.service';
import type {
  CreatePostInput,
  ListPostsQuery,
  PostIdParam,
  PostUploadUrlInput,
  UpdatePostInput,
} from './posts.schema';

export const uploadUrl = asyncHandler(async (req, res) => {
  const { contentType } = req.body as PostUploadUrlInput;
  const result = await postsService.createUploadUrl(currentUserId(req), contentType);
  res.json(ok(result));
});

export const create = asyncHandler(async (req, res) => {
  const post = await postsService.createPost(currentUserId(req), req.body as CreatePostInput);
  res.status(201).json(ok(post));
});

/** Feed read — not owner-scoped; community content is readable by any authed user. */
export const list = asyncHandler(async (req, res) => {
  // Double cast: validate() has already replaced req.query with the parsed output, but
  // Express types it as ParsedQs, which cannot overlap a shape with a defaulted `limit`.
  const page = await postsService.listPosts(req.query as unknown as ListPostsQuery);
  res.json(ok(page));
});

export const get = asyncHandler(async (req, res) => {
  const { id } = req.params as PostIdParam;
  const post = await postsService.getPost(id);
  res.json(ok(post));
});

export const update = asyncHandler(async (req, res) => {
  const { id } = req.params as PostIdParam;
  const post = await postsService.updatePost(
    currentUserId(req),
    id,
    req.body as UpdatePostInput,
  );
  res.json(ok(post));
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = req.params as PostIdParam;
  await postsService.deletePost(currentUserId(req), id);
  res.json(ok(null));
});
