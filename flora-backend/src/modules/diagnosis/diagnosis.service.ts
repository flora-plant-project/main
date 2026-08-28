import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { InternalError, NotFoundError, ValidationError } from '../../lib/errors';
import {
  buildUploadKey,
  createPresignedUploadUrl,
  isOwnedKey,
  mediaUrl,
  type AllowedImageType,
} from '../../lib/s3';
import { CURSOR_ORDER_BY, mapPage, paginate, type Page } from '../../lib/pagination';
import { recognize } from './recognition.adapter';
import type { CreateDiagnosisInput, ListDiagnosesQuery } from './diagnosis.schema';

const publicDiagnosis = {
  id: true,
  plantId: true,
  imageKey: true,
  resultType: true,
  source: true,
  status: true,
  speciesGuess: true,
  healthStatus: true,
  disease: true,
  confidence: true,
  flaggedLowConfidence: true,
  createdAt: true,
} as const satisfies Prisma.DiagnosisResultSelect;

type DiagnosisRow = Prisma.DiagnosisResultGetPayload<{ select: typeof publicDiagnosis }>;

/** `rawResponse` is stored but never returned — it is provider-shaped, not a contract. */
export type PublicDiagnosis = Omit<DiagnosisRow, 'imageKey'> & { imageUrl: string };

/** The stored key is presentation-independent; the delivery URL is resolved on read. */
const toPublic = ({ imageKey, ...rest }: DiagnosisRow): PublicDiagnosis => ({
  ...rest,
  imageUrl: mediaUrl(imageKey),
});

/**
 * Diagnoses carry no userId of their own — ownership is inherited through the plant, so
 * every query filters on the relation. Same structural guarantee as elsewhere: the check
 * is part of the query and cannot be skipped.
 */
const ownedByUser = (userId: string): Prisma.DiagnosisResultWhereInput => ({
  plant: { userId },
});

/** Step 1: hand the client a presigned URL so image bytes never pass through the API. */
export const createUploadUrl = async (
  userId: string,
  contentType: AllowedImageType,
): Promise<{ uploadUrl: string; imageKey: string; expiresIn: number }> => {
  const imageKey = buildUploadKey(userId, contentType);
  const { uploadUrl, expiresIn } = await createPresignedUploadUrl(imageKey, contentType);

  return { uploadUrl, imageKey, expiresIn };
};

/**
 * Step 2: confirm the upload and run recognition.
 *
 * Returns `{ id, result }` rather than the result alone. When recognition moves to the
 * real asynchronous pipeline, this same endpoint can answer `{ id, status: 'PENDING' }`
 * and the client fetches by id — additive, with nothing existing breaking.
 */
export const createDiagnosis = async (
  userId: string,
  input: CreateDiagnosisInput,
): Promise<{ id: string; result: PublicDiagnosis }> => {
  // The key is client-supplied. Without this, a caller could confirm a diagnosis against
  // an image uploaded by someone else.
  if (!isOwnedKey(userId, input.imageKey)) {
    throw new ValidationError('Image key does not belong to this user.');
  }

  const plant = await prisma.plant.findFirst({
    where: { id: input.plantId, userId },
    select: { id: true },
  });

  // Same response whether the plant is absent or someone else's.
  if (!plant) throw new NotFoundError('Plant not found.');

  const recognition = await recognize(input.resultType, input.imageKey);

  // Second line of defence behind the adapter's own check: nothing stamped MOCK is ever
  // written to a production database.
  if (recognition.source === 'MOCK' && env.isProduction) {
    throw new InternalError('Refusing to persist a mocked diagnosis in production.');
  }

  const row = await prisma.diagnosisResult.create({
    data: {
      plantId: input.plantId,
      imageKey: input.imageKey,
      resultType: recognition.resultType,
      source: recognition.source,
      status: 'COMPLETE',
      speciesGuess: recognition.species.scientificName,
      healthStatus: recognition.health?.status ?? null,
      disease: recognition.health?.disease ?? null,
      confidence: recognition.confidence,
      rawResponse: recognition.raw as Prisma.InputJsonValue,
      // Below the threshold the result is shown as uncertain and can be escalated to the
      // community rather than presented as an answer.
      flaggedLowConfidence: recognition.confidence < env.DIAGNOSIS_CONFIDENCE_THRESHOLD,
    },
    select: publicDiagnosis,
  });

  return { id: row.id, result: toPublic(row) };
};

export const listDiagnoses = async (
  userId: string,
  query: ListDiagnosesQuery,
): Promise<Page<PublicDiagnosis>> => {
  const page = await paginate(query, (args) =>
    prisma.diagnosisResult.findMany({
      ...args,
      where: {
        ...ownedByUser(userId),
        ...(query.plantId ? { plantId: query.plantId } : {}),
        ...(query.resultType ? { resultType: query.resultType } : {}),
        ...(query.flaggedLowConfidence !== undefined
          ? { flaggedLowConfidence: query.flaggedLowConfidence }
          : {}),
      },
      select: publicDiagnosis,
      orderBy: [...CURSOR_ORDER_BY],
    }),
  );

  return mapPage(page, toPublic);
};

export const getDiagnosis = async (
  userId: string,
  id: string,
): Promise<PublicDiagnosis> => {
  const row = await prisma.diagnosisResult.findFirst({
    where: { id, ...ownedByUser(userId) },
    select: publicDiagnosis,
  });

  if (!row) throw new NotFoundError('Diagnosis not found.');
  return toPublic(row);
};
