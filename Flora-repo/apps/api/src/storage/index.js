import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as defaultConfig } from '../config.js';
import { createLocalStorage } from './local.js';
import { createS3Storage } from './s3.js';

export { StorageKeyError, StorageMissingError, createLocalStorage } from './local.js';
export { createS3Storage } from './s3.js';
export { contentTypeForKey, mintUploadKey } from './key.js';

/** apps/api, so a relative FLORA_UPLOAD_DIR does not depend on the cwd. */
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Pick a storage driver.
 *
 * With FLORA_S3_BUCKET set you get S3; without one you get the local disk, the
 * same way an unset PLANT_ID_API_KEY gets you the stub recognizer. Both drivers
 * expose the same four operations and both mint the same keys, so the choice
 * changes where bytes land and nothing else.
 *
 * S3 additionally needs FLORA_MEDIA_BASE_URL — the CDN in front of the bucket.
 * Failing at startup is deliberate: the alternative is an API that runs happily
 * and hands out image URLs nobody can open.
 *
 * @param {ReturnType<import('../config.js').loadConfig>} [settings]
 * @param {{logger?: Pick<Console, 'info'>}} [options]
 */
export function createStorage(settings = defaultConfig, { logger = console } = {}) {
  if (settings.s3Bucket) {
    if (!settings.mediaBaseUrl) {
      throw new Error(
        'FLORA_MEDIA_BASE_URL is required when FLORA_S3_BUCKET is set: it is the CDN ' +
          'domain in front of the (private) bucket, and it is how uploaded photos are read.',
      );
    }
    logger.info(`[storage] using S3 bucket ${settings.s3Bucket} in ${settings.s3Region}`);
    return createS3Storage({
      bucket: settings.s3Bucket,
      region: settings.s3Region,
      publicBaseUrl: settings.mediaBaseUrl,
      ttlMs: settings.uploadUrlTtlMs,
    });
  }

  const dir = path.resolve(API_ROOT, settings.uploadDir);
  logger.info(
    `[storage] FLORA_S3_BUCKET is unset — storing uploads on disk at ${dir}. ` +
      'Set a bucket to use S3.',
  );
  return createLocalStorage({
    dir,
    secret: settings.uploadSecret,
    // Local uploads are served by this API, so the address a phone uses is the
    // API's own — which on a device is a LAN address, not localhost.
    baseUrl: settings.mediaBaseUrl || `http://localhost:${settings.port}`,
    ttlMs: settings.uploadUrlTtlMs,
  });
}
