import { randomUUID } from 'node:crypto';
import { UPLOAD_KEY_PREFIX, UploadExtensions } from '@flora/shared';

/**
 * Mint a key for a new upload: `uploads/<year>/<uuid>.<ext>`.
 *
 * The year is a prefix, not metadata — it keeps a bucket listing browsable and
 * gives lifecycle rules something to bite on. The uuid is what makes the key
 * unguessable, which matters because it is also the address the photo is
 * served from.
 *
 * @param {string} contentType one of UploadContentTypes
 * @param {{now?: () => number, uuid?: () => string}} [deps]
 * @returns {string}
 */
export function mintUploadKey(contentType, { now = Date.now, uuid = randomUUID } = {}) {
  const extension = UploadExtensions[contentType];
  if (!extension) throw new Error(`unsupported content type: ${contentType}`);
  return `${UPLOAD_KEY_PREFIX}${new Date(now()).getUTCFullYear()}/${uuid()}.${extension}`;
}

/**
 * Content type implied by a key's extension. Used when serving bytes back.
 * @param {string} key
 * @returns {string}
 */
export function contentTypeForKey(key) {
  const extension = key.slice(key.lastIndexOf('.') + 1);
  const match = Object.entries(UploadExtensions).find(([, value]) => value === extension);
  return match ? match[0] : 'application/octet-stream';
}

/**
 * Content type of a raw image, read from its magic bytes.
 *
 * Used for the inline-base64 path, where the client sends bytes with no
 * declared type. Sniffing beats trusting: the type decides the key's extension,
 * which decides what this API later serves the bytes back as.
 *
 * @param {Buffer} body
 * @returns {string} one of UploadContentTypes; defaults to image/jpeg
 */
export function sniffImageType(body) {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return 'image/jpeg';
  }
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString('ascii') === 'RIFF' &&
    body.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}
