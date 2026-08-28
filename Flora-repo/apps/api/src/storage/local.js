import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isUploadKey } from '@flora/shared';
import { contentTypeForKey, mintUploadKey, sniffImageType } from './key.js';

/** Thrown when a key names something this driver will not touch. */
export class StorageKeyError extends Error {}

/** Thrown when bytes are asked for and are not there. */
export class StorageMissingError extends Error {}

/**
 * Filesystem-backed storage: the driver that makes uploads work with no cloud
 * account, no credentials and no network.
 *
 * It mimics the S3 driver rather than shortcutting it. A client still asks for
 * an upload URL, still PUTs the bytes to that URL, and still gets a key back —
 * the URL just points at this API's own /uploads routes. Same client code path
 * as production, which is the point: the offline demo exercises the real one.
 *
 * The signature is what stands in for S3's presigning. It binds the key, the
 * content type, the exact byte count and an expiry, so a leaked URL cannot be
 * reused to write something else, something bigger, or anything at all an hour
 * later.
 *
 * @param {{
 *   dir: string,
 *   secret: string,
 *   baseUrl: string,
 *   ttlMs: number,
 *   now?: () => number,
 * }} deps
 */
export function createLocalStorage({ dir, secret, baseUrl, ttlMs, now = Date.now }) {
  const root = path.resolve(dir);
  const base = baseUrl.replace(/\/+$/, '');

  /**
   * Absolute path for a key, refusing anything that is not one of ours.
   * @param {string} key
   */
  function pathFor(key) {
    if (!isUploadKey(key)) throw new StorageKeyError(`not an upload key: ${key}`);
    return path.join(root, key);
  }

  /**
   * @param {{key: string, contentType: string, byteLength: number, expires: number}} claim
   */
  function sign({ key, contentType, byteLength, expires }) {
    return createHmac('sha256', secret)
      .update([key, contentType, String(byteLength), String(expires)].join('\n'))
      .digest('hex');
  }

  return {
    driver: 'local',

    /**
     * Reserve a key and hand back the URL to PUT the bytes to.
     * @param {{contentType: string, byteLength: number}} input
     */
    async createUpload({ contentType, byteLength }) {
      const key = mintUploadKey(contentType, { now });
      const expires = now() + ttlMs;
      const signature = sign({ key, contentType, byteLength, expires });
      const query = new URLSearchParams({ expires: String(expires), signature });

      return {
        key,
        method: 'PUT',
        uploadUrl: `${base}/${key}?${query}`,
        headers: { 'Content-Type': contentType },
        expiresAt: new Date(expires).toISOString(),
      };
    },

    /**
     * Check a signed upload URL before accepting its body.
     *
     * Returns a reason rather than throwing: the route turns it into a
     * VALIDATION envelope, and every branch here is a client mistake.
     *
     * @param {{key: string, contentType: string, byteLength: number, expires: unknown, signature: unknown}} claim
     * @returns {string|null} the reason it was rejected, or null when it is good
     */
    verifyUpload({ key, contentType, byteLength, expires, signature }) {
      if (!isUploadKey(key)) return 'not an upload key';

      const expiry = Number(expires);
      if (!Number.isFinite(expiry)) return 'malformed expiry';
      if (expiry < now()) return 'this upload URL has expired';

      const expected = sign({ key, contentType, byteLength, expires: expiry });
      const given = Buffer.from(String(signature ?? ''), 'utf8');
      const wanted = Buffer.from(expected, 'utf8');
      // Length check first: timingSafeEqual throws on a length mismatch, and an
      // attacker learning only "wrong length" costs nothing.
      if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
        return 'signature does not match this upload';
      }
      return null;
    },

    /**
     * @param {string} key
     * @param {Buffer} body
     */
    async put(key, body) {
      const target = pathFor(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },

    /**
     * Write bytes this API already holds, minting the key itself.
     *
     * The inline-base64 scan path uses this: there was no signed URL, so the
     * type comes from the bytes rather than from a client's word for it.
     *
     * @param {Buffer} body
     * @returns {Promise<string>} the key
     */
    async putBytes(body) {
      const key = mintUploadKey(sniffImageType(body), { now });
      const target = pathFor(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
      return key;
    },

    /**
     * Promote an upload from PENDING to ATTACHED.
     *
     * A no-op here beyond validating the key: nothing sweeps the dev
     * directory, and a developer's disk is not billed by the gigabyte-month.
     * It exists so services can call it unconditionally — the alternative is
     * every call site knowing which driver it is talking to.
     *
     * @param {string} key
     */
    async markAttached(key) {
      pathFor(key);
    },

    /**
     * @param {string} key
     * @returns {Promise<{body: Buffer, contentType: string}>}
     */
    async read(key) {
      try {
        return { body: await readFile(pathFor(key)), contentType: contentTypeForKey(key) };
      } catch (error) {
        if (error instanceof StorageKeyError) throw error;
        if (error?.code === 'ENOENT') throw new StorageMissingError(`no object at ${key}`);
        throw error;
      }
    },

    /**
     * Where a phone can fetch this object. Derived, never stored — see
     * packages/shared/src/media.js.
     * @param {string} key
     */
    publicUrl(key) {
      return `${base}/${key}`;
    },
  };
}
