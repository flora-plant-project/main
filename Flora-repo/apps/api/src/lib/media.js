import { isUploadKey } from '@flora/shared';

/**
 * Keys go in the database; URLs go on the wire.
 *
 * Rows store what was uploaded (`uploads/2026/<uuid>.jpg`) and views expand it
 * to something a phone can fetch, every read. Nothing persists a hostname, so
 * moving the CDN, the bucket or the dev machine's LAN address rewrites no data.
 *
 * Anything that is not one of our keys passes through untouched — the seeded
 * demo photos are bundled asset paths ('assets/demo/plant-2.jpg') that the app
 * resolves locally, and they must stay exactly as the mock client returns them.
 */

/** @param {string|null|undefined} value */
export const identityImage = (value) => value ?? null;

/**
 * @param {{publicUrl: (key: string) => string}} storage
 * @returns {(value: string|null|undefined) => string|null}
 */
export function createImageMapper(storage) {
  return (value) => (isUploadKey(value) ? storage.publicUrl(value) : identityImage(value));
}

/** No storage wired up: nothing to keep, nothing to expire. */
export const noopAttach = async () => {};

/**
 * Mark uploads as kept, once a row references them.
 *
 * Uploads land tagged pending and the bucket deletes them after a week, so a
 * photo only survives if something calls this — which is deliberate: an
 * abandoned scan should not become storage that is billed forever. Call it
 * AFTER the row is written, so a failed insert leaves the object collectable.
 *
 * Failures are logged, never thrown. The row is already saved by then, and
 * losing the retag costs one photo a week later; failing the request over it
 * would cost the user the thing they just did.
 *
 * @param {{markAttached: (key: string) => Promise<void>}} storage
 * @param {Pick<Console, 'error'>} [logger]
 * @returns {(...values: Array<string|null|undefined|Array<string|null|undefined>>) => Promise<void>}
 */
export function createImageAttacher(storage, logger = console) {
  return async (...values) => {
    for (const value of values.flat()) {
      if (!isUploadKey(value)) continue;
      try {
        await storage.markAttached(value);
      } catch (error) {
        logger.error(`[media] could not mark ${value} as attached:`, error);
      }
    }
  };
}
