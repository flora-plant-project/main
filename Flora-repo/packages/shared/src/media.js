/**
 * Uploaded-media vocabulary, shared by the API and both mobile clients.
 *
 * An upload is addressed by its KEY — `uploads/<year>/<uuid>.<ext>` — and that
 * is what the database stores. The URL a phone can actually open is derived
 * from the key at read time by whichever storage driver is configured, so
 * rotating a CDN domain (or moving from local disk to S3) rewrites no rows.
 */

/** Image types the upload endpoint accepts. Anything else is a VALIDATION error. */
export const UploadContentTypes = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

/** Extension used when minting a key, by content type. */
export const UploadExtensions = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

/** Every upload key starts with this. Demo/bundled asset paths never do. */
export const UPLOAD_KEY_PREFIX = 'uploads/';

/**
 * The exact shape of a key. Narrow on purpose: keys arrive from clients and end
 * up as filesystem paths under the local driver, so anything outside this
 * pattern — traversal, absolute paths, odd extensions — is rejected before it
 * reaches a driver.
 */
export const UPLOAD_KEY_PATTERN =
  /^uploads\/\d{4}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

/**
 * Is this string a key this system minted?
 *
 * Used to tell uploaded media apart from the bundled demo paths the seed and
 * the mock client use ('assets/demo/plant-2.jpg'), which pass through unchanged.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUploadKey(value) {
  return typeof value === 'string' && UPLOAD_KEY_PATTERN.test(value);
}

/**
 * How an uploaded object earns the right to stay.
 *
 * A signed upload URL is handed out before anything references the key, so
 * some fraction of uploads belong to a scan someone abandoned or a post they
 * never published. Those are objects nobody will ever look at, billed by the
 * gigabyte-month forever.
 *
 * So every upload lands tagged pending, the bucket's lifecycle rule deletes
 * pending objects after PENDING_RETENTION_DAYS, and the API retags a key
 * attached the moment a row names it. These constants live here because the
 * API (apps/api/src/storage) and the bucket (infra/src/media-stack.js) are the
 * two halves of that one mechanism and must agree exactly.
 */

/** Tag key both the API and the bucket's lifecycle rule agree on. */
export const LIFECYCLE_TAG = 'flora-state';

/** Uploaded, but no row references it yet. Deleted by lifecycle. */
export const PENDING_STATE = 'pending';

/** A row references this key. Kept. */
export const ATTACHED_STATE = 'attached';

/** How long a pending object survives. */
export const PENDING_RETENTION_DAYS = 7;
