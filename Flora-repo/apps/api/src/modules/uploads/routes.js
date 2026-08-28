import express, { Router } from 'express';
import { ErrorCode, fail, ok } from '@flora/shared';
import { send } from '../../lib/respond.js';
import { StorageKeyError, StorageMissingError } from '../../storage/index.js';

/** Rebuild the key from the wildcard segments after the /uploads mount point. */
const keyFrom = (params) =>
  `uploads/${[].concat(params.rest ?? []).join('/')}`.replace(/\/+$/, '');

/** A content type header without its parameters: "image/jpeg; charset=x" -> "image/jpeg". */
const bareType = (header) => String(header ?? '').split(';')[0].trim();

/**
 * Upload routes.
 *
 * POST /uploads is the whole public interface — it signs a URL, and the client
 * PUTs its bytes there. Where that URL points depends on the driver: at S3 in a
 * deployed environment, and at the two routes below when uploads are on local
 * disk, so the offline demo runs the same client code path as production.
 *
 * @param {{
 *   service: ReturnType<import('./service.js').createUploadsService>,
 *   storage: object,
 *   maxImageBytes: number,
 * }} deps
 */
export function createUploadsRoutes({ service, storage, maxImageBytes }) {
  const router = Router();

  router.post('/', async (req, res) => {
    send(res, await service.create(req.body), 201);
  });

  // Only the local driver serves its own bytes; with S3 the phone talks to the
  // bucket and the CDN directly and these routes would never be reached.
  if (typeof storage.verifyUpload !== 'function') return router;

  router.put(
    '/*rest',
    express.raw({ type: () => true, limit: maxImageBytes }),
    async (req, res) => {
      const key = keyFrom(req.params);
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

      // The signature covers the byte count and the content type, so a client
      // that sends a different image than the one it asked to upload fails
      // here rather than quietly overwriting a key with something else.
      const reason = storage.verifyUpload({
        key,
        contentType: bareType(req.get('content-type')),
        byteLength: body.length,
        expires: req.query.expires,
        signature: req.query.signature,
      });
      if (reason) return send(res, fail(ErrorCode.VALIDATION, reason));

      await storage.put(key, body);
      send(res, ok({ key }), 201);
    },
  );

  router.get('/*rest', async (req, res) => {
    const key = keyFrom(req.params);
    try {
      const { body, contentType } = await storage.read(key);
      // Keys are unique per upload and their bytes never change, so this is
      // safe to cache forever — the app renders these in a scrolling feed.
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.type(contentType).send(body);
    } catch (error) {
      if (error instanceof StorageMissingError || error instanceof StorageKeyError) {
        return send(res, fail(ErrorCode.NOT_FOUND, `no image at ${key}`));
      }
      throw error;
    }
  });

  return router;
}
