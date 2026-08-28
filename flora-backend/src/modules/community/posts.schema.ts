import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES } from '../../lib/s3';
import { paginationQuerySchema } from '../../lib/pagination';

const uuid = (label: string) => z.string().uuid(`Invalid ${label}.`);

/** Arabic is expected throughout, so only length is constrained. */
const body = z
  .string()
  .trim()
  .min(1, 'Post body is required.')
  .max(2000, 'Post body must be at most 2000 characters.');

const imageKey = z
  .string()
  .trim()
  .min(1, 'Image key is required.')
  .max(512, 'Image key is too long.');

/** Posts may carry an optional photo, uploaded through the same presigned S3 flow. */
export const postUploadUrlSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
});

export const createPostSchema = z.object({
  body,
  imageKey: imageKey.optional(),
});

/**
 * A post is user-authored content, not a provenance record, so both the text and the
 * image are editable. `imageKey: null` removes the photo without deleting the post.
 */
export const updatePostSchema = z
  .object({
    body: body.optional(),
    imageKey: imageKey.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const postIdParamSchema = z.object({
  id: uuid('post id'),
});

/**
 * The feed is cursor-paginated. `authorId` narrows it to one author's posts — used for
 * profile views, not for access control: community content is readable by every
 * authenticated user by design.
 */
export const listPostsQuerySchema = paginationQuerySchema.extend({
  authorId: uuid('author id').optional(),
});

export type PostUploadUrlInput = z.infer<typeof postUploadUrlSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type PostIdParam = z.infer<typeof postIdParamSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
