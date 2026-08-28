import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from '../../lib/errors';
import {
  buildUploadKey,
  createPresignedUploadUrl,
  isOwnedKey,
  mediaUrl,
  type AllowedImageType,
} from '../../lib/s3';
import { CURSOR_ORDER_BY, mapPage, paginate, type Page } from '../../lib/pagination';
import type {
  CreateGrowthLogInput,
  ListGrowthLogsQuery,
  UpdateGrowthLogInput,
} from './growthLog.schema';

const publicGrowthLog = {
  id: true,
  plantId: true,
  imageKey: true,
  note: true,
  createdAt: true,
} as const satisfies Prisma.GrowthLogSelect;

type GrowthLogRow = Prisma.GrowthLogGetPayload<{ select: typeof publicGrowthLog }>;

export type PublicGrowthLog = Omit<GrowthLogRow, 'imageKey'> & { imageUrl: string };

/** Key in, URL out — the delivery domain is resolved per request, never stored. */
const toPublic = ({ imageKey, ...rest }: GrowthLogRow): PublicGrowthLog => ({
  ...rest,
  imageUrl: mediaUrl(imageKey),
});

/** Growth logs carry no userId; ownership is inherited through the plant relation. */
const ownedByUser = (userId: string): Prisma.GrowthLogWhereInput => ({ plant: { userId } });

/** Cross-resource check, same shape as everywhere: absent and not-yours are identical. */
const assertOwnedPlant = async (userId: string, plantId: string): Promise<void> => {
  const plant = await prisma.plant.findFirst({
    where: { id: plantId, userId },
    select: { id: true },
  });

  if (!plant) throw new NotFoundError('Plant not found.');
};

/** Step 1: presigned URL, so image bytes never pass through the API. */
export const createUploadUrl = async (
  userId: string,
  contentType: AllowedImageType,
): Promise<{ uploadUrl: string; imageKey: string; expiresIn: number }> => {
  const imageKey = buildUploadKey(userId, contentType);
  const { uploadUrl, expiresIn } = await createPresignedUploadUrl(imageKey, contentType);

  return { uploadUrl, imageKey, expiresIn };
};

export const createGrowthLog = async (
  userId: string,
  input: CreateGrowthLogInput,
): Promise<PublicGrowthLog> => {
  // Client-supplied key: without this check a caller could attach someone else's image.
  if (!isOwnedKey(userId, input.imageKey)) {
    throw new ValidationError('Image key does not belong to this user.');
  }

  await assertOwnedPlant(userId, input.plantId);

  const row = await prisma.growthLog.create({ data: input, select: publicGrowthLog });
  return toPublic(row);
};

export const listGrowthLogs = async (
  userId: string,
  query: ListGrowthLogsQuery,
): Promise<Page<PublicGrowthLog>> => {
  const page = await paginate(query, (args) =>
    prisma.growthLog.findMany({
      ...args,
      where: {
        ...ownedByUser(userId),
        ...(query.plantId ? { plantId: query.plantId } : {}),
      },
      select: publicGrowthLog,
      // Newest first: the timeline is read from the present backwards.
      orderBy: [...CURSOR_ORDER_BY],
    }),
  );

  return mapPage(page, toPublic);
};

export const getGrowthLog = async (
  userId: string,
  id: string,
): Promise<PublicGrowthLog> => {
  const row = await prisma.growthLog.findFirst({
    where: { id, ...ownedByUser(userId) },
    select: publicGrowthLog,
  });

  if (!row) throw new NotFoundError('Growth log not found.');
  return toPublic(row);
};

/** Note only — see the schema for why the image is immutable. */
export const updateGrowthLog = async (
  userId: string,
  id: string,
  input: UpdateGrowthLogInput,
): Promise<PublicGrowthLog> => {
  const { count } = await prisma.growthLog.updateMany({
    where: { id, ...ownedByUser(userId) },
    data: input,
  });

  if (count === 0) throw new NotFoundError('Growth log not found.');

  return getGrowthLog(userId, id);
};

/**
 * Unguarded: the entry is exactly what the user asked to remove, and nothing cascades
 * from it. The S3 object is left in place — deleting it would need a bucket write on the
 * request path, and the lifecycle rule does not cover confirmed uploads. Orphaned media
 * cleanup is deferred; flagged here rather than silently ignored.
 */
export const deleteGrowthLog = async (userId: string, id: string): Promise<void> => {
  const { count } = await prisma.growthLog.deleteMany({
    where: { id, ...ownedByUser(userId) },
  });

  if (count === 0) throw new NotFoundError('Growth log not found.');
};
