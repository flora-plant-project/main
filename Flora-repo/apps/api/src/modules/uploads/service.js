import { CreateUploadSchema, ErrorCode, fail, ok } from '@flora/shared';
import { parseWith } from '../../lib/validate.js';

/**
 * Create the uploads service.
 *
 * One job: hand out somewhere to put an image. The bytes themselves go to the
 * storage driver over the URL this returns, not through here — which is the
 * whole reason the endpoint exists.
 *
 * @param {{storage: {createUpload: Function, publicUrl: (key: string) => string}, maxImageBytes: number}} deps
 */
export function createUploadsService({ storage, maxImageBytes }) {
  return {
    /**
     * Reserve a key and sign an upload URL for it.
     *
     * Anonymous callers are allowed, exactly as they are for a scan: the first
     * thing someone does with Flora is photograph a plant, and demanding an
     * account before that is the wrong trade. The key is unguessable, the URL
     * expires, and the signature pins the byte count — a stranger gets one
     * short-lived slot for one image of a size they declared in advance.
     *
     * @param {unknown} input
     */
    async create(input) {
      const { data, error } = parseWith(CreateUploadSchema, input);
      if (error) return error;

      if (data.byteLength > maxImageBytes) {
        return fail(
          ErrorCode.VALIDATION,
          `Image is ${Math.round(data.byteLength / 1024)}KB; the limit is ${Math.round(
            maxImageBytes / 1024,
          )}KB`,
        );
      }

      const upload = await storage.createUpload(data);
      // `url` is where the image will be readable once the PUT lands. Handing
      // it back now means a client never has to know how a key becomes a URL.
      return ok({ ...upload, url: storage.publicUrl(upload.key) });
    },
  };
}
