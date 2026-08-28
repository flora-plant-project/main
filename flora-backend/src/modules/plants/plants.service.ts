import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import type {
  CreatePlantInput,
  ListPlantsQuery,
  UpdatePlantInput,
} from './plants.schema';

/**
 * `catalogEntry` is nested but optional — it resolves to null for every plant added by
 * name, which is the normal case while the species catalog has no data source. Consumers
 * must treat null as valid, not missing.
 */
const publicPlant = {
  id: true,
  nickname: true,
  addedVia: true,
  spaceId: true,
  catalogEntryId: true,
  createdAt: true,
  updatedAt: true,
  catalogEntry: {
    select: { id: true, scientificName: true, commonNameEn: true, commonNameAr: true },
  },
} as const satisfies Prisma.PlantSelect;

export type PublicPlant = Prisma.PlantGetPayload<{ select: typeof publicPlant }>;

/** Plant-level ownership, same structural pattern as the garden module. */
const ownedPlant = (userId: string, id: string): Prisma.PlantWhereInput => ({ id, userId });

/**
 * Cross-resource ownership check — the template for every later write that references
 * another owned row (growth log → plant, diagnosis → plant, comment → post).
 *
 * Two properties matter and must be preserved when this is copied:
 *
 *  1. `userId` is part of the query, not a comparison made afterwards. There is no
 *     window between reading the row and deciding, and no way to forget the check.
 *  2. "No such space" and "someone else's space" raise the identical error. Splitting
 *     them into distinct messages would turn this endpoint into a probe for which space
 *     ids exist.
 */
const assertOwnedSpace = async (userId: string, spaceId: string): Promise<void> => {
  const space = await prisma.space.findFirst({
    where: { id: spaceId, userId },
    select: { id: true },
  });

  if (!space) throw new NotFoundError('Space not found.');
};

/**
 * Intentionally unpaginated: a hobby gardener's plant count is bounded in practice.
 * Diagnoses and growth logs are the unbounded reads and are cursor-paginated instead.
 */
export const listPlants = async (
  userId: string,
  query: ListPlantsQuery,
): Promise<PublicPlant[]> =>
  prisma.plant.findMany({
    where: {
      userId,
      ...(query.spaceId ? { spaceId: query.spaceId } : {}),
      ...(query.addedVia ? { addedVia: query.addedVia } : {}),
    },
    select: publicPlant,
    orderBy: { createdAt: 'desc' },
  });

export const getPlant = async (userId: string, id: string): Promise<PublicPlant> => {
  const plant = await prisma.plant.findFirst({
    where: ownedPlant(userId, id),
    select: publicPlant,
  });

  if (!plant) throw new NotFoundError('Plant not found.');
  return plant;
};

export const createPlant = async (
  userId: string,
  input: CreatePlantInput,
): Promise<PublicPlant> => {
  await assertOwnedSpace(userId, input.spaceId);

  return prisma.plant.create({
    data: { ...input, userId },
    select: publicPlant,
  });
};

/**
 * A move is a cross-resource write too, so the target space is ownership-checked here
 * exactly as it is on create — otherwise a user could relocate a plant into someone
 * else's garden by editing it rather than creating it.
 */
export const updatePlant = async (
  userId: string,
  id: string,
  input: UpdatePlantInput,
): Promise<PublicPlant> => {
  if (input.spaceId) {
    await assertOwnedSpace(userId, input.spaceId);
  }

  const { count } = await prisma.plant.updateMany({
    where: ownedPlant(userId, id),
    data: input,
  });

  if (count === 0) throw new NotFoundError('Plant not found.');

  return getPlant(userId, id);
};

/**
 * Cascades to the plant's diagnoses, growth logs and watering schedules.
 *
 * Unguarded on purpose, unlike deleting a space: here the plant is what the user asked
 * to remove, so the loss is intended rather than a hidden side effect. The client should
 * still confirm, since the health timeline goes with it.
 */
export const deletePlant = async (userId: string, id: string): Promise<void> => {
  const { count } = await prisma.plant.deleteMany({ where: ownedPlant(userId, id) });

  if (count === 0) throw new NotFoundError('Plant not found.');
};
