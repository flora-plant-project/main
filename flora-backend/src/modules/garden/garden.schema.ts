import { z } from 'zod';

/**
 * Mirrors the SpaceType enum in schema.prisma. Kept as a literal list rather than
 * imported from @prisma/client so validation errors stay readable and the schema layer
 * has no database dependency.
 */
const spaceType = z.enum(['BALCONY', 'BACKYARD', 'INDOOR', 'ROOFTOP']);

/** User-facing label, e.g. "شرفة المطبخ" — Arabic is expected here, so no charset limit. */
const spaceName = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(50, 'Name must be at most 50 characters.');

export const createSpaceSchema = z.object({
  type: spaceType,
  name: spaceName,
});

/**
 * Partial update, but never empty: an update with no fields is a client bug, and
 * answering 200 to it hides the mistake.
 */
export const updateSpaceSchema = z
  .object({
    type: spaceType.optional(),
    name: spaceName.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const spaceIdParamSchema = z.object({
  id: z.string().uuid('Invalid space id.'),
});

/** Optional filter for the list endpoint; omitted means all of the user's spaces. */
export const listSpacesQuerySchema = z.object({
  type: spaceType.optional(),
});

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;
export type SpaceIdParam = z.infer<typeof spaceIdParamSchema>;
export type ListSpacesQuery = z.infer<typeof listSpacesQuerySchema>;
