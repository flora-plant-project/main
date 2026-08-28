import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import type {
  CreateWateringScheduleInput,
  ListWateringSchedulesQuery,
  UpdateWateringScheduleInput,
} from './wateringSchedule.schema';

const publicSchedule = {
  id: true,
  plantId: true,
  intervalDays: true,
  nextDueAt: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.WateringScheduleSelect;

export type PublicWateringSchedule = Prisma.WateringScheduleGetPayload<{
  select: typeof publicSchedule;
}>;

/** Schedules carry no userId; ownership is inherited through the plant relation. */
const ownedByUser = (userId: string): Prisma.WateringScheduleWhereInput => ({
  plant: { userId },
});

const assertOwnedPlant = async (userId: string, plantId: string): Promise<void> => {
  const plant = await prisma.plant.findFirst({
    where: { id: plantId, userId },
    select: { id: true },
  });

  if (!plant) throw new NotFoundError('Plant not found.');
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const defaultNextDueAt = (intervalDays: number): Date =>
  new Date(Date.now() + intervalDays * MS_PER_DAY);

/**
 * At most one ACTIVE schedule per plant, enforced by a partial unique index
 * (`WHERE active`) added by hand in the init migration.
 *
 * The service treats that index as a backstop, not as the mechanism: activating a
 * schedule deactivates the plant's current active one inside a transaction, so the user
 * sees a clean replacement rather than a 409 telling them to go undo something first.
 * Both statements commit together, so a concurrent request cannot leave two active.
 */
export const createSchedule = async (
  userId: string,
  input: CreateWateringScheduleInput,
): Promise<PublicWateringSchedule> => {
  await assertOwnedPlant(userId, input.plantId);

  const data = {
    plantId: input.plantId,
    intervalDays: input.intervalDays,
    nextDueAt: input.nextDueAt ?? defaultNextDueAt(input.intervalDays),
    active: input.active,
  };

  return prisma.$transaction(async (tx) => {
    if (data.active) {
      await tx.wateringSchedule.updateMany({
        where: { plantId: input.plantId, active: true },
        data: { active: false },
      });
    }

    return tx.wateringSchedule.create({ data, select: publicSchedule });
  });
};

/**
 * Intentionally unpaginated: bounded by the caller's plant count, and at most one
 * schedule per plant is active at a time.
 */
export const listSchedules = async (
  userId: string,
  query: ListWateringSchedulesQuery,
): Promise<PublicWateringSchedule[]> =>
  prisma.wateringSchedule.findMany({
    where: {
      ...ownedByUser(userId),
      ...(query.plantId ? { plantId: query.plantId } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
    },
    select: publicSchedule,
    orderBy: { nextDueAt: 'asc' },
  });

export const getSchedule = async (
  userId: string,
  id: string,
): Promise<PublicWateringSchedule> => {
  const schedule = await prisma.wateringSchedule.findFirst({
    where: { id, ...ownedByUser(userId) },
    select: publicSchedule,
  });

  if (!schedule) throw new NotFoundError('Watering schedule not found.');
  return schedule;
};

/**
 * Reactivating a dormant schedule performs the same swap as create — otherwise the
 * partial index would reject it whenever another schedule is already active.
 */
export const updateSchedule = async (
  userId: string,
  id: string,
  input: UpdateWateringScheduleInput,
): Promise<PublicWateringSchedule> => {
  // Establishes ownership before anything is written, and gives us the plant id.
  const existing = await prisma.wateringSchedule.findFirst({
    where: { id, ...ownedByUser(userId) },
    select: { id: true, plantId: true },
  });

  if (!existing) throw new NotFoundError('Watering schedule not found.');

  return prisma.$transaction(async (tx) => {
    if (input.active === true) {
      await tx.wateringSchedule.updateMany({
        where: { plantId: existing.plantId, active: true, id: { not: existing.id } },
        data: { active: false },
      });
    }

    return tx.wateringSchedule.update({
      where: { id: existing.id },
      data: input,
      select: publicSchedule,
    });
  });
};

/**
 * Unguarded: a schedule is metadata about future reminders, not a record of anything
 * that happened, so deleting it destroys no history.
 */
export const deleteSchedule = async (userId: string, id: string): Promise<void> => {
  const { count } = await prisma.wateringSchedule.deleteMany({
    where: { id, ...ownedByUser(userId) },
  });

  if (count === 0) throw new NotFoundError('Watering schedule not found.');
};
