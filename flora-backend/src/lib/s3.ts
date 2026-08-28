import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

const client = new S3Client({ region: env.AWS_REGION });

/**
 * Everything the client uploads lands under this prefix. Keeping it stable matters
 * operationally: an S3 lifecycle rule expiring objects under `uploads/` after 24h is what
 * cleans up images that were presigned and uploaded but never confirmed by a follow-up
 * request. That rule is infrastructure, not code — it must be configured on the bucket.
 */
const UPLOAD_PREFIX = 'uploads';

/** Only formats a phone camera produces and the recognition pipeline can read. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSIONS: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Keys embed the owner's id: `uploads/<userId>/<uuid>.<ext>`.
 *
 * That is not decoration. The client hands a key back when confirming an upload, so the
 * server must be able to tell whose object it is without trusting the client — see
 * `isOwnedKey`. Without the owner in the key, one user could confirm a diagnosis against
 * another user's uploaded image.
 */
export const buildUploadKey = (userId: string, contentType: AllowedImageType): string =>
  `${UPLOAD_PREFIX}/${userId}/${randomUUID()}.${EXTENSIONS[contentType]}`;

/** Rejects any key not under the caller's own upload prefix. */
export const isOwnedKey = (userId: string, key: string): boolean =>
  key.startsWith(`${UPLOAD_PREFIX}/${userId}/`) && !key.includes('..');

/**
 * Presigned PUT: the client uploads straight to S3, so image bytes never touch the API.
 * The signature covers the content type, so a client cannot presign a JPEG and upload
 * something else.
 */
export const createPresignedUploadUrl = async (
  key: string,
  contentType: AllowedImageType,
): Promise<{ uploadUrl: string; expiresIn: number }> => {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: env.S3_PRESIGN_EXPIRY_SECONDS,
  });

  return { uploadUrl, expiresIn: env.S3_PRESIGN_EXPIRY_SECONDS };
};

/**
 * Resolves a stored key to a delivery URL at read time, through CloudFront when
 * configured. Because this is computed rather than stored, switching delivery domains
 * needs no data migration.
 */
export const mediaUrl = (key: string): string =>
  env.CLOUDFRONT_DOMAIN
    ? `https://${env.CLOUDFRONT_DOMAIN}/${key}`
    : `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
