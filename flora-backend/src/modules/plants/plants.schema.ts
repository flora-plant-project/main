import { z } from 'zod';

/**
 * How the plant entered the app. Two stable values, so hand-mirrored from schema.prisma
 * for readable errors.
 *
 * NAME means the user typed a nickname; PHOTO means it came from image identification.
 * Neither implies a catalog link — see `catalogEntryId` below.
 */
const addedVia = z.enum(['NAME', 'PHOTO']);

/** Free text, and Arabic is expected — only length is constrained. */
const nickname = z
  .string()
  .trim()
  .min(1, 'Nickname is required.')
  .max(60, 'Nickname must be at most 60 characters.');

const uuid = (label: string) => z.string().uuid(`Invalid ${label}.`);

/**
 * A plant with `catalogEntryId: null` and a free-text nickname is a complete, valid
 * plant — not a degraded one. The species catalog has no data source yet (FLOR-9 is
 * unresolved), so nothing in this module may assume a catalog entry exists. Linking one
 * later is purely additive.
 */
export const createPlantSchema = z.object({
  spaceId: uuid('space id'),
  nickname,
  addedVia,
  catalogEntryId: uuid('catalog entry id').optional(),
});

/**
 * `addedVia` is deliberately absent: it is provenance, fixed at creation. Moving a plant
 * between spaces is allowed, so `spaceId` is editable — and the target space is
 * ownership-checked just like it is on create.
 *
 * `catalogEntryId` accepts null explicitly, so a wrong identification can be unlinked
 * without deleting the plant.
 */
export const updatePlantSchema = z
  .object({
    nickname: nickname.optional(),
    spaceId: uuid('space id').optional(),
    catalogEntryId: uuid('catalog entry id').nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const plantIdParamSchema = z.object({
  id: uuid('plant id'),
});

/** Omitting `spaceId` lists every plant the user owns, across all spaces. */
export const listPlantsQuerySchema = z.object({
  spaceId: uuid('space id').optional(),
  addedVia: addedVia.optional(),
});

export type CreatePlantInput = z.infer<typeof createPlantSchema>;
export type UpdatePlantInput = z.infer<typeof updatePlantSchema>;
export type PlantIdParam = z.infer<typeof plantIdParamSchema>;
export type ListPlantsQuery = z.infer<typeof listPlantsQuerySchema>;
