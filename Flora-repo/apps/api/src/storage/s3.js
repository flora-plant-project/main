import {
  GetObjectCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ATTACHED_STATE,
  LIFECYCLE_TAG,
  PENDING_STATE,
  isUploadKey,
} from '@flora/shared';
import { StorageKeyError, StorageMissingError } from './local.js';
import { contentTypeForKey, mintUploadKey, sniffImageType } from './key.js';

/**
 * S3-backed storage.
 *
 * The bucket stays private: phones write through a presigned PUT and read
 * through the CDN in front of it (`publicBaseUrl`), never through bucket ACLs.
 * That is also why `publicBaseUrl` is required rather than optional — the
 * alternative, presigning every read, would put an expiry on URLs the app
 * renders long after they were minted.
 *
 * `ContentLength` goes into the signature, so the URL will only accept the
 * exact number of bytes the client declared up front. An oversized image is
 * refused by S3 itself, without ever reaching this API.
 *
 * @param {{
 *   bucket: string,
 *   region: string,
 *   publicBaseUrl: string,
 *   ttlMs: number,
 *   client?: import('@aws-sdk/client-s3').S3Client,
 *   now?: () => number,
 * }} deps
 */
export function createS3Storage({ bucket, region, publicBaseUrl, ttlMs, client, now = Date.now }) {
  const s3 = client ?? new S3Client({ region });
  const base = publicBaseUrl.replace(/\/+$/, '');

  /** @param {string} key */
  function assertKey(key) {
    if (!isUploadKey(key)) throw new StorageKeyError(`not an upload key: ${key}`);
    return key;
  }

  return {
    driver: 's3',

    /** @param {{contentType: string, byteLength: number}} input */
    async createUpload({ contentType, byteLength }) {
      const key = mintUploadKey(contentType, { now });
      const expiresIn = Math.round(ttlMs / 1000);
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: byteLength,
          // Every upload lands PENDING and the bucket's lifecycle rule deletes
          // it a week later. Only markAttached — called once a row actually
          // references the key — retags it and makes it permanent, so a scan
          // someone abandoned mid-flow does not get stored and billed forever.
          Tagging: `${LIFECYCLE_TAG}=${PENDING_STATE}`,
        }),
        { expiresIn },
      );

      return {
        key,
        method: 'PUT',
        uploadUrl,
        // The tag is part of what was signed, so the client has to send it back
        // verbatim or S3 rejects the PUT.
        headers: {
          'Content-Type': contentType,
          'x-amz-tagging': `${LIFECYCLE_TAG}=${PENDING_STATE}`,
        },
        expiresAt: new Date(now() + ttlMs).toISOString(),
      };
    },

    /**
     * Promote an upload from PENDING to ATTACHED, so lifecycle stops counting
     * down on it.
     *
     * Called after the row that references the key is written, never before:
     * the failure this protects against is a key that no row will ever name.
     *
     * @param {string} key
     */
    async markAttached(key) {
      await s3.send(
        new PutObjectTaggingCommand({
          Bucket: bucket,
          Key: assertKey(key),
          Tagging: { TagSet: [{ Key: LIFECYCLE_TAG, Value: ATTACHED_STATE }] },
        }),
      );
    },

    /**
     * @param {string} key
     * @param {Buffer} body
     */
    async put(key, body) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: assertKey(key),
          Body: body,
          ContentType: contentTypeForKey(key),
        }),
      );
    },

    /**
     * Write bytes this API already holds, minting the key itself — the
     * inline-base64 scan path, which never asked for a signed URL.
     *
     * @param {Buffer} body
     * @returns {Promise<string>} the key
     */
    async putBytes(body) {
      const contentType = sniffImageType(body);
      const key = mintUploadKey(contentType, { now });
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // PENDING like any other upload: the row that names this key is
          // written after this returns, and may still fail.
          Tagging: `${LIFECYCLE_TAG}=${PENDING_STATE}`,
        }),
      );
      return key;
    },

    /**
     * @param {string} key
     * @returns {Promise<{body: Buffer, contentType: string}>}
     */
    async read(key) {
      try {
        const object = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: assertKey(key) }),
        );
        const body = Buffer.from(await object.Body.transformToByteArray());
        return { body, contentType: object.ContentType ?? contentTypeForKey(key) };
      } catch (error) {
        if (error instanceof StorageKeyError) throw error;
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
          throw new StorageMissingError(`no object at ${key}`);
        }
        throw error;
      }
    },

    /** @param {string} key */
    publicUrl(key) {
      return `${base}/${key}`;
    },
  };
}
