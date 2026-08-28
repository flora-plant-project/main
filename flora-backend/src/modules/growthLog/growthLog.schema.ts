import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES } from '../../lib/s3';
import { paginationQuerySchema } from '../../lib/pagination';

const uuid = (label: string) => z.string().uuid(`Invalid ${label}.`);

const note = z.string().trim().max(500, 'Note must be at most 500 characters.');

/** Step 1 of the upload, identical in shape to diagnosis — same presigned S3 flow. */
export const growthLogUploadUrlSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
});

/**
 * A timeline entry is a photo plus an optional note. The key is client-supplied and
 * therefore untrusted — the service checks it against the caller's own upload prefix.
 */
export const createGrowthLogSchema = z.object({
  plantId: uuid('plant id'),
  imageKey: z
    .string()
    .trim()
    .min(1, 'Image key is required.')
    .max(512, 'Image key is too long.'),
  note: note.optional(),
});

/**
 * Only the note is editable. The photo and its timestamp are the record of what the
 * plant looked like at a moment — swapping the image would rewrite history rather than
 * correct it. To replace a photo, delete the entry and add a new one.
 */
export const updateGrowthLogSchema = z.object({
  note: note.nullable(),
});

export const growthLogIdParamSchema = z.object({
  id: uuid('growth log id'),
});

/**
 * Omitting `plantId` returns the caller's entries across every plant they own.
 *
 * Cursor-paginated: a growth timeline accumulates entries indefinitely, so this is the
 * other read that genuinely needed it.
 */
export const listGrowthLogsQuerySchema = paginationQuerySchema.extend({
  plantId: uuid('plant id').optional(),
});

export type GrowthLogUploadUrlInput = z.infer<typeof growthLogUploadUrlSchema>;
export type CreateGrowthLogInput = z.infer<typeof createGrowthLogSchema>;
export type UpdateGrowthLogInput = z.infer<typeof updateGrowthLogSchema>;
export type GrowthLogIdParam = z.infer<typeof growthLogIdParamSchema>;
export type ListGrowthLogsQuery = z.infer<typeof listGrowthLogsQuerySchema>;
