import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ConflictError, NotFoundError } from '../../lib/errors';
import type {
  CreateSpaceInput,
  ListSpacesQuery,
  UpdateSpaceInput,
} from './garden.schema';

/**
 * Public shape of a space. `_count.plants` saves the client a second request just to
 * render "3 plants" on a garden card.
 */
const publicSpace = {
  id: true,
  type: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { plants: true } },
} as const satisfies Prisma.SpaceSelect;

export type PublicSpace = Prisma.SpaceGetPayload<{ select: typeof publicSpace }>;

/**
 * Ownership is enforced structurally: `userId` is part of the `where` on every read and
 * write, so a space belonging to someone else is simply not found.
 *
 * That is deliberate — returning 403 for another user's row would confirm the row exists
 * and leak the id space. 403 is reserved for role failures (moderator/admin).
 */
const ownedSpace = (userId: string, id: string): Prisma.SpaceWhereInput => ({ id, userId });

/**
 * Intentionally unpaginated: a user owns a handful of spaces — balcony, backyard, indoor,
 * rooftop — so the result is naturally bounded. Do not add a cursor here; it would cost a
 * client-contract change for no benefit.
 */
export const listSpaces = async (
  userId: string,
  query: ListSpacesQuery,
): Promise<PublicSpace[]> =>
  prisma.space.findMany({
    where: { userId, ...(query.type ? { type: query.type } : {}) },
    select: publicSpace,
    orderBy: { createdAt: 'asc' },
  });

export const getSpace = async (userId: string, id: string): Promise<PublicSpace> => {
  const space = await prisma.space.findFirst({
    where: ownedSpace(userId, id),
    select: publicSpace,
  });

  if (!space) throw new NotFoundError('Space not found.');
  return space;
};

export const createSpace = async (
  userId: string,
  input: CreateSpaceInput,
): Promise<PublicSpace> =>
  prisma.space.create({
    data: { userId, type: input.type, name: input.name },
    select: publicSpace,
  });

/**
 * Ownership is re-checked here rather than relying on `update`, whose `where` accepts
 * unique fields only — passing an id alone would happily update another user's row.
 */
export const updateSpace = async (
  userId: string,
  id: string,
  input: UpdateSpaceInput,
): Promise<PublicSpace> => {
  const { count } = await prisma.space.updateMany({
    where: ownedSpace(userId, id),
    data: input,
  });

  if (count === 0) throw new NotFoundError('Space not found.');

  // updateMany cannot return the row, so re-read it with the public shape.
  return getSpace(userId, id);
};

/**
 * Deletes an empty space only. A space with plants returns 409.
 *
 * The schema cascades Space → Plant → diagnoses, growth logs and watering schedules, so
 * an unguarded delete would destroy a plant's entire health timeline with no undo. Those
 * timelines are the product, not incidental rows, so the refusal lives here rather than
 * relying on the mobile client to warn.
 *
 * The `plants: { none: {} }` filter makes the check and the delete a single statement —
 * a plant added between a separate check and delete could not slip through.
 */
export const deleteSpace = async (userId: string, id: string): Promise<void> => {
  const { count } = await prisma.space.deleteMany({
    where: { ...ownedSpace(userId, id), plants: { none: {} } },
  });

  if (count > 0) return;

  // Nothing deleted: either the space is not the user's (or absent), or it has plants.
  const existing = await prisma.space.findFirst({
    where: ownedSpace(userId, id),
    select: { id: true },
  });

  if (!existing) throw new NotFoundError('Space not found.');

  throw new ConflictError("Move or delete this space's plants first.");
};
