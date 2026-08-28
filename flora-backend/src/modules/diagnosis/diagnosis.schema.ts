import { z } from 'zod';
import { ALLOWED_IMAGE_TYPES } from '../../lib/s3';
import { paginationQuerySchema } from '../../lib/pagination';

/**
 * IDENTIFY answers "what is this plant", HEALTH answers "what is wrong with it". The
 * client states which it wants, so the value is known before recognition runs — which is
 * why it is non-null even on a PENDING row.
 */
const resultType = z.enum(['IDENTIFY', 'HEALTH']);

const uuid = (label: string) => z.string().uuid(`Invalid ${label}.`);

/** Step 1 of the upload flow: ask for a presigned URL. */
export const uploadUrlSchema = z.object({
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
});

/**
 * Step 2: confirm the upload and run recognition.
 *
 * `imageKey` comes back from the client, so it is untrusted input. The service checks it
 * belongs to the caller's own upload prefix — length and charset limits here only keep
 * obvious junk out.
 */
export const createDiagnosisSchema = z.object({
  plantId: uuid('plant id'),
  imageKey: z
    .string()
    .trim()
    .min(1, 'Image key is required.')
    .max(512, 'Image key is too long.'),
  resultType,
});

export const diagnosisIdParamSchema = z.object({
  id: uuid('diagnosis id'),
});

/**
 * Omitting `plantId` returns the caller's diagnoses across every plant they own.
 *
 * Cursor-paginated: a plant's health history grows without bound over its lifetime, so
 * this is one of the two reads that genuinely needed it.
 */
export const listDiagnosesQuerySchema = paginationQuerySchema.extend({
  plantId: uuid('plant id').optional(),
  resultType: resultType.optional(),
  /** Query-string booleans arrive as text, so accept the two literal forms. */
  flaggedLowConfidence: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
export type CreateDiagnosisInput = z.infer<typeof createDiagnosisSchema>;
export type DiagnosisIdParam = z.infer<typeof diagnosisIdParamSchema>;
export type ListDiagnosesQuery = z.infer<typeof listDiagnosesQuerySchema>;
