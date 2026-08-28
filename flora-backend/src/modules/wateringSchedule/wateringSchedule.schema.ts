import { z } from 'zod';

const uuid = (label: string) => z.string().uuid(`Invalid ${label}.`);

/** Upper bound is a sanity check, not a horticultural rule — a year between waterings. */
const intervalDays = z
  .number()
  .int('Interval must be a whole number of days.')
  .min(1, 'Interval must be at least 1 day.')
  .max(365, 'Interval must be at most 365 days.');

/** Accepts an ISO string from the client and yields a Date. */
const nextDueAt = z.coerce.date();

/**
 * Omitting `nextDueAt` starts the cycle one interval from now, which is what a user
 * adding a schedule right after watering expects.
 */
export const createWateringScheduleSchema = z.object({
  plantId: uuid('plant id'),
  intervalDays,
  nextDueAt: nextDueAt.optional(),
  active: z.boolean().default(true),
});

/**
 * Activating a schedule deactivates the plant's current active one — the database
 * enforces at most one via a partial unique index, and the service makes the swap
 * transactionally rather than letting the constraint surface as an error.
 */
export const updateWateringScheduleSchema = z
  .object({
    intervalDays: intervalDays.optional(),
    nextDueAt: nextDueAt.optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const wateringScheduleIdParamSchema = z.object({
  id: uuid('watering schedule id'),
});

export const listWateringSchedulesQuerySchema = z.object({
  plantId: uuid('plant id').optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type CreateWateringScheduleInput = z.infer<typeof createWateringScheduleSchema>;
export type UpdateWateringScheduleInput = z.infer<typeof updateWateringScheduleSchema>;
export type WateringScheduleIdParam = z.infer<typeof wateringScheduleIdParamSchema>;
export type ListWateringSchedulesQuery = z.infer<typeof listWateringSchedulesQuerySchema>;
